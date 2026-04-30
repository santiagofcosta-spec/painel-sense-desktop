"use strict";

const fs = require("fs");
const { runSenseIaAsk } = require("./sense-ia-ask-core.js");
const { loadCompactContext } = require("./sense-ia-context.js");

const SENSE_IA_PROFILE_AUTO_CYCLE = "auto_cycle";
const DASHBOARD_MAX_AGE_S = 300;

function parseAutoCycleResponse(answer) {
  if (!answer || typeof answer !== "string") return { vies: null, confianca: null, razao: null };
  const clean = answer.replace(/\*\*/g, "");
  const viesMatch = clean.match(/Vi[eé]s:\s*(Alta|Baixa|Lateral)/i);
  const confMatch = clean.match(/Confian[cç]a:\s*(\d+)%/i);
  const razaoMatch = clean.match(/Raz[aã]o:\s*(.+)/i);
  return {
    vies: viesMatch ? viesMatch[1] : null,
    confianca: confMatch ? parseInt(confMatch[1], 10) : null,
    razao: razaoMatch ? razaoMatch[1].trim() : null,
  };
}

function isPregao(pregao, now) {
  if (!pregao || typeof pregao !== "object") return false;
  const tz = String(pregao.timezone || "").trim() || "America/Sao_Paulo";
  const start = String(pregao.start || "09:00");
  const end = String(pregao.end || "17:30");
  const d = now || new Date();
  const fmt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const hour = parseInt(parts.find((p) => p.type === "hour").value, 10);
  const minute = parseInt(parts.find((p) => p.type === "minute").value, 10);
  const current = hour * 60 + minute;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return current >= sh * 60 + sm && current <= eh * 60 + em;
}

function isDashboardFresh(mt5TimeStr, maxAgeS) {
  if (!mt5TimeStr || typeof mt5TimeStr !== "string") return false;
  const iso = mt5TimeStr.replace(/(\d{4})\.(\d{2})\.(\d{2})/, "$1-$2-$3");
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return Date.now() - d.getTime() < maxAgeS * 1000;
}

function detectChange(newVies, newConfianca, state, cycleConfig) {
  const s = state || { lastVies: null, lastConfianca: null };
  const c = cycleConfig || {};
  const threshold = Number(c.notifyOnConfiancaRiseThreshold);
  const riseThreshold = Number.isFinite(threshold) ? threshold : 30;

  if (s.lastVies === null) {
    return { shouldNotify: true, type: "baseline", prevVies: null, prevConfianca: null };
  }

  const viesChanged = c.notifyOnViesChange !== false && newVies !== s.lastVies;
  const confiancaRose =
    Number.isFinite(newConfianca) &&
    Number.isFinite(s.lastConfianca) &&
    newConfianca - s.lastConfianca >= riseThreshold;

  if (viesChanged) {
    return { shouldNotify: true, type: "vies", prevVies: s.lastVies, prevConfianca: s.lastConfianca };
  }
  if (confiancaRose) {
    return { shouldNotify: true, type: "confianca", prevVies: s.lastVies, prevConfianca: s.lastConfianca };
  }
  return { shouldNotify: false, type: "none", prevVies: s.lastVies, prevConfianca: s.lastConfianca };
}

class SenseIaAutoCycle {
  constructor({ getWindow, configPath, intervalMs }) {
    this._getWindow = getWindow;
    this._configPath = configPath;
    this._intervalMs = intervalMs || 15 * 60 * 1000;
    this._timerId = null;
    this._state = { lastVies: null, lastConfianca: null };
  }

  start() {
    if (this._timerId) return;
    this._runCycle();
    this._timerId = setInterval(() => this._runCycle(), this._intervalMs);
  }

  stop() {
    if (!this._timerId) return;
    clearInterval(this._timerId);
    this._timerId = null;
  }

  async _runCycle() {
    const config = this._readConfig();
    const autoCycle = config && config.senseIA && config.senseIA.autoCycle;
    if (!autoCycle || autoCycle.enabled !== true) return;
    if (!isPregao(autoCycle.pregao)) return;

    const ctx = loadCompactContext({ SENSE_DASHBOARD_DATA_FILE: config.dataFile || "" });
    if (ctx.error) {
      this._emit({ type: "error", message: "IA: Erro ao ler dashboard." });
      return;
    }

    const mt5Time = (ctx.compact && ctx.compact.meta && ctx.compact.meta.time) || null;
    if (!isDashboardFresh(mt5Time, DASHBOARD_MAX_AGE_S)) {
      this._emit({ type: "stale", message: "IA: Dados desatualizados - ciclo ignorado." });
      return;
    }

    const result = await this._callWithFallback(autoCycle, config.dataFile || "");
    if (!result.ok) {
      this._emit({ type: "error", message: "IA: Leitura automática falhou - verifique o Ollama." });
      return;
    }

    const parsed = parseAutoCycleResponse(result.answer);
    const change = detectChange(parsed.vies, parsed.confianca, this._state, autoCycle);
    this._state = { lastVies: parsed.vies, lastConfianca: parsed.confianca };

    if (result.usedFallback) {
      this._emit({
        type: "fallback",
        message: `IA: Ollama indisponível - usando ${result.provider}.`,
        provider: result.provider,
        toastDurationMs: autoCycle.toastDurationMs || 30000,
      });
    }

    if (change.shouldNotify) {
      this._emit({
        type: change.type,
        vies: parsed.vies,
        confianca: parsed.confianca,
        razao: parsed.razao,
        provider: result.provider,
        prevVies: change.prevVies,
        prevConfianca: change.prevConfianca,
        toastDurationMs: autoCycle.toastDurationMs || 30000,
      });
    }
  }

  async _callWithFallback(autoCycle, dataFile) {
    const baseEnv = {
      SENSE_IA_PROMPT_PROFILE: SENSE_IA_PROFILE_AUTO_CYCLE,
      SENSE_DASHBOARD_DATA_FILE: dataFile,
      SENSE_IA_OLLAMA_TIMEOUT_MS: String(autoCycle.ollamaTimeoutMs || 25000),
    };

    const ollamaResult = await runSenseIaAsk({ ...process.env, ...baseEnv, SENSE_IA_PROVIDER: "ollama" });
    if (ollamaResult.ok) return { ...ollamaResult, usedFallback: false };

    const openaiResult = await runSenseIaAsk({ ...process.env, ...baseEnv, SENSE_IA_PROVIDER: "openai" });
    if (openaiResult.ok) return { ...openaiResult, usedFallback: true };

    const gensparkResult = await runSenseIaAsk({ ...process.env, ...baseEnv, SENSE_IA_PROVIDER: "genspark" });
    if (gensparkResult.ok) return { ...gensparkResult, usedFallback: true };

    return { ok: false };
  }

  _emit(payload) {
    const win = this._getWindow && this._getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send("sense-ia-cycle-result", payload);
    }
  }

  _readConfig() {
    try {
      return JSON.parse(fs.readFileSync(this._configPath, "utf8"));
    } catch (_) {
      return null;
    }
  }
}

module.exports = {
  SenseIaAutoCycle,
  parseAutoCycleResponse,
  isPregao,
  isDashboardFresh,
  detectChange,
  SENSE_IA_PROFILE_AUTO_CYCLE,
};
