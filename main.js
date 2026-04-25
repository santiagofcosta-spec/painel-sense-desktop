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
const { fetchBcPtaxUsdAuto } = require("./bc-ptax-fetch.js");
const {
  runSenseIaAsk,
  mergeSenseIaEnvWithConfigFile,
} = require(path.join(__dirname, "scripts", "lib", "sense-ia-ask-core.js"));

let mainWindow = null;
/** fs.watch da pasta do dashboard — leitura imediata quando o MT5 grava (além do intervalo). */
let dashboardWatchHandle = null;
let dashboardWatchDebounce = null;
/**
 * Quando true, não reutilizamos `dashboardCacheByPath` como “fonte” antes de reler o disco
 * (evita mostrar dados de um path antigo após mudar `dataFile`).
 * Mesmo assim mantemos fallback a `lastGoodDataGlobal` / cache após falhas de leitura.
 */
const ULTRA_REALTIME_MODE = true;

/** Último JSON válido por caminho (evita flicker quando o MT5 grava e o parse falha a meio). */
const dashboardCacheByPath = new Map();
/** Fallback se o caminho em config oscilar ou ainda não houver cache nesse path. */
let lastGoodDataGlobal = null;

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

function stableStringify(value) {
  if (Array.isArray(value)) {
    return "[" + value.map((x) => stableStringify(x)).join(",") + "]";
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort((a, b) => a.localeCompare(b));
    return (
      "{" +
      keys
        .map((k) => JSON.stringify(k) + ":" + stableStringify(value[k]))
        .join(",") +
      "}"
    );
  }
  return JSON.stringify(value);
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
  const ax = String(a || "").trim().toLowerCase();
  const bx = String(b || "").trim().toLowerCase();
  if (ax.length !== bx.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(ax, "utf8"), Buffer.from(bx, "utf8"));
  } catch (e) {
    return false;
  }
}

function normalizeHexSig(sigRaw) {
  const s = String(sigRaw || "").trim().toLowerCase();
  if (s.startsWith("sha256=")) return s.slice("sha256=".length).trim();
  return s;
}

function readSecurityConfig() {
  const cfg = readConfigJson();
  if (!cfg || typeof cfg !== "object" || !cfg.security || typeof cfg.security !== "object") {
    return {};
  }
  return cfg.security;
}

function getCurrentMachineFingerprint() {
  const host = String(os.hostname() || "").trim().toLowerCase();
  let user = "";
  try {
    user = String(os.userInfo().username || "").trim().toLowerCase();
  } catch (e) {
    user = String(process.env.USERNAME || process.env.USER || "").trim().toLowerCase();
  }
  const plat = `${process.platform}|${process.arch}`;
  const sec = readSecurityConfig();
  const machineLock = sec.machineLock && typeof sec.machineLock === "object" ? sec.machineLock : {};
  const salt =
    String(process.env.SENSE_MACHINE_SALT || machineLock.salt || "").trim();
  return sha256Hex(`${host}|${user}|${plat}|${salt}`);
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
  const secret = String(process.env.SENSE_DASH_SIG_SECRET || sigCfg.secret || "").trim();
  if (!secret) {
    return { ok: false, error: "Assinatura ativa, mas segredo ausente (SENSE_DASH_SIG_SECRET ou config.security.dashboardSignature.secret)." };
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
  for (let i = 0; i < 8; i++) {
    try {
      const rawBuffer = await fs.promises.readFile(filePath);
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
      return { data, raw: rawUtf8, rawLatin1, rawUtf16 };
    } catch (e) {
      lastErr = e;
      await delay(6);
    }
  }
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
      if (filename != null && filename !== base && String(filename).toLowerCase() !== base.toLowerCase()) {
        return;
      }
      if (dashboardWatchDebounce) clearTimeout(dashboardWatchDebounce);
      dashboardWatchDebounce = setTimeout(() => {
        dashboardWatchDebounce = null;
        notifyDashboardFileChanged();
      }, 8);
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
  try {
    let exists = false;
    try {
      await fs.promises.access(filePath, fs.constants.F_OK);
      exists = true;
    } catch (_) {
      exists = false;
    }
    if (!exists) {
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
    const parsed = await readAndParseDashboard(filePath);
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
    if (!sig.ok) {
      if (cached) {
        return {
          ok: true,
          path: filePath,
          error: sig.error + " A mostrar último snapshot válido.",
          data: cached,
          stale: true,
        };
      }
      const fb = fallback();
      if (fb) {
        fb.error = sig.error + " A usar último snapshot global.";
        return fb;
      }
      return {
        ok: false,
        path: filePath,
        error: sig.error,
        data: null,
      };
    }
    /*
     * Sempre gravar cache após JSON completo: se a validação estrita falhar durante
     * gravação do EA (parse a seguir a falhar / ficheiro truncado), ainda há último
     * snapshot — senão lastGoodDataGlobal fica null e o painel “morre” (sem leitura).
     * O renderer continua a receber sempre `data` do disco (não voltamos ao cache aqui).
     */
    dashboardCacheByPath.set(filePath, data);
    lastGoodDataGlobal = data;

    if (!fullDashboardSnapshotStable(data)) {
      return {
        ok: true,
        path: filePath,
        error:
          "Ficheiro lido ao vivo; validação HUD estrita pendente (normal durante gravação do EA).",
        data,
        stale: true,
        liveData: true,
      };
    }
    return { ok: true, path: filePath, error: null, data, stale: false };
  } catch (e) {
    const msg = e.message || String(e);
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
}

/**
 * Enriquece `ptaxBussola` com média PTAX do BC (Olinda), em tempo real no painel.
 * Desativar: no JSON, `"bcPtaxAutoFetch": false` dentro de `ptaxBussola`.
 */
async function mergePtaxBcFromOlinda(data) {
  if (!data || typeof data !== "object") return data;
  const pb = data.ptaxBussola;
  if (!pb || typeof pb !== "object") return data;
  if (pb.enabled === false) return data;
  if (pb.bcPtaxAutoFetch === false) return data;
  try {
    const r = await fetchBcPtaxUsdAuto();
    if (!r || !r.ok || r.media == null || !Number.isFinite(r.media)) {
      return {
        ...data,
        ptaxBussola: {
          ...pb,
          bcPtaxFetchError: (r && r.error) || "PTAX BC (Olinda) sem média válida.",
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
  } catch (e) {
    return {
      ...data,
      ptaxBussola: {
        ...pb,
        bcPtaxFetchError: e.message || String(e),
      },
    };
  }
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
  const fp = getDataFilePath();
  /* Evitar imprimir caminho com acentos no CMD (codepage) — só confirma leitura. */
  console.log("[Painel SENSE] JSON:", fs.existsSync(fp) ? "ficheiro encontrado" : "ficheiro em falta");
  const dq = demoPulsoSpeedQueryFromEnvOrConfig();
  if (dq && dq.demoPulso === "1") {
    console.log("[Painel SENSE] Demo pulso Speed: %PICO / %PERSIST simulados (ciclo).");
  }
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("read-dashboard", async () => {
  const r = await readDashboardJson();
  if (!r.ok) {
    console.warn("[Painel SENSE] read-dashboard falhou:", r.error || "sem dados", r.path || "");
    return r;
  }
  if (r.data) {
    try {
      r.data = await mergePtaxBcFromOlinda(r.data);
    } catch (e) {
      console.warn("[Painel SENSE] PTAX BC Olinda:", e.message || e);
    }
  }
  return r;
});
ipcMain.handle("pick-dashboard-file", async () => {
  const r = await pickAndSaveDashboardFile();
  if (r && r.ok) startDashboardWatch();
  return r;
});

/** SENSE IA: envia contexto compacto ao modelo (chaves em env ou em `senseIa` dentro de config.json). */
ipcMain.handle("sense-ia-ask", async () => {
  const env = mergeSenseIaEnvWithConfigFile(
    {
      ...process.env,
      SENSE_DASHBOARD_DATA_FILE: getDataFilePath(),
    },
    configPath(),
  );
  return await runSenseIaAsk(env);
});

/** Intervalo da leitura automática (minutos). 0 = desligado. Omisso = 30. */
ipcMain.handle("get-sense-ia-schedule", async () => {
  try {
    const cfg = configPath();
    if (!fs.existsSync(cfg)) return { autoEveryMinutes: 15 };
    const j = JSON.parse(stripJsonBom(fs.readFileSync(cfg, "utf8")));
    const si = j && j.senseIa;
    if (!si || typeof si !== "object") return { autoEveryMinutes: 15 };
    const n = Number(si.autoEveryMinutes);
    if (!Number.isFinite(n)) return { autoEveryMinutes: 15 };
    if (n <= 0) return { autoEveryMinutes: 0 };
    return { autoEveryMinutes: Math.min(1440, Math.floor(n)) };
  } catch (e) {
    return { autoEveryMinutes: 15 };
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
