/**
 * Processo principal do Electron (abre a janela e lê o arquivo JSON).
 */
const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");

/* Antes de ready: ajuda em PCs com driver GPU problemático (ecrã branco / janela invisível). */
if (process.env.SENSE_NO_GPU === "1") {
  app.disableHardwareAcceleration();
}
const {
  isProbablyCompleteDashboard,
  fullDashboardSnapshotStable,
} = require("./dashboard-guard.js");
const { fetchBcPtaxUsdAuto, startPtaxPoller, getPtaxSync } = require("./bc-ptax-fetch.js");
const {
  runSenseIaAsk,
  mergeSenseIaEnvWithConfigFile,
} = require(path.join(__dirname, "scripts", "lib", "sense-ia-ask-core.js"));
const { loadCompactContext } = require(path.join(__dirname, "scripts", "lib", "sense-ia-context.js"));
const { stripMarkdownForTxt } = require(path.join(__dirname, "scripts", "lib", "strip-markdown.js"));
const { SenseIaAutoCycle } = require(path.join(__dirname, "scripts", "lib", "sense-ia-auto-cycle.js"));
const { SenseIaInputsAutocalib } = require(path.join(__dirname, "scripts", "lib", "sense-ia-inputs-autocalib.js"));
const { stableStringify } = require(path.join(__dirname, "scripts", "lib", "stable-stringify.js"));
const {
  IPC,
  assertPlainObjectFromRenderer,
  assertOnlyKeys,
} = require(path.join(__dirname, "scripts", "lib", "ipc-payload-guard.js"));
const { buildRaioXReport } = require(path.join(__dirname, "scripts", "lib", "sense-raiox-report.js"));
const {
  parseHhMm: raioxSchedParseHhMm,
  computeNextTriggerMs: raioxSchedComputeNextMs,
  dayKeyLocal: raioxSchedDayKey,
  shouldRunToday: raioxSchedShouldRun,
} = require(path.join(__dirname, "scripts", "lib", "sense-raiox-scheduler.js"));

let mainWindow = null;
let licenseRuntimeStatus = {
  ok: false,
  mode: "unknown",
  reason: "not_checked",
  checkedAt: null,
  graceUntil: null,
};
/** fs.watch da pasta do dashboard — leitura imediata quando o MT5 grava (além do intervalo). */
let dashboardWatchHandle = null;
let dashboardWatchDebounce = null;
let autoCycleInstance = null;
let inputsAutocalibInstance = null;
/**
 * Quando true, não reutilizamos `dashboardCacheByPath` como “fonte” antes de reler o disco
 * (evita mostrar dados de um path antigo após mudar `dataFile`).
 * Mesmo assim mantemos fallback a `lastGoodDataGlobal` / cache após falhas de leitura.
 */
const ULTRA_REALTIME_MODE = true;
/** Debounce após fs.watch (MT5 pode disparar vários eventos por escrita). */
const DASHBOARD_FS_WATCH_DEBOUNCE_MS = 120;
/** Rotação do audit HMAC do dashboard (evita JSONL ilimitado em userData). */
const DASHBOARD_SIGNATURE_AUDIT_MAX_BYTES = 8 * 1024 * 1024;

const senseHealthState = {
  lastFileChangedAt: 0,
  lastReadSuccessAt: 0,
  lastReadDurationMs: 0,
  readTimeoutCount: 0,
  readFailCount: 0,
  lastReadFailAt: 0,
};

const IPC_MAIN_HANDLE_CHANNELS = [
  "read-dashboard",
  "pick-dashboard-file",
  "sense-ia-log-decision",
  "sense-ia-ask",
  "sense-ia-ask-gatilho-diagnostic",
  "sense-ia-ask-inputs-diagnostic",
  "save-ia-inputs-report",
  "sense-ia-get-compact-context",
  "get-sense-ia-schedule",
  "set-sense-ia-hybrid-enabled",
  "publish-sense-ia-verdict",
  "save-ia-calibration-report",
  "save-ia-gatilho-fa-report",
  "save-block-histogram",
  "save-raiox-report",
  "trigger-inputs-autocalib",
  "get-security-status",
  "get-license-status",
  "get-sense-health",
  "cancelar-alvo-invertido",
  "travar-ea",
  "desbloquear-ea",
  "kill-switch-status",
  "read-pnl-history",
];

function unregisterSenseIpcHandlers() {
  for (const ch of IPC_MAIN_HANDLE_CHANNELS) {
    try {
      ipcMain.removeHandler(ch);
    } catch (_) {
      /* ignore */
    }
  }
}

/** Último JSON válido por caminho (evita flicker quando o MT5 grava e o parse falha a meio). */
const dashboardCacheByPath = new Map();
/** Último `seq` aceite por caminho de ficheiro (anti-replay, schemaVersion>=10). */
const lastAcceptedDashboardSeqByPath = new Map();
/** Fallback se o caminho em config oscilar ou ainda não houver cache nesse path. */
let lastGoodDataGlobal = null;
let dashboardSigSecretConfigOnlyWarned = false;

function configPath() {
  return path.join(__dirname, "config.json");
}

function readConfigJson() {
  try {
    const cfg = configPath();
    if (!fs.existsSync(cfg)) return {};
    return JSON.parse(stripJsonBom(fs.readFileSync(cfg, "utf8")));
  } catch (e) {
    return {};
  }
}

function senseLicenseLocalPath() {
  const unpacked = path.join(process.resourcesPath || "", "app.asar.unpacked", "sense-license.local.json");
  if (unpacked && fs.existsSync(unpacked)) return unpacked;
  return path.join(__dirname, "sense-license.local.json");
}

function readLicenseConfig() {
  const cfg = readConfigJson();
  const lic = cfg && cfg.license && typeof cfg.license === "object" ? cfg.license : {};
  const hmacSecretEnv = String(process.env.SENSE_LICENSE_HMAC_SECRET || "").trim();
  const hmacSecretConfig = String(lic.hmacSecret || "").trim();
  let licenseKey = String(lic.licenseKey || "").trim();
  const localLicPath = senseLicenseLocalPath();
  if (!licenseKey && fs.existsSync(localLicPath)) {
    try {
      const localLic = JSON.parse(stripJsonBom(fs.readFileSync(localLicPath, "utf8")));
      if (localLic && localLic.licenseKey) licenseKey = String(localLic.licenseKey).trim();
    } catch (e) {
      console.warn("[Painel SENSE] sense-license.local.json inválido:", e && e.message ? e.message : e);
    }
  }
  if (!licenseKey && process.env.SENSE_LICENSE_KEY) {
    licenseKey = String(process.env.SENSE_LICENSE_KEY).trim();
  }
  return {
    enabled: lic.enabled === true,
    serverUrl: String(lic.serverUrl || "").trim(),
    licenseKey,
    mt5Account: String(lic.mt5Account || "").trim(),
    appId: String(lic.appId || "painel").trim() || "painel",
    hmacSecret: hmacSecretEnv,
    hasConfigHmacSecret: hmacSecretConfig.length > 0,
  };
}

function licenseCachePath() {
  try {
    return path.join(app.getPath("userData"), "license-cache.json");
  } catch (e) {
    return path.join(__dirname, "license-cache.json");
  }
}

function defaultDataPath() {
  return path.join(__dirname, "data", "dashboard.json");
}

/** Remove BOM UTF-8 — MT5/Notepad podem gravar ficheiros com BOM e JSON.parse falha. */
function stripJsonBom(s) {
  if (typeof s !== "string") return s;
  let t = s.trim();
  if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
  return t;
}

/**
 * Segredo da assinatura do dashboard: se não vier do ambiente (ex.: Cursor sem `setenv.local.bat`),
 * lê uma única linha de `sense-dash-secret.local.txt` ou `sense-dash-secret.local` (no .gitignore).
 * Prioridade: SENSE_DASH_SIG_SECRET já definido > ficheiro local.
 */
function applyDashSigSecretFromLocalFileIfNeeded() {
  if (String(process.env.SENSE_DASH_SIG_SECRET || "").trim()) return;
  const candidates = ["sense-dash-secret.local.txt", "sense-dash-secret.local"];
  for (const name of candidates) {
    const p = path.join(__dirname, name);
    try {
      if (!fs.existsSync(p)) continue;
      const raw = stripJsonBom(fs.readFileSync(p, "utf8"));
      const line = String(raw || "")
        .split(/\r?\n/)
        .map((x) => x.trim())
        .find((x) => x && !x.startsWith("#"));
      if (line) {
        process.env.SENSE_DASH_SIG_SECRET = line;
        return;
      }
    } catch (_) {
      /* tenta o próximo nome */
    }
  }
}
applyDashSigSecretFromLocalFileIfNeeded();

/**
 * Salt do machine lock: SENSE_MACHINE_SALT ou `sense-machine-salt.local.txt` (não usar config.json).
 */
function applyMachineSaltFromLocalFileIfNeeded() {
  if (String(process.env.SENSE_MACHINE_SALT || "").trim()) return;
  const p = path.join(__dirname, "sense-machine-salt.local.txt");
  try {
    if (!fs.existsSync(p)) return;
    const raw = stripJsonBom(fs.readFileSync(p, "utf8"));
    const line = String(raw || "")
      .split(/\r?\n/)
      .map((x) => x.trim())
      .find((x) => x && !x.startsWith("#"));
    if (line) process.env.SENSE_MACHINE_SALT = line;
  } catch (_) {
    /* ignora */
  }
}
applyMachineSaltFromLocalFileIfNeeded();

function getPrimaryMacNormalized() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const e of ifaces[name] || []) {
      if (!e || e.internal) continue;
      const mac = String(e.mac || "")
        .trim()
        .toLowerCase()
        .replace(/:/g, "");
      if (mac && mac !== "000000000000") return mac;
    }
  }
  return "nomac";
}

function parseDashboardMetaTimeUtcMs(meta) {
  if (!meta || typeof meta !== "object") return NaN;
  const s = String(meta.time || "").trim();
  const m = s.match(/^(\d{4})\.(\d{2})\.(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
}

function dashboardSignatureFeatureEnabled() {
  const sec = readSecurityConfig();
  const sigCfg = sec.dashboardSignature && typeof sec.dashboardSignature === "object" ? sec.dashboardSignature : {};
  return sigCfg.enabled === true;
}

/**
 * Frescura via meta.time só com assinatura ativa; seq monotónico com schemaVersion>=10.
 */
function evaluateDashboardFreshnessAndSeq(filePath, data) {
  const sigOn = dashboardSignatureFeatureEnabled();
  const maxAgeSec = 300;
  if (sigOn) {
    const tms = parseDashboardMetaTimeUtcMs(data.meta);
    if (!Number.isFinite(tms)) {
      return {
        ok: false,
        error: "meta.time inválido ou ausente — não é possível validar frescura do dashboard.",
      };
    }
    const ageSec = (Date.now() - tms) / 1000;
    if (ageSec > maxAgeSec) {
      return {
        ok: false,
        error: `Dashboard obsoleto (meta.time ~ ${Math.round(ageSec)}s atrás, limite ${maxAgeSec}s).`,
      };
    }
    if (ageSec < -120) {
      return {
        ok: false,
        error: "meta.time no futuro — verifique sincronismo do relógio ou do servidor MT5.",
      };
    }
  }
  const sv = Number(data.schemaVersion || 0);
  if (sv >= 10) {
    const seq = Number(data.seq);
    if (!Number.isFinite(seq)) {
      return { ok: false, error: "Campo seq obrigatório (schemaVersion >= 10)." };
    }
    const prev = lastAcceptedDashboardSeqByPath.get(filePath) ?? 0;
    /* seq igual = mesmo snapshot (polling mais rápido que escrita do EA) → aceitar silenciosamente. */
    if (seq === prev) {
      return { ok: true, error: null };
    }
    /* seq estritamente menor que o anterior. */
    if (seq < prev) {
      /* Reset legítimo do EA (recompilou, retirou e voltou a pôr no chart): gap grande resseta o estado. */
      const gap = prev - seq;
      if (gap >= 1000 || seq <= 1) {
        lastAcceptedDashboardSeqByPath.set(filePath, seq);
        return { ok: true, error: null };
      }
      /* Só com assinatura ON tratamos como replay malicioso. Sem assinatura, aceitamos e atualizamos. */
      if (sigOn) {
        return {
          ok: false,
          error: `Seq dashboard rolou para trás (${seq} < ${prev}) — possível replay.`,
        };
      }
      lastAcceptedDashboardSeqByPath.set(filePath, seq);
      return { ok: true, error: null };
    }
    lastAcceptedDashboardSeqByPath.set(filePath, seq);
  }
  return { ok: true, error: null };
}

/** Query para index.html — ativa simulação de %PICO/%PERSIST (pulso) no renderer. */
function demoPulsoSpeedQueryFromEnvOrConfig() {
  const env = String(process.env.SENSE_DEMO_PULSO || "").trim().toLowerCase();
  if (env === "1" || env === "true" || env === "yes") {
    return { demoPulso: "1" };
  }
  try {
    const cfg = configPath();
    if (!fs.existsSync(cfg)) return {};
    const j = JSON.parse(stripJsonBom(fs.readFileSync(cfg, "utf8")));
    if (j && (j.demoPulsoSpeed === true || j.demoPulsoSpeed === 1 || String(j.demoPulsoSpeed).toLowerCase() === "true")) {
      return { demoPulso: "1" };
    }
  } catch (e) {
    /* ignore */
  }
  return {};
}

function getDataFilePath() {
  try {
    const j = readConfigJson();
    if (j && typeof j.dataFile === "string" && j.dataFile.trim().length > 0) {
      const p = j.dataFile.trim();
      return path.isAbsolute(p) ? p : path.join(__dirname, p);
    }
  } catch (e) {
    console.error("config.json inválido:", e.message);
  }
  return defaultDataPath();
}

function senseIaVerdictFilePath() {
  return path.join(path.dirname(getDataFilePath()), "sense-ia-verdict.json");
}

let senseIaVerdictHeartbeat = null;

setInterval(() => {
  try {
    if (!senseIaVerdictHeartbeat || typeof senseIaVerdictHeartbeat !== "object") return;
    const nowSec = Math.floor(Date.now() / 1000);
    // C11: só atualiza ping do canal — não alterar publishedAt/decisionUpdatedAt (evita “sinal novo” falso na EA)
    const verdict = { ...senseIaVerdictHeartbeat, channelPingAt: nowSec };
    writeJsonAtomic(senseIaVerdictFilePath(), verdict, false);
    senseIaVerdictHeartbeat = verdict;
  } catch (e) {
    console.warn("[Painel SENSE] sense-ia-verdict heartbeat:", e && e.message ? e.message : e);
  }
}, 5000);

function dashboardAuditLogDir() {
  try {
    return path.join(app.getPath("userData"), "logs");
  } catch {
    return path.join(__dirname, "logs");
  }
}

/** Audit: %AppData%/<app>/logs/dashboard-signature-audit.jsonl (só quando assinatura do dashboard está ativa). */
function appendDashboardSignatureAudit(entry) {
  try {
    const dir = dashboardAuditLogDir();
    fs.mkdirSync(dir, { recursive: true });
    const p = path.join(dir, "dashboard-signature-audit.jsonl");
    try {
      const st = fs.statSync(p);
      if (st.size > DASHBOARD_SIGNATURE_AUDIT_MAX_BYTES) {
        const rot = `${p}.1`;
        try {
          if (fs.existsSync(rot)) fs.unlinkSync(rot);
        } catch (_u) {
          /* ignore */
        }
        fs.renameSync(p, rot);
      }
    } catch (_s) {
      /* ficheiro ainda não existe */
    }
    fs.appendFileSync(p, JSON.stringify(entry) + "\n", "utf8");
  } catch (_) {
    /* não bloquear leitura do painel */
  }
}

function writeJsonAtomic(filePath, data, pretty = true) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, (pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data)) + "\n", "utf8");
  try {
    fs.renameSync(tmp, filePath);
  } catch (e) {
    try {
      fs.copyFileSync(tmp, filePath);
      fs.unlinkSync(tmp);
    } catch (_e) {
      try {
        fs.unlinkSync(tmp);
      } catch (__e) {}
      throw e;
    }
  }
}

function sha256Hex(text) {
  return crypto.createHash("sha256").update(String(text), "utf8").digest("hex");
}

function hmacSha256Hex(secret, text) {
  return crypto
    .createHmac("sha256", String(secret))
    .update(String(text), "utf8")
    .digest("hex");
}

function timingSafeEqualHex(a, b) {
  let ax = String(a || "").trim().toLowerCase();
  let bx = String(b || "").trim().toLowerCase();
  if (ax.startsWith("sha256=")) ax = ax.slice("sha256=".length).trim();
  if (bx.startsWith("sha256=")) bx = bx.slice("sha256=".length).trim();
  if (!/^[0-9a-f]+$/i.test(ax) || !/^[0-9a-f]+$/i.test(bx)) return false;
  const target = 64;
  if (ax.length > target || bx.length > target) return false;
  ax = ax.padStart(target, "0");
  bx = bx.padStart(target, "0");
  try {
    return crypto.timingSafeEqual(Buffer.from(ax, "hex"), Buffer.from(bx, "hex"));
  } catch (e) {
    return false;
  }
}

function normalizeHexSig(sigRaw) {
  const s = String(sigRaw || "").trim().toLowerCase();
  if (s.startsWith("sha256=")) return s.slice("sha256=".length).trim();
  return s;
}

function verifyLicenseSignedPayload(payload, signature, secret) {
  if (!payload || typeof payload !== "object") return false;
  const sig = normalizeHexSig(signature);
  if (!sig || !secret) return false;
  const expected = hmacSha256Hex(secret, stableStringify(payload));
  return timingSafeEqualHex(sig, expected);
}

function readLicenseCache() {
  try {
    const p = licenseCachePath();
    if (!fs.existsSync(p)) return null;
    const raw = stripJsonBom(fs.readFileSync(p, "utf8"));
    const j = JSON.parse(raw);
    if (!j || typeof j !== "object") return null;
    return j;
  } catch (e) {
    return null;
  }
}

function writeLicenseCache(entry) {
  try {
    const p = licenseCachePath();
    const tmp = `${p}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tmp, JSON.stringify(entry, null, 2) + "\n", "utf8");
    try {
      fs.renameSync(tmp, p);
    } catch (e) {
      try {
        fs.copyFileSync(tmp, p);
        fs.unlinkSync(tmp);
      } catch (_e) {
        try {
          fs.unlinkSync(tmp);
        } catch (__e) {}
        throw e;
      }
    }
  } catch (e) {
    console.warn("[Painel SENSE] license-cache write:", e.message || e);
  }
}

async function validateLicenseOnline(licCfg) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const payload = {
      licenseKey: licCfg.licenseKey,
      mt5Account: licCfg.mt5Account,
      machineHash: getCurrentMachineFingerprint(),
      appId: licCfg.appId || "painel",
      appVersion: app.getVersion(),
      requestTs: Math.floor(Date.now() / 1000),
    };
    const url = String(licCfg.serverUrl || "").replace(/\/+$/, "") + "/v1/license/validate";
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const body = await r.json();
    if (!body || typeof body !== "object") {
      return { ok: false, reason: "license_response_invalid" };
    }
    const signature = body.signature;
    const signedPayload = {
      ok: body.ok === true,
      licenseStatus: String(body.licenseStatus || ""),
      serverTime: String(body.serverTime || ""),
      onlineValidUntil: String(body.onlineValidUntil || ""),
      graceUntil: String(body.graceUntil || ""),
      reason: String(body.reason || ""),
    };
    if (!verifyLicenseSignedPayload(signedPayload, signature, licCfg.hmacSecret)) {
      return { ok: false, reason: "license_signature_invalid" };
    }
    const entry = {
      payload: signedPayload,
      signature: normalizeHexSig(signature),
      checkedAt: new Date().toISOString(),
      source: "online",
    };
    writeLicenseCache(entry);
    if (!signedPayload.ok || signedPayload.licenseStatus !== "active") {
      return { ok: false, reason: signedPayload.reason || "license_denied", payload: signedPayload };
    }
    return { ok: true, payload: signedPayload };
  } catch (e) {
    return { ok: false, reason: e && e.name === "AbortError" ? "license_timeout" : "license_network_error" };
  } finally {
    clearTimeout(timeout);
  }
}

function validateLicenseFromCache(licCfg) {
  const cached = readLicenseCache();
  if (!cached || !cached.payload || !cached.signature) {
    return { ok: false, reason: "license_cache_missing" };
  }
  const signedPayload = cached.payload;
  if (!verifyLicenseSignedPayload(signedPayload, cached.signature, licCfg.hmacSecret)) {
    return { ok: false, reason: "license_cache_signature_invalid" };
  }
  const graceUntilMs = Date.parse(String(signedPayload.graceUntil || ""));
  if (!Number.isFinite(graceUntilMs) || Date.now() > graceUntilMs) {
    return { ok: false, reason: "license_grace_expired" };
  }
  if (signedPayload.ok !== true || String(signedPayload.licenseStatus) !== "active") {
    return { ok: false, reason: String(signedPayload.reason || "license_cache_denied") };
  }
  return { ok: true, payload: signedPayload };
}

async function enforceOnlineLicenseOrThrow() {
  const licCfg = readLicenseConfig();
  if (!licCfg.enabled) {
    licenseRuntimeStatus = {
      ok: true,
      mode: "disabled",
      reason: "",
      checkedAt: new Date().toISOString(),
      graceUntil: null,
    };
    return;
  }
  if (!licCfg.hmacSecret) {
    throw new Error(
      "Licenciamento ativo, mas falta SENSE_LICENSE_HMAC_SECRET no ambiente (setenv.local.bat)."
    );
  }
  if (licCfg.hasConfigHmacSecret) {
    console.warn(
      "[Painel SENSE] config.license.hmacSecret está preenchido, mas foi ignorado. Use apenas SENSE_LICENSE_HMAC_SECRET."
    );
  }
  if (!licCfg.serverUrl || !licCfg.licenseKey || !licCfg.mt5Account) {
    throw new Error("Licenciamento ativo, mas faltam campos: serverUrl/licenseKey/mt5Account.");
  }

  const online = await validateLicenseOnline(licCfg);
  if (online.ok) {
    licenseRuntimeStatus = {
      ok: true,
      mode: "online",
      reason: "",
      checkedAt: new Date().toISOString(),
      graceUntil: online.payload.graceUntil || null,
    };
    return;
  }

  const cached = validateLicenseFromCache(licCfg);
  if (cached.ok) {
    licenseRuntimeStatus = {
      ok: true,
      mode: "offline_grace",
      reason: online.reason || "",
      checkedAt: new Date().toISOString(),
      graceUntil: cached.payload.graceUntil || null,
    };
    return;
  }
  throw new Error(`Licença inválida (${online.reason || cached.reason || "denied"}).`);
}

function readSecurityConfig() {
  const cfg = readConfigJson();
  if (!cfg || typeof cfg !== "object" || !cfg.security || typeof cfg.security !== "object") {
    return {};
  }
  return cfg.security;
}

function getCurrentMachineFingerprint() {
  applyMachineSaltFromLocalFileIfNeeded();
  const host = String(os.hostname() || "").trim().toLowerCase();
  let user = "";
  try {
    user = String(os.userInfo().username || "").trim().toLowerCase();
  } catch (e) {
    user = String(process.env.USERNAME || process.env.USER || "").trim().toLowerCase();
  }
  const plat = `${process.platform}|${process.arch}`;
  const mac = getPrimaryMacNormalized();
  const salt = String(process.env.SENSE_MACHINE_SALT || "").trim();
  return sha256Hex(`${host}|${user}|${plat}|${mac}|${salt}`);
}

function enforceMachineLockOrThrow() {
  const sec = readSecurityConfig();
  const machineLock = sec.machineLock && typeof sec.machineLock === "object" ? sec.machineLock : {};
  if (machineLock.enabled !== true) return;
  const allowed = Array.isArray(machineLock.allowedFingerprints)
    ? machineLock.allowedFingerprints.map((x) => String(x || "").trim().toLowerCase()).filter(Boolean)
    : [];
  if (allowed.length === 0) {
    throw new Error("Machine lock ativo sem lista allowlist (security.machineLock.allowedFingerprints).");
  }
  applyMachineSaltFromLocalFileIfNeeded();
  const salt = String(process.env.SENSE_MACHINE_SALT || "").trim();
  if (!salt) {
    throw new Error(
      "Machine lock ativo: defina SENSE_MACHINE_SALT ou crie sense-machine-salt.local.txt (npm run security:bootstrap-machine-lock). O salt não deve estar em config.json.",
    );
  }
  const fp = getCurrentMachineFingerprint().toLowerCase();
  if (!allowed.includes(fp)) {
    throw new Error("Esta máquina não está autorizada para abrir o Painel SENSE.");
  }
}

function verifyDashboardSignature(data, rawJsonText = "", rawJsonTextLatin1 = "", rawJsonTextUtf16 = "") {
  const sec = readSecurityConfig();
  const sigCfg = sec.dashboardSignature && typeof sec.dashboardSignature === "object" ? sec.dashboardSignature : {};
  if (sigCfg.enabled !== true) return { ok: true, error: null };

  const field = String(sigCfg.field || "_sig").trim() || "_sig";
  const secretFromEnv = String(process.env.SENSE_DASH_SIG_SECRET || "").trim();
  const secretFromCfg = String(sigCfg.secret || "").trim();
  const secret = String(secretFromEnv || secretFromCfg || "").trim();
  if (!secret) {
    return { ok: false, error: "Assinatura ativa, mas segredo ausente (SENSE_DASH_SIG_SECRET ou config.security.dashboardSignature.secret)." };
  }
  if (!secretFromEnv && secretFromCfg && !dashboardSigSecretConfigOnlyWarned) {
    dashboardSigSecretConfigOnlyWarned = true;
    console.warn(
      "[Painel SENSE] Segredo de assinatura do dashboard só em config.json; prefira SENSE_DASH_SIG_SECRET ou sense-dash-secret.local.txt.",
    );
  }
  if (!data || typeof data !== "object") {
    return { ok: false, error: "JSON inválido para validação de assinatura." };
  }
  const sigProvided = normalizeHexSig(data[field]);
  if (!sigProvided) {
    return { ok: false, error: `Assinatura ausente no campo '${field}'.` };
  }
  const sigAlgo = String(data._sigAlgo || "").trim().toLowerCase();
  if (sigAlgo === "sha256_secret_raw_v1") {
    const rawUtf8 = String(rawJsonText || "").trim();
    const rawLatin1 = String(rawJsonTextLatin1 || "").trim();
    const rawUtf16 = String(rawJsonTextUtf16 || "").trim();
    if (!rawUtf8 && !rawLatin1 && !rawUtf16) {
      return { ok: false, error: "Assinatura raw_v1 requer leitura do conteúdo bruto do arquivo." };
    }
    function stripRawV1Signature(raw) {
      if (!raw) return "";
      const marker = `,"_sigAlgo":"sha256_secret_raw_v1","${field}":"`;
      const idx = raw.lastIndexOf(marker);
      if (idx < 0 || !raw.endsWith("}")) return "";
      return raw.slice(0, idx) + "}";
    }
    const unsignedUtf8 = stripRawV1Signature(rawUtf8);
    const unsignedLatin1 = stripRawV1Signature(rawLatin1);
    const unsignedUtf16 = stripRawV1Signature(rawUtf16);
    if (
      (!unsignedUtf8 || unsignedUtf8 === rawUtf8) &&
      (!unsignedLatin1 || unsignedLatin1 === rawLatin1) &&
      (!unsignedUtf16 || unsignedUtf16 === rawUtf16)
    ) {
      return { ok: false, error: "Formato de assinatura raw_v1 inválido no dashboard.json." };
    }
    const expectedUtf8 = unsignedUtf8 ? sha256Hex(`${secret}|${unsignedUtf8}`) : "";
    const expectedLatin1 = unsignedLatin1 ? sha256Hex(`${secret}|${unsignedLatin1}`) : "";
    const expectedUtf16 = unsignedUtf16 ? sha256Hex(`${secret}|${unsignedUtf16}`) : "";
    const okRaw = (expectedUtf8 && timingSafeEqualHex(sigProvided, expectedUtf8)) ||
      (expectedLatin1 && timingSafeEqualHex(sigProvided, expectedLatin1)) ||
      (expectedUtf16 && timingSafeEqualHex(sigProvided, expectedUtf16));
    if (!okRaw) {
      return { ok: false, error: "Assinatura inválida (raw_v1): dashboard.json pode ter sido alterado." };
    }
    return { ok: true, error: null };
  }
  const payload = { ...data };
  delete payload[field];
  const expected = hmacSha256Hex(secret, stableStringify(payload));
  if (!timingSafeEqualHex(sigProvided, expected)) {
    return { ok: false, error: "Assinatura inválida: dashboard.json pode ter sido alterado." };
  }
  return { ok: true, error: null };
}

/** Validação de JSON: ver dashboard-guard.js (partilhado com renderer.js). */

function delay(ms) {
  const n = Math.max(0, Number(ms) || 0);
  return new Promise((resolve) => setTimeout(resolve, n));
}

/** MT5/Windows: leitura pode falhar ou JSON vir truncado a meio da escrita — várias tentativas. */
async function readAndParseDashboard(filePath) {
  let lastErr = null;
  const _readStart = Date.now();
  for (let i = 0; i < 8; i++) {
    try {
      // Timeout evita que readFile fique pendurado indefinidamente (ex: Windows Defender lock em
      // C:\Program Files), o que travaria tickInFlight no renderer para sempre.
      const rawBuffer = await Promise.race([
        fs.promises.readFile(filePath),
        new Promise((_, reject) => setTimeout(() => reject(new Error("readFile timeout 800ms")), 800)),
      ]);
      const rawUtf8 = stripJsonBom(rawBuffer.toString("utf8"));
      const rawLatin1 = stripJsonBom(rawBuffer.toString("latin1"));
      const rawUtf16 = stripJsonBom(rawBuffer.toString("utf16le"));
      // Prefer UTF-8 parse; fallback to latin1 for ANSI files from MT5.
      let data = null;
      try {
        data = JSON.parse(rawUtf8);
      } catch (_) {
        try {
          data = JSON.parse(rawLatin1);
        } catch (_) {
          data = JSON.parse(rawUtf16);
        }
      }
      senseHealthState.lastReadSuccessAt = Date.now();
      senseHealthState.lastReadDurationMs = Date.now() - _readStart;
      return { data, raw: rawUtf8, rawLatin1, rawUtf16 };
    } catch (e) {
      if (e && e.message && e.message.includes("readFile timeout 800ms")) {
        senseHealthState.readTimeoutCount++;
      }
      lastErr = e;
      await delay(6);
    }
  }
  senseHealthState.readFailCount++;
  senseHealthState.lastReadFailAt = Date.now();
  throw lastErr || new Error("readAndParseDashboard");
}

function stopDashboardWatch() {
  if (dashboardWatchDebounce) {
    try {
      clearTimeout(dashboardWatchDebounce);
    } catch (e) {}
    dashboardWatchDebounce = null;
  }
  if (dashboardWatchHandle) {
    try {
      dashboardWatchHandle.close();
    } catch (e) {}
    dashboardWatchHandle = null;
  }
}

function notifyDashboardFileChanged() {
  senseHealthState.lastFileChangedAt = Date.now();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("dashboard-file-changed");
  }
}

/** Observa a pasta (Windows: mais fiável que observar só o ficheiro). */
function startDashboardWatch() {
  stopDashboardWatch();
  const fp = getDataFilePath();
  const dir = path.dirname(fp);
  const base = path.basename(fp);
  if (!fs.existsSync(dir)) return;
  try {
    dashboardWatchHandle = fs.watch(dir, (eventType, filename) => {
      if (filename == null) {
        return;
      }
      if (filename !== base && String(filename).toLowerCase() !== base.toLowerCase()) {
        return;
      }
      if (dashboardWatchDebounce) clearTimeout(dashboardWatchDebounce);
      dashboardWatchDebounce = setTimeout(() => {
        dashboardWatchDebounce = null;
        notifyDashboardFileChanged();
      }, DASHBOARD_FS_WATCH_DEBOUNCE_MS);
    });
  } catch (e) {
    console.warn("[Painel SENSE] fs.watch:", e.message);
  }
}

async function readDashboardJson() {
  const filePath = getDataFilePath();
  const cached = ULTRA_REALTIME_MODE ? null : dashboardCacheByPath.get(filePath) || null;
  const fallback = () => {
    if (lastGoodDataGlobal) {
      return {
        ok: true,
        path: filePath,
        error: "A usar último JSON válido (leitura falhou ou caminho mudou).",
        data: lastGoodDataGlobal,
        stale: true,
      };
    }
    return null;
  };

  let parsed;
  try {
    parsed = await readAndParseDashboard(filePath);
  } catch (e) {
    const code = e && e.code;
    const msg = e.message || String(e);
    if (code === "ENOENT") {
      if (cached) {
        return {
          ok: true,
          path: filePath,
          error: "Arquivo não encontrado — a mostrar último snapshot válido.",
          data: cached,
          stale: true,
        };
      }
      const fb = fallback();
      if (fb) return fb;
      return {
        ok: false,
        path: filePath,
        error: "Arquivo não encontrado. Crie o JSON ou ajuste config.json.",
        data: null,
      };
    }
    if (cached) {
      return {
        ok: true,
        path: filePath,
        error: msg,
        data: cached,
        stale: true,
      };
    }
    const fb = fallback();
    if (fb) {
      fb.error = msg;
      return fb;
    }
    return {
      ok: false,
      path: filePath,
      error: msg,
      data: null,
    };
  }

  const data = parsed.data;
  if (!isProbablyCompleteDashboard(data)) {
    if (cached) {
      return {
        ok: true,
        path: filePath,
        error: "JSON incompleto ou a meio da escrita — a mostrar último snapshot válido.",
        data: cached,
        stale: true,
      };
    }
    const fb = fallback();
    if (fb) {
      fb.error = "JSON incompleto ou vazio — a usar último snapshot global.";
      return fb;
    }
    return {
      ok: false,
      path: filePath,
      error: "JSON incompleto ou vazio. Aguarde o EA gravar o ficheiro completo.",
      data: null,
    };
  }

  const sig = verifyDashboardSignature(data, parsed.raw, parsed.rawLatin1, parsed.rawUtf16);
  if (dashboardSignatureFeatureEnabled()) {
    const rawH = parsed.raw || "";
    appendDashboardSignatureAudit({
      t: new Date().toISOString(),
      ok: sig.ok,
      path: filePath,
      sha256: crypto.createHash("sha256").update(rawH, "utf8").digest("hex"),
    });
  }
  if (!sig.ok) {
    return {
      ok: false,
      path: filePath,
      error: sig.error || "Assinatura do dashboard inválida.",
      data: null,
      stale: true,
    };
  }

  const gate = evaluateDashboardFreshnessAndSeq(filePath, data);
  if (!gate.ok) {
    return {
      ok: false,
      path: filePath,
      error: gate.error,
      data: null,
      stale: true,
    };
  }

  const dataForUi = JSON.parse(JSON.stringify(data));
  dashboardCacheByPath.set(filePath, dataForUi);
  lastGoodDataGlobal = dataForUi;
  lastGoodDataGlobal._sensePainelReadAt = Math.floor(Date.now() / 1000);

  if (!fullDashboardSnapshotStable(dataForUi)) {
    return {
      ok: true,
      path: filePath,
      error:
        "Ficheiro lido ao vivo; validação HUD estrita pendente (normal durante gravação do EA).",
      data: dataForUi,
      stale: true,
      liveData: true,
    };
  }
  return { ok: true, path: filePath, error: null, data: dataForUi, stale: false };
}

/**
 * Enriquece `ptaxBussola` com média PTAX do BC (Olinda).
 * Usa o resultado do poller em background — nunca bloqueia na rede.
 * Desativar: no JSON, `"bcPtaxAutoFetch": false` dentro de `ptaxBussola`.
 */
function mergePtaxBcFromOlinda(data) {
  if (!data || typeof data !== "object") return data;
  const pb = data.ptaxBussola;
  if (!pb || typeof pb !== "object") return data;
  if (pb.enabled === false) return data;
  if (pb.bcPtaxAutoFetch === false) return data;
  const r = getPtaxSync();
  if (!r) return data; // ainda na primeira busca — sem bloquear
  if (!r.ok || r.media == null || !Number.isFinite(r.media)) {
    return {
      ...data,
      ptaxBussola: {
        ...pb,
        bcPtaxFetchError: r.error || "PTAX BC (Olinda) sem média válida.",
      },
    };
  }
  const { bcPtaxFetchError: _x, ...restPb } = pb;
  return {
    ...data,
    ptaxBussola: {
      ...restPb,
      bcPtaxMedia: r.media,
      bcPtaxNota: r.note || "BC Olinda (auto)",
    },
  };
}

/** Abre o diálogo nativo, grava config.json e limpa caches (novo caminho). */
async function pickAndSaveDashboardFile() {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  const cur = getDataFilePath();
  const defaultPath = fs.existsSync(cur) ? cur : defaultDataPath();
  const r = await dialog.showOpenDialog(win || undefined, {
    title: "Selecionar dashboard.json (MT5: pasta MQL5\\Files)",
    defaultPath,
    filters: [{ name: "JSON", extensions: ["json"] }],
    properties: ["openFile"],
  });
  if (r.canceled || !r.filePaths || !r.filePaths[0]) {
    return { ok: false, canceled: true };
  }
  const chosen = path.normalize(r.filePaths[0]);
  try {
    const cfg = configPath();
    let merged = { dataFile: chosen };
    if (fs.existsSync(cfg)) {
      try {
        const raw = fs.readFileSync(cfg, "utf8");
        const j = JSON.parse(stripJsonBom(raw));
        if (j && typeof j === "object") {
          merged = { ...j, dataFile: chosen };
        }
      } catch (e) {
        /* sobrescreve só dataFile se JSON antigo inválido */
      }
    }
    fs.writeFileSync(cfg, JSON.stringify(merged, null, 2) + "\n", "utf8");
    dashboardCacheByPath.clear();
    lastGoodDataGlobal = null;
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
  return { ok: true, path: chosen };
}

function createWindow() {
  const icoPath = path.join(__dirname, "assets", "sense-ico-white.ico");
  const winOpts = {
    width: 1420,
    /* Largura + altura generosas para HUD/Δ sem esconder blocos; o utilizador pode redimensionar */
    height: 1240,
    minWidth: 960,
    minHeight: 720,
    backgroundColor: "#070b12",
    title: "Painel SENSE",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  };
  if (fs.existsSync(icoPath)) {
    winOpts.icon = icoPath;
  }
  mainWindow = new BrowserWindow(winOpts);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https:") || url.startsWith("http:")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"), { query: demoPulsoSpeedQueryFromEnvOrConfig() });
  startDashboardWatch();
  /**
   * Auto-cycle do main pode concorrer com o auto-cycle do renderer (janela flutuante),
   * gerando chamadas IA paralelas e picos de CPU. Por defeito, deixamos o ciclo no
   * renderer (UX principal) e só ligamos o do main via flag explícita.
   */
  if (process.env.SENSE_IA_MAIN_AUTOCYCLE === "1") {
    autoCycleInstance = new SenseIaAutoCycle({
      getWindow: () => mainWindow,
      configPath: configPath(),
    });
    autoCycleInstance.start();
  } else {
    autoCycleInstance = null;
  }
  inputsAutocalibInstance = new SenseIaInputsAutocalib({
    getWindow: () => mainWindow,
    configPath: configPath(),
    isBusy: () => senseIaIpcBusy,
    setBusy: (v) => {
      senseIaIpcBusy = v === true;
    },
  });
  inputsAutocalibInstance.start();
  startRaioxDailyScheduler();
  /* Abre DevTools automaticamente se definires SENSE_DEVTOOLS=1 antes de npm start (PowerShell: $env:SENSE_DEVTOOLS="1"; npm start) */
  if (process.env.SENSE_DEVTOOLS === "1") {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }
}

app.whenReady().then(() => {
  try {
    enforceMachineLockOrThrow();
  } catch (e) {
    dialog.showErrorBox("Painel SENSE bloqueado", e.message || String(e));
    app.quit();
    return;
  }
  enforceOnlineLicenseOrThrow()
    .then(() => {
      const fp = getDataFilePath();
      /* Evitar imprimir caminho com acentos no CMD (codepage) — só confirma leitura. */
      console.log("[Painel SENSE] JSON:", fs.existsSync(fp) ? "ficheiro encontrado" : "ficheiro em falta");
      const dq = demoPulsoSpeedQueryFromEnvOrConfig();
      if (dq && dq.demoPulso === "1") {
        console.log("[Painel SENSE] Demo pulso Speed: %PICO / %PERSIST simulados (ciclo).");
      }
      startPtaxPoller();
      createWindow();
      app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
      });
    })
    .catch((e) => {
      dialog.showErrorBox("Licença inválida", e.message || String(e));
      app.quit();
    });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (autoCycleInstance) autoCycleInstance.stop();
  if (inputsAutocalibInstance) inputsAutocalibInstance.stop();
  stopDashboardWatch();
  unregisterSenseIpcHandlers();
});

/** Sinal de cancelamento para a EA: cria sense_cancel.txt na pasta do dashboard.json.
 *  A EA detecta o arquivo em ProcessarAlvoInvertido() e cancela o countdown ativo. */
ipcMain.handle("cancelar-alvo-invertido", async () => {
  try {
    const cancelPath = path.join(path.dirname(getDataFilePath()), "sense_cancel.txt");
    const tmp = `${cancelPath}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tmp, "1", "utf8");
    fs.renameSync(tmp, cancelPath);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err.message) };
  }
});

/** Kill switch: trava o EA criando sense_kill.txt na pasta do dashboard.json. */
ipcMain.handle("travar-ea", async () => {
  try {
    const killPath = path.join(path.dirname(getDataFilePath()), "sense_kill.txt");
    const tmp = `${killPath}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tmp, "1", "utf8");
    fs.renameSync(tmp, killPath);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err.message) };
  }
});

/** Kill switch: desbloqueio — deleta sense_kill.txt. */
ipcMain.handle("desbloquear-ea", async () => {
  try {
    const killPath = path.join(path.dirname(getDataFilePath()), "sense_kill.txt");
    if (fs.existsSync(killPath)) fs.unlinkSync(killPath);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err.message) };
  }
});

/** Kill switch: retorna estado atual (para sincronizar botão ao abrir o painel). */
ipcMain.handle("kill-switch-status", async () => {
  const killPath = path.join(path.dirname(getDataFilePath()), "sense_kill.txt");
  return { active: fs.existsSync(killPath) };
});

/** Histórico PnL: lê e parseia todos os SENSE_TradeLog_*.csv dos últimos 14 dias. */
ipcMain.handle("read-pnl-history", async () => {
  try {
    const dir = path.dirname(getDataFilePath());

    // 1. Listar arquivos SENSE_TradeLog_*.csv, ordenados, últimos 14
    const files = fs.readdirSync(dir)
      .filter(f => /^SENSE_TradeLog_\d{8}\.csv$/.test(f))
      .sort()
      .slice(-14);

    // 2. Identificar arquivo de hoje
    const now = new Date();
    const yy  = now.getFullYear();
    const mm  = String(now.getMonth() + 1).padStart(2, "0");
    const dd  = String(now.getDate()).padStart(2, "0");
    const todayKey  = `${yy}${mm}${dd}`;
    const todayFile = `SENSE_TradeLog_${todayKey}.csv`;

    // 3. Parsear cada arquivo
    const days = [];
    let todayTrades = [];

    for (const fname of files) {
      const fpath = path.join(dir, fname);
      const raw   = fs.readFileSync(fpath, "latin1");
      const lines = raw.split(/\r?\n/).filter(Boolean);

      const closes = lines
        .slice(1) // pular header
        .map(l => l.split(";"))
        .filter(cols => cols[1] === "CLOSE" && cols[8] !== "");

      const dateCode = fname.replace("SENSE_TradeLog_", "").replace(".csv", "");
      const label    = `${dateCode.slice(6, 8)}/${dateCode.slice(4, 6)}`;

      const trades = closes.map(cols => ({
        time:      (cols[0] || "").split(" ")[1] || cols[0] || "",
        resultado: parseFloat(cols[8]) || 0,
        pnlAcum:   parseFloat(cols[9]) || 0,
      }));

      const wins   = trades.filter(t => t.resultado > 0).length;
      const losses = trades.filter(t => t.resultado < 0).length;
      const resultado = trades.length > 0 ? trades[trades.length - 1].pnlAcum : 0;

      days.push({ date: label, totalOps: trades.length, wins, losses, resultado });
      if (fname === todayFile) todayTrades = trades;
    }

    // 4. Calcular métricas
    const todayLabel = `${dd}/${mm}`;
    const todayDay   = days.find(d => d.date === todayLabel)
      || { totalOps: 0, wins: 0, losses: 0, resultado: 0 };

    const resultadoHoje = todayDay.resultado;
    const totalOpsHoje  = todayDay.totalOps;
    const winRateHoje   = totalOpsHoje > 0
      ? Math.round((todayDay.wins / totalOpsHoje) * 100)
      : 0;

    const drawdownMaxHoje = todayTrades.length > 0
      ? Math.min(...todayTrades.map(t => t.pnlAcum))
      : 0;

    // Sequência atual: contagem de resultados consecutivos iguais no fim
    let sequenciaAtual = { tipo: "nenhuma", count: 0 };
    if (todayTrades.length > 0) {
      const last = todayTrades[todayTrades.length - 1];
      const tipo = last.resultado >= 0 ? "ganho" : "perda";
      let count = 0;
      for (let i = todayTrades.length - 1; i >= 0; i--) {
        if ((tipo === "ganho") === (todayTrades[i].resultado >= 0)) count++;
        else break;
      }
      sequenciaAtual = { tipo, count };
    }

    // Resultado semana: soma dos dias de Seg a hoje
    const dow = now.getDay(); // 0=Dom
    const mondayOffset = dow === 0 ? -6 : 1 - dow;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() + mondayOffset);
    weekStart.setHours(0, 0, 0, 0);

    const resultadoSemana = days
      .filter(d => {
        const [ddd, mmm] = d.date.split("/");
        const fd = new Date(yy, parseInt(mmm) - 1, parseInt(ddd));
        return fd >= weekStart && fd <= now;
      })
      .reduce((sum, d) => sum + d.resultado, 0);

    return {
      today: todayTrades,
      days,
      metrics: {
        resultadoHoje,
        totalOpsHoje,
        winRateHoje,
        drawdownMaxHoje,
        sequenciaAtual,
        resultadoSemana,
      },
      lastUpdated: now.toLocaleTimeString("pt-BR"),
      error: null,
    };
  } catch (err) {
    return { today: [], days: [], metrics: null, lastUpdated: null, error: String(err.message) };
  }
});

ipcMain.handle("read-dashboard", async () => {
  const r = await readDashboardJson();
  if (!r.ok) {
    console.warn("[Painel SENSE] read-dashboard falhou:", r.error || "sem dados", r.path || "");
    return r;
  }
  if (r.data) {
    r.data = mergePtaxBcFromOlinda(r.data);
    const readAt =
      r.data && r.data._sensePainelReadAt != null ? Number(r.data._sensePainelReadAt) : 0;
    const dataAgeSeconds = readAt > 0 ? Math.floor(Date.now() / 1000) - readAt : 9999;
    r.data._dataAgeSeconds = dataAgeSeconds;
  }
  return r;
});
ipcMain.handle("pick-dashboard-file", async () => {
  const r = await pickAndSaveDashboardFile();
  if (r && r.ok) startDashboardWatch();
  return r;
});

/** Guard global de concorrência para chamadas IPC de IA (evita CPU spike por chamadas paralelas). */
let senseIaIpcBusy = false;
let senseIaQueueRunning = false;
let senseIaQueueSeq = 0;
const senseIaQueue = [];

function senseIaCancelPendingByKey(cancelKey) {
  if (!cancelKey) return;
  for (let i = senseIaQueue.length - 1; i >= 0; i--) {
    const t = senseIaQueue[i];
    if (t.cancelKey !== cancelKey) continue;
    senseIaQueue.splice(i, 1);
    t.resolve({
      ok: false,
      senseIa: true,
      provider: "ollama",
      error: "Pedido substituído por uma solicitação mais recente.",
      hint: "Foi mantido apenas o pedido mais novo para evitar fila longa e resposta defasada.",
      cancelled: true,
    });
  }
}

async function senseIaDrainQueue() {
  if (senseIaQueueRunning) return;
  senseIaQueueRunning = true;
  try {
    while (senseIaQueue.length > 0) {
      senseIaQueue.sort((a, b) => (b.priority - a.priority) || (a.seq - b.seq));
      const task = senseIaQueue.shift();
      senseIaIpcBusy = true;
      try {
        const result = await task.run();
        task.resolve(result);
      } catch (e) {
        task.resolve({
          ok: false,
          senseIa: true,
          provider: "ollama",
          error: e && e.message ? e.message : String(e),
        });
      } finally {
        senseIaIpcBusy = false;
      }
    }
  } finally {
    senseIaQueueRunning = false;
  }
}

function senseIaEnqueueTask({ priority, cancelKey, run }) {
  return new Promise((resolve) => {
    senseIaCancelPendingByKey(cancelKey);
    senseIaQueue.push({
      seq: ++senseIaQueueSeq,
      priority: Number(priority) || 0,
      cancelKey: String(cancelKey || "").trim(),
      run,
      resolve,
    });
    void senseIaDrainQueue();
  });
}

function resolveSenseIaTaskModel(taskKey) {
  try {
    const cfg = readConfigJson();
    const si = cfg && (cfg.senseIA || cfg.senseIa);
    if (!si || typeof si !== "object") return "";
    const tm = si.taskModels && typeof si.taskModels === "object" ? si.taskModels : {};
    const aliases = {
      inputs_diagnostic: ["inputsDiagnostic", "inputs"],
      gatilho_fa_diagnostic: ["gatilhoDiagnostic", "gatilho"],
      inputs_autocalib: ["autocalib", "inputsAutocalib"],
      auto_cycle: ["autoCycle", "auto"],
      manual: ["manual", "logo", "quick"],
    };
    const keys = aliases[taskKey] || [taskKey];
    for (const k of keys) {
      const v = String(tm[k] || "").trim();
      if (v) return v;
    }
    return "";
  } catch (_) {
    return "";
  }
}

ipcMain.handle("sense-ia-log-decision", async (_event, entry) => {
  try {
    const gate = assertPlainObjectFromRenderer(entry, IPC.LOG_DECISION_MAX_BYTES, "sense-ia-log-decision");
    if (!gate.ok) return { ok: false, error: gate.error };
    const row = gate.obj;
    const allowLog = new Set(["side", "confidence", "eaSide", "concord", "enabled", "reason", "decisionUpdatedAt"]);
    const keysOk = assertOnlyKeys(row, allowLog, "sense-ia-log-decision");
    if (!keysOk.ok) return { ok: false, error: keysOk.error };

    const logsDir = path.join(app.getPath("desktop"), "SENSE-Auditoria");
    fs.mkdirSync(logsDir, { recursive: true });
    const today = new Date().toISOString().slice(0, 10);
    const logPath = path.join(logsDir, `ia-decisoes-${today}.csv`);
    const isNew = !fs.existsSync(logPath);
    const ts = new Date().toISOString();
    const cols = [
      ts,
      String(row.side || ""),
      String(row.confidence != null ? row.confidence : ""),
      String(row.eaSide || ""),
      String(row.concord || ""),
      String(row.enabled != null ? row.enabled : ""),
      String(row.reason || "")
        .replace(/,/g, ";")
        .replace(/\r?\n/g, " "),
      String(row.decisionUpdatedAt || ""),
    ];
    if (isNew) {
      fs.appendFileSync(
        logPath,
        "timestamp,ia_side,ia_confidence,ea_side,concord,ia_enabled,reason,decision_updated_at\n",
        "utf8",
      );
    }
    fs.appendFileSync(logPath, `${cols.join(",")}\n`, "utf8");
    return { ok: true, path: logPath };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
});

/** SENSE IA: envia contexto compacto ao modelo (chaves em env ou em `senseIa` dentro de config.json). */
ipcMain.handle("sense-ia-ask", async () => {
  return senseIaEnqueueTask({
    priority: 40,
    cancelKey: "sense-ia-ask",
    run: async () => {
      const manualModel = resolveSenseIaTaskModel("manual");
      const env = mergeSenseIaEnvWithConfigFile(
        {
          ...process.env,
          SENSE_DASHBOARD_DATA_FILE: getDataFilePath(),
          // Profile SLIM: corta o contexto para ~1.5k tokens (era ~6-9k).
          // Mantém qualidade da leitura Viés/Confiança e poupa o orçamento
          // TPM do Groq free (6000/min) para a Decisão IA e Auto-Calib.
          SENSE_IA_PROMPT_PROFILE: "manual_slim",
          SENSE_IA_OLLAMA_NUM_PREDICT: "220",
          ...(manualModel ? { SENSE_IA_MODEL: manualModel } : {}),
        },
        configPath(),
      );
      return runSenseIaAsk(env);
    },
  });
});

/** SENSE IA — mesmo contexto JSON, com prompt longo A)–F) para diagnóstico Gatilho FA (B+C). */
ipcMain.handle("sense-ia-ask-gatilho-diagnostic", async () => {
  return senseIaEnqueueTask({
    priority: 90,
    cancelKey: "sense-ia-ask-gatilho-diagnostic",
    run: async () => {
      const gatilhoModel = resolveSenseIaTaskModel("gatilho_fa_diagnostic");
      const env = mergeSenseIaEnvWithConfigFile(
        {
          ...process.env,
          SENSE_DASHBOARD_DATA_FILE: getDataFilePath(),
          SENSE_IA_PROMPT_PROFILE: "gatilho_fa_diagnostic",
          SENSE_IA_OLLAMA_NUM_PREDICT: "900",
          ...(gatilhoModel ? { SENSE_IA_MODEL: gatilhoModel } : {}),
        },
        configPath(),
      );
      return runSenseIaAsk(env);
    },
  });
});

/** SENSE IA — diagnóstico de inputs reais do MT5 (eaInputsSnapshot) focado no gatilho operacional. */
ipcMain.handle("sense-ia-ask-inputs-diagnostic", async () => {
  return senseIaEnqueueTask({
    priority: 100,
    cancelKey: "sense-ia-ask-inputs-diagnostic",
    run: async () => {
      const inputsModel = resolveSenseIaTaskModel("inputs_diagnostic");
      const env = mergeSenseIaEnvWithConfigFile(
        {
          ...process.env,
          SENSE_DASHBOARD_DATA_FILE: getDataFilePath(),
          SENSE_IA_PROMPT_PROFILE: "inputs_diagnostic",
          SENSE_IA_OLLAMA_NUM_PREDICT: "450",
          ...(inputsModel ? { SENSE_IA_MODEL: inputsModel } : {}),
        },
        configPath(),
      );
      return runSenseIaAsk(env);
    },
  });
});

/** Exporta diagnóstico de inputs em .md + .txt na Área de Trabalho. */
ipcMain.handle("save-ia-inputs-report", async (_evt, payload) => {
  try {
    const gate = assertPlainObjectFromRenderer(payload, IPC.SAVE_INPUTS_REPORT_MAX_BYTES, "save-ia-inputs-report");
    if (!gate.ok) return { ok: false, error: gate.error };
    const allowIn = new Set(["answer", "model", "provider", "readAt", "sourcePath", "dataPath"]);
    const keysOk = assertOnlyKeys(gate.obj, allowIn, "save-ia-inputs-report");
    if (!keysOk.ok) return { ok: false, error: keysOk.error };
    const p = gate.obj;
    const answer = String(p.answer || "").trim();
    if (!answer) return { ok: false, error: "Gera o diagnóstico de inputs antes de guardar (resposta vazia)." };
    const desktopDir = app.getPath("desktop");
    const dir = path.join(desktopDir, "Diagnóstico Inputs");
    fs.mkdirSync(dir, { recursive: true });
    const now = new Date();
    const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const hhmm = `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
    const base = `diagnostico-inputs-${day}-${hhmm}`;
    const model = String(p.model || "n/d");
    const provider = String(p.provider || "n/d");
    const readAt = String(p.readAt || "n/d");
    const sourcePath = String(p.sourcePath || p.dataPath || "n/d");
    const headerMd = [
      "# Diagnóstico de Inputs MT5",
      "",
      `Gerado em: ${now.toISOString()}`,
      `Modelo: ${model}`,
      `Fornecedor: ${provider}`,
      `Leitura JSON (painel): ${readAt}`,
      `Origem: ${sourcePath}`,
      "",
      "---",
      "",
    ].join("\n");
    const mdContent = headerMd + answer + "\n";
    const txtContent = stripMarkdownForTxt(headerMd) + "\n\n" + stripMarkdownForTxt(answer) + "\n";
    const mdPath = path.join(dir, `${base}.md`);
    const txtPath = path.join(dir, `${base}.txt`);
    fs.writeFileSync(mdPath, mdContent, "utf8");
    fs.writeFileSync(txtPath, txtContent, "utf8");
    return { ok: true, mdPath, txtPath, dir };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
});

/** Devolve o JSON compacto (o mesmo núcleo que a SENSE IA envia ao modelo) para colar noutro sítio (ex.: Cursor). */
ipcMain.handle("sense-ia-get-compact-context", async () => {
  const env = mergeSenseIaEnvWithConfigFile(
    {
      ...process.env,
      SENSE_DASHBOARD_DATA_FILE: getDataFilePath(),
    },
    configPath(),
  );
  const loaded = loadCompactContext(env);
  if (loaded.error) {
    return {
      ok: false,
      senseIa: true,
      error: loaded.error,
      dataPath: loaded.dataPath,
      hint: loaded.hint,
    };
  }
  const { compact, dataPath } = loaded;
  return {
    ok: true,
    senseIa: true,
    dataPath,
    readAt: compact._readAt,
    sourcePath: compact._sourcePath,
    json: JSON.stringify(compact, null, 2),
  };
});

/** Intervalo da leitura automática (minutos). 0 = desligado. Omisso = 30. */
ipcMain.handle("get-sense-ia-schedule", async () => {
  try {
    const cfg = configPath();
    if (!fs.existsSync(cfg)) return { autoEveryMinutes: 15, provider: "openai", model: "gpt-4o-mini", ollamaHost: "" };
    const j = JSON.parse(stripJsonBom(fs.readFileSync(cfg, "utf8")));
    const si = j && (j.senseIa || j.senseIA);
    if (!si || typeof si !== "object") {
      return {
        autoEveryMinutes: 15,
        provider: "openai",
        model: "gpt-4o-mini",
        ollamaHost: "",
        iaHybridEnabled: false,
        iaHybridButtonOnly: true,
      };
    }
    const n = Number(si.autoEveryMinutes);
    const autoEveryMinutes = !Number.isFinite(n) ? 15 : n <= 0 ? 0 : Math.min(1440, Math.floor(n));
    const providerRaw = String(si.provider || process.env.SENSE_IA_PROVIDER || "").trim().toLowerCase();
    const provider = providerRaw || "openai";
    const model = String(si.model || process.env.SENSE_IA_MODEL || (provider === "ollama" ? "llama3.2" : "gpt-4o-mini")).trim();
    const ollamaHost = String(si.ollamaHost || process.env.OLLAMA_HOST || "http://127.0.0.1:11434").trim();
    const hybrid = si.hybrid && typeof si.hybrid === "object" ? si.hybrid : {};
    const iaHybridEnabled = hybrid.enabled === true;
    const iaHybridButtonOnly = hybrid.buttonOnly !== false;
    return { autoEveryMinutes, provider, model, ollamaHost, iaHybridEnabled, iaHybridButtonOnly };
  } catch (e) {
    return {
      autoEveryMinutes: 15,
      provider: "openai",
      model: "gpt-4o-mini",
      ollamaHost: "",
      iaHybridEnabled: false,
      iaHybridButtonOnly: true,
    };
  }
});

ipcMain.handle("set-sense-ia-hybrid-enabled", async (_evt, enabled) => {
  try {
    if (typeof enabled !== "boolean") {
      return { ok: false, error: "set-sense-ia-hybrid-enabled: esperado boolean." };
    }
    const cfg = configPath();
    const current = readConfigJson();
    const next = current && typeof current === "object" ? { ...current } : {};
    const senseKey = next.senseIa && typeof next.senseIa === "object" ? "senseIa" : "senseIA";
    const prevSense = next[senseKey] && typeof next[senseKey] === "object" ? { ...next[senseKey] } : {};
    const prevHybrid = prevSense.hybrid && typeof prevSense.hybrid === "object" ? { ...prevSense.hybrid } : {};
    prevHybrid.enabled = enabled === true;
    if (typeof prevHybrid.buttonOnly !== "boolean") prevHybrid.buttonOnly = true;
    prevSense.hybrid = prevHybrid;
    next[senseKey] = prevSense;
    fs.writeFileSync(cfg, JSON.stringify(next, null, 2) + "\n", "utf8");
    return { ok: true, iaHybridEnabled: prevHybrid.enabled, iaHybridButtonOnly: prevHybrid.buttonOnly };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
});

ipcMain.handle("publish-sense-ia-verdict", async (_evt, payload) => {
  try {
    const gateSz = assertPlainObjectFromRenderer(payload, IPC.VERDICT_MAX_BYTES, "publish-sense-ia-verdict");
    if (!gateSz.ok) return { ok: false, error: gateSz.error };
    const p = gateSz.obj;
    const sideRaw = String(p.side || "").trim().toLowerCase();
    const side = sideRaw === "buy" || sideRaw === "sell" ? sideRaw : "";
    const confidenceRaw = Number(p.confidence);
    const confidence = Number.isFinite(confidenceRaw) ? Math.max(0, Math.min(100, confidenceRaw)) : 0;
    const decisionUpdatedAtRaw = Number(p.decisionUpdatedAt != null ? p.decisionUpdatedAt : p.updatedAt);
    const nowSec = Math.floor(Date.now() / 1000);
    const decisionUpdatedAt =
      Number.isFinite(decisionUpdatedAtRaw) && decisionUpdatedAtRaw > 0 ? Math.floor(decisionUpdatedAtRaw) : nowSec;
    const publishedAtRaw = Number(p.publishedAt);
    const publishedAt = Number.isFinite(publishedAtRaw) && publishedAtRaw > 0 ? Math.floor(publishedAtRaw) : nowSec;
    const ALLOW_VERDICT_KEYS = new Set([
      "enabled",
      "side",
      "confidence",
      "reason",
      "decisionUpdatedAt",
      "updatedAt",
      "publishedAt",
    ]);
    const extraKeys = Object.keys(p).filter((k) => !ALLOW_VERDICT_KEYS.has(k));
    if (extraKeys.length > 0) {
      return {
        ok: false,
        error: `Chaves não permitidas no veredito: ${extraKeys.join(", ")}`,
      };
    }

    const verdict = {
      schema: "sense_ia_verdict_v1",
      enabled: p.enabled === true,
      side,
      confidence,
      reason: String(p.reason || "").slice(0, 240),
      source: "painel-sense-desktop",
      updatedAt: decisionUpdatedAt,
      decisionUpdatedAt,
      publishedAt,
      channelPingAt: nowSec,
    };
    const outPath = senseIaVerdictFilePath();
    writeJsonAtomic(outPath, verdict, false);
    senseIaVerdictHeartbeat = verdict;
    return { ok: true, path: outPath };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
});

ipcMain.handle("save-ia-calibration-report", async (_evt, payload) => {
  try {
    const gate = assertPlainObjectFromRenderer(payload, IPC.SAVE_CALIBRATION_MAX_BYTES, "save-ia-calibration-report");
    if (!gate.ok) return { ok: false, error: gate.error };
    const allowCal = new Set(["stats", "metrics", "realtimeAlerts", "inputSnapshot", "topInputs"]);
    const keysOk = assertOnlyKeys(gate.obj, allowCal, "save-ia-calibration-report");
    if (!keysOk.ok) return { ok: false, error: keysOk.error };
    const p = gate.obj;

    const desktopDir = app.getPath("desktop");
    const dir = path.join(desktopDir, "Calibragem Inputs");
    fs.mkdirSync(dir, { recursive: true });
    const d = new Date();
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const ts = d.toISOString();
    const s = p.stats && typeof p.stats === "object" ? p.stats : {};
    const m = p.metrics && typeof p.metrics === "object" ? p.metrics : {};
    const alerts = Array.isArray(p.realtimeAlerts) ? p.realtimeAlerts : [];
    const snap = p.inputSnapshot && typeof p.inputSnapshot === "object" ? p.inputSnapshot : null;
    const top = Array.isArray(p.topInputs) ? p.topInputs : [];
    const dirBadge = (d) => {
      const x = String(d || "").toLowerCase();
      if (x.includes("afroux")) return "🟨 afrouxar";
      if (x.includes("endure")) return "🟥 endurecer";
      return "🟦 ajustar";
    };
    const lines = [
      "# Relatorio IA Auditora - Calibragem Inputs",
      "",
      `Atualizado em: ${ts}`,
      "",
      "## Evidencia Intraday (IA x EA)",
      `- Total de mudancas avaliadas: ${Number(s.total) || 0}`,
      `- Concordancias IA x EA: ${Number(s.agree) || 0}`,
      `- Divergencias IA x EA: ${Number(s.diverge) || 0}`,
      `- IA neutro vs EA ativo: ${Number(s.neutralVsEa) || 0}`,
      `- Divergencias lado COMPRA: ${Number(s.divergeBuy) || 0}`,
      `- Divergencias lado VENDA: ${Number(s.divergeSell) || 0}`,
      `- Oportunidades perdidas (proxy): ${Number(s.opportunityLoss) || 0}`,
      `- Alertas de alto risco: ${Number(s.highRiskAlerts) || 0}`,
      `- Motivo mais recente: ${String(s.lastReason || "n/d")}`,
      "",
      "## Metricas objetivas de qualidade",
      `- Taxa de concordancia IA x EA: ${Number(m.agreeRatePct) || 0}%`,
      `- Taxa de divergencia IA x EA: ${Number(m.divergenceRatePct) || 0}%`,
      `- Taxa IA neutra com EA ativo: ${Number(m.neutralVsEaRatePct) || 0}%`,
      `- Confianca atual da IA: ${Number(m.confidenceCurrentPct) || 0}%`,
      `- Tamanho da amostra: ${Number(m.sampleSize) || 0}`,
      "",
      "## Alertas uteis em tempo real",
    ];
    if (alerts.length > 0) {
      alerts.forEach((a, idx) => {
        const level = String((a && a.level) || "INFO").toUpperCase();
        const msg = String((a && a.message) || "n/d");
        lines.push(`${idx + 1}. [${level}] ${msg}`);
      });
    } else {
      lines.push("- Sem alertas ativos na ultima janela de análise.");
    }
    lines.push(
      "",
      "## Snapshot atual de inputs MT5 (fonte real)",
    );
    if (snap) {
      lines.push(`- FA_Ativo: ${String(snap.FA_Ativo ?? "ausente")}`);
      lines.push(`- Gatilho_MS_Ativo: ${String(snap.Gatilho_MS_Ativo ?? "ausente")}`);
      lines.push(`- Gatilho_MS_SpreadMaxPts: ${String(snap.Gatilho_MS_SpreadMaxPts ?? "ausente")}`);
      lines.push(`- Gatilho_Painel_Entry_Z_Min: ${String(snap.Gatilho_Painel_Entry_Z_Min ?? "ausente")}`);
      lines.push(`- Gatilho_Placar_Consenso_Pct: ${String(snap.Gatilho_Placar_Consenso_Pct ?? "ausente")}`);
      lines.push(`- Gatilho_Regime_Confiavel_Min: ${String(snap.Gatilho_Regime_Confiavel_Min ?? "ausente")}`);
    } else {
      lines.push("- Snapshot de inputs indisponivel no ciclo atual.");
    }
    lines.push(
      "",
      "## Top 10 Inputs Sugeridos (prioridade IA)",
    );
    if (top.length > 0) {
      lines.push("| # | Nome do input | Valor atual | Valor sugerido | Direção | Motivo intraday | Evidência | Impacto esperado |");
      lines.push("|---|---|---|---|---|---|---:|---|");
      top.forEach((it, idx) => {
        lines.push(
          `| ${idx + 1} | ${String(it.inputName || "n/d")} | ${String(it.currentValue || "n/d")} | ${String(it.suggestedValue || "n/d")} | ${dirBadge(it.direction)} | ${String(it.motivoIntraday || "n/d")} | ${Number(it.evidenceCount) || 0} | ${String(it.impactoEsperado || "n/d")} |`,
        );
      });
    } else {
      lines.push("- Ainda sem evidência suficiente para priorizar top 10 inputs.");
    }
    lines.push(
      "",
      "",
      "## Formato de decisao",
      "- Nome do input",
      "- Valor atual",
      "- Valor sugerido",
      "- Direcao (afrouxar / endurecer)",
      "- Motivo intraday",
      "- Evidencia (X divergencias IA x EA)",
      "- Impacto esperado",
      "",
    );
    const out = path.join(dir, `calibragem-inputs-${day}.md`);
    fs.writeFileSync(out, lines.join("\n"), "utf8");
    return { ok: true, path: out };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
});

/** Trigger manual do ciclo de auto-calib (DevTools / botão futuro). */
ipcMain.handle("trigger-inputs-autocalib", async () => {
  try {
    if (!inputsAutocalibInstance) {
      return { ok: false, error: "Auto-calib não está inicializado." };
    }
    void inputsAutocalibInstance.triggerNow();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
});

/** Persistência do histograma do Raio-X dos 22 filtros + ranking 1..N. */
ipcMain.handle("save-block-histogram", async (_evt, payload) => {
  try {
    const gate = assertPlainObjectFromRenderer(payload, IPC.SAVE_BLOCK_HISTOGRAM_MAX_BYTES, "save-block-histogram");
    if (!gate.ok) return { ok: false, error: gate.error };
    const allowKeys = new Set(["schema", "generatedAt", "dayKey", "totalRecords", "ranking"]);
    const keysOk = assertOnlyKeys(gate.obj, allowKeys, "save-block-histogram");
    if (!keysOk.ok) return { ok: false, error: keysOk.error };
    if (gate.obj.schema && gate.obj.schema !== "sense_block_histogram_v1") {
      return { ok: false, error: "save-block-histogram: schema inválido." };
    }
    if (gate.obj.ranking && !Array.isArray(gate.obj.ranking)) {
      return { ok: false, error: "save-block-histogram: ranking deve ser array." };
    }

    const dataFile = getDataFilePath();
    const dir = path.dirname(dataFile);
    const out = path.join(dir, "sense-block-histogram.json");
    fs.writeFileSync(out, JSON.stringify(gate.obj) + "\n", "utf8");
    return { ok: true, path: out };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
});

/**
 * Gera o relatório diário do Raio-X dos 22+ filtros (Markdown + CSV).
 * O renderer envia apenas metadata (dayLabel opcional, openFolder boolean).
 * O main lê o histograma persistido e o dashboard do disco — fontes confiáveis.
 *
 * Saída em Desktop/Calibragem Inputs/Raio-X SENSE YYYY-MM-DD.md (e .csv ao lado).
 */
ipcMain.handle("save-raiox-report", async (_evt, payload) => {
  try {
    const gate = assertPlainObjectFromRenderer(payload, IPC.SAVE_RAIOX_REPORT_MAX_BYTES, "save-raiox-report");
    if (!gate.ok) return { ok: false, error: gate.error };
    const allow = new Set(["dayLabel", "openFolder"]);
    const keysOk = assertOnlyKeys(gate.obj, allow, "save-raiox-report");
    if (!keysOk.ok) return { ok: false, error: keysOk.error };

    const result = await generateAndSaveRaioxReport({
      dayLabel: typeof gate.obj.dayLabel === "string" && /^\d{4}-\d{2}-\d{2}$/.test(gate.obj.dayLabel)
        ? gate.obj.dayLabel
        : null,
      openFolder: gate.obj.openFolder === true,
      trigger: "manual",
    });
    return result;
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
});

/**
 * Gera o relatório Raio-X (Markdown + CSV) e atualiza o baseline
 * sense-block-histogram-prev.json para que a próxima execução possa
 * calcular a coluna "Tendência".
 *
 * Reutilizada pelo IPC manual e pelo scheduler diário.
 *
 * @param {Object} opts
 * @param {string|null} opts.dayLabel  data forçada YYYY-MM-DD (null = automático)
 * @param {boolean} opts.openFolder    abrir Explorer na pasta de destino?
 * @param {"manual"|"scheduled"} opts.trigger origem (para logging futuro)
 */
async function generateAndSaveRaioxReport(opts) {
  const o = opts || {};
  const dataFile = getDataFilePath();
  const dataDir = path.dirname(dataFile);
  const histPath = path.join(dataDir, "sense-block-histogram.json");
  const prevPath = path.join(dataDir, "sense-block-histogram-prev.json");

  let histogram = { ranking: [] };
  if (fs.existsSync(histPath)) {
    try {
      histogram = JSON.parse(fs.readFileSync(histPath, "utf8"));
    } catch (e) {
      return { ok: false, error: "sense-block-histogram.json corrompido: " + e.message };
    }
  } else {
    return {
      ok: false,
      error:
        "Histograma ainda não foi gerado (sense-block-histogram.json não existe). Deixe o painel correr ≥60s primeiro.",
    };
  }

  let previousHistogram = null;
  if (fs.existsSync(prevPath)) {
    try {
      previousHistogram = JSON.parse(fs.readFileSync(prevPath, "utf8"));
    } catch (_) {
      previousHistogram = null;
    }
  }

  let dashboardData = null;
  if (fs.existsSync(dataFile)) {
    try {
      dashboardData = JSON.parse(fs.readFileSync(dataFile, "utf8"));
    } catch (_) {
      dashboardData = null;
    }
  }

  const buildOpts = {};
  if (o.dayLabel) buildOpts.dayLabel = o.dayLabel;
  if (previousHistogram) buildOpts.previousHistogram = previousHistogram;
  const report = buildRaioXReport(histogram, dashboardData, buildOpts);

  const desktopDir = app.getPath("desktop");
  const outDir = path.join(desktopDir, "Calibragem Inputs");
  fs.mkdirSync(outDir, { recursive: true });

  const day = report.stats.dayLabel;
  const mdOut = path.join(outDir, `Raio-X SENSE ${day}.md`);
  const csvOut = path.join(outDir, `Raio-X SENSE ${day}.csv`);
  fs.writeFileSync(mdOut, report.markdown, "utf8");
  fs.writeFileSync(csvOut, report.csv, "utf8");

  // Atualiza o baseline para o próximo ciclo (anti-corrupção: escrita atómica).
  try {
    const tmpPath = prevPath + ".tmp";
    fs.writeFileSync(tmpPath, JSON.stringify(histogram), "utf8");
    fs.renameSync(tmpPath, prevPath);
  } catch (e) {
    console.error("Aviso: falha ao actualizar baseline do Raio-X:", e && e.message ? e.message : e);
  }

  if (o.openFolder === true) {
    try {
      shell.openPath(outDir);
    } catch (_) {
      /* ignore */
    }
  }

  return {
    ok: true,
    mdPath: mdOut,
    csvPath: csvOut,
    stats: report.stats,
    trigger: o.trigger || "manual",
  };
}

/* ─────────────────────────────────────────────────────────────────────
 * Scheduler diário do Raio-X.
 *
 * Lê config.json (chave `raioxDailyReport`) com:
 *   {
 *     "enabled": true,
 *     "time": "18:30",              // HH:MM, horário local
 *     "skipIfNoHistogram": true     // não rodar se ainda não houver baseline
 *   }
 *
 * Mantém persistência em `data/<dataFile-dir>/sense-raiox-scheduler-state.json`
 * para evitar geração duplicada no mesmo dia (ex.: se o painel reinicia depois
 * das 18:30, ainda assim só roda uma vez por dia).
 * ─────────────────────────────────────────────────────────────────── */
let raioxSchedTimer = null;

function readRaioxScheduleConfig() {
  try {
    const j = readConfigJson();
    const r = j && j.raioxDailyReport ? j.raioxDailyReport : null;
    if (!r || typeof r !== "object") return { enabled: false };
    return {
      enabled: r.enabled === true,
      time: typeof r.time === "string" ? r.time : "18:30",
      skipIfNoHistogram: r.skipIfNoHistogram !== false,
    };
  } catch (_) {
    return { enabled: false };
  }
}

function raioxSchedStatePath() {
  return path.join(path.dirname(getDataFilePath()), "sense-raiox-scheduler-state.json");
}

function readRaioxSchedulerState() {
  try {
    const p = raioxSchedStatePath();
    if (!fs.existsSync(p)) return { lastRunDayKey: null };
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    return j && typeof j === "object" ? j : { lastRunDayKey: null };
  } catch (_) {
    return { lastRunDayKey: null };
  }
}

function writeRaioxSchedulerState(state) {
  try {
    const p = raioxSchedStatePath();
    const tmp = p + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(state || {}), "utf8");
    fs.renameSync(tmp, p);
  } catch (e) {
    console.error("Aviso: falha ao persistir estado do scheduler Raio-X:", e && e.message ? e.message : e);
  }
}

function startRaioxDailyScheduler() {
  if (raioxSchedTimer) {
    clearTimeout(raioxSchedTimer);
    raioxSchedTimer = null;
  }
  const cfg = readRaioxScheduleConfig();
  if (!cfg.enabled) return;
  if (!raioxSchedParseHhMm(cfg.time)) {
    console.error(`[raiox-sched] config inválida (time="${cfg.time}"). Esperado "HH:MM".`);
    return;
  }
  void scheduleNextRaioxRun(cfg);
}

async function scheduleNextRaioxRun(cfg) {
  const now = new Date();
  const state = readRaioxSchedulerState();

  // Se hoje ainda NÃO rodou e já passou do horário, rodar imediatamente.
  const hhmm = raioxSchedParseHhMm(cfg.time);
  const hadRunToday = !raioxSchedShouldRun(state.lastRunDayKey, now);
  const todaysTarget = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hhmm.hh, hhmm.mm, 0, 0);
  const alreadyPastTime = now.getTime() >= todaysTarget.getTime();
  let waitMs;
  if (alreadyPastTime && !hadRunToday) {
    waitMs = 1000; // pequeno delay para não competir com a inicialização
  } else {
    waitMs = raioxSchedComputeNextMs(cfg.time, now);
    if (!Number.isFinite(waitMs) || waitMs < 0) waitMs = 60_000;
  }

  console.log(
    `[raiox-sched] próximo disparo em ${(waitMs / 60_000).toFixed(1)} min (horário "${cfg.time}", lastRun=${state.lastRunDayKey || "n/d"})`,
  );

  raioxSchedTimer = setTimeout(async () => {
    raioxSchedTimer = null;
    const todayKey = raioxSchedDayKey(new Date());
    const cur = readRaioxSchedulerState();
    if (cur.lastRunDayKey === todayKey) {
      console.log(`[raiox-sched] já rodou hoje (${todayKey}), pulando.`);
      scheduleNextRaioxRun(cfg);
      return;
    }
    try {
      const r = await generateAndSaveRaioxReport({
        dayLabel: null,
        openFolder: false,
        trigger: "scheduled",
      });
      if (r && r.ok) {
        writeRaioxSchedulerState({ lastRunDayKey: todayKey, lastRunAt: new Date().toISOString(), lastFile: r.mdPath });
        console.log(`[raiox-sched] OK — relatório gerado: ${r.mdPath}`);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("raiox-daily-report-generated", {
            mdPath: r.mdPath,
            csvPath: r.csvPath,
            stats: r.stats,
          });
        }
      } else {
        console.error(`[raiox-sched] FALHA: ${(r && r.error) || "erro desconhecido"}`);
      }
    } catch (e) {
      console.error("[raiox-sched] exceção:", e && e.message ? e.message : e);
    }
    scheduleNextRaioxRun(cfg);
  }, waitMs);
}

/** Relatório A–F da SENSE IA (Gatilho FA) — Markdown no Ambiente de Trabalho. */
ipcMain.handle("save-ia-gatilho-fa-report", async (_evt, payload) => {
  try {
    const gate = assertPlainObjectFromRenderer(payload, IPC.SAVE_GATILHO_FA_MAX_BYTES, "save-ia-gatilho-fa-report");
    if (!gate.ok) return { ok: false, error: gate.error };
    const allowGf = new Set(["answer", "model", "provider", "readAt"]);
    const keysOk = assertOnlyKeys(gate.obj, allowGf, "save-ia-gatilho-fa-report");
    if (!keysOk.ok) return { ok: false, error: keysOk.error };
    const p = gate.obj;

    const desktopDir = app.getPath("desktop");
    const dir = path.join(desktopDir, "Relatórios Gatilho FA");
    fs.mkdirSync(dir, { recursive: true });
    const answer = String(p.answer || "").trim();
    if (!answer) {
      return { ok: false, error: "Gera o relatório Gatilho FA antes de guardar (resposta vazia)." };
    }
    const d = new Date();
    const slug = d.toISOString().replace(/[:.]/g, "-");
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const model = String(p.model || "n/d");
    const provider = String(p.provider || "n/d");
    const readAt = String(p.readAt || "n/d");
    const lines = [
      "# Relatório SENSE IA — Gatilho operacional (A–G)",
      "",
      `Guardado em: ${d.toISOString()}`,
      `Modelo: ${model}`,
      `Fornecedor: ${provider}`,
      `Leitura JSON (painel): ${readAt}`,
      "",
      "---",
      "",
      answer,
      "",
    ];
    const out = path.join(dir, `gatilho-fa-ia-${day}-${slug}.md`);
    fs.writeFileSync(out, lines.join("\n"), "utf8");
    return { ok: true, path: out };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
});

ipcMain.handle("get-security-status", async () => {
  const sec = readSecurityConfig();
  const machineLock = sec.machineLock && typeof sec.machineLock === "object" ? sec.machineLock : {};
  const sigCfg = sec.dashboardSignature && typeof sec.dashboardSignature === "object" ? sec.dashboardSignature : {};
  return {
    machineFingerprint: getCurrentMachineFingerprint(),
    machineLockEnabled: machineLock.enabled === true,
    dashboardSignatureEnabled: sigCfg.enabled === true,
    dashboardSignatureField: String(sigCfg.field || "_sig"),
  };
});

ipcMain.handle("get-license-status", async () => {
  return { ...licenseRuntimeStatus };
});

ipcMain.handle("get-sense-health", () => {
  return {
    ok: true,
    lastFileChangedAt: senseHealthState.lastFileChangedAt,
    lastReadSuccessAt: senseHealthState.lastReadSuccessAt,
    lastReadDurationMs: senseHealthState.lastReadDurationMs,
    readTimeoutCount: senseHealthState.readTimeoutCount,
    readFailCount: senseHealthState.readFailCount,
    lastReadFailAt: senseHealthState.lastReadFailAt,
    nowMs: Date.now(),
  };
});
