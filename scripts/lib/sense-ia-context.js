/**
 * SENSE IA — leitura do dashboard (partilhado entre scripts).
 */
"use strict";

const fs = require("fs");
const path = require("path");

function stripJsonBom(s) {
  if (typeof s !== "string") return s;
  let t = s.trim();
  if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
  return t;
}

function parseJsonWithEncodingFallback(filePath) {
  const rawBuffer = fs.readFileSync(filePath);
  const rawUtf8 = stripJsonBom(rawBuffer.toString("utf8"));
  try {
    return JSON.parse(rawUtf8);
  } catch (_) {
    const rawLatin1 = stripJsonBom(rawBuffer.toString("latin1"));
    try {
      return JSON.parse(rawLatin1);
    } catch (_) {
      const rawUtf16 = stripJsonBom(rawBuffer.toString("utf16le"));
      return JSON.parse(rawUtf16);
    }
  }
}

function getDataFilePath(env) {
  const e = env && typeof env === "object" ? env : process.env;
  const fromEnv = String(e.SENSE_DASHBOARD_DATA_FILE || "").trim();
  if (fromEnv) {
    return path.isAbsolute(fromEnv) ? fromEnv : path.join(__dirname, "..", "..", fromEnv);
  }
  const cfgPath = path.join(__dirname, "..", "..", "config.json");
  try {
    if (fs.existsSync(cfgPath)) {
      const j = parseJsonWithEncodingFallback(cfgPath);
      if (j && typeof j.dataFile === "string" && j.dataFile.trim().length > 0) {
        const p = j.dataFile.trim();
        return path.isAbsolute(p) ? p : path.join(__dirname, "..", "..", p);
      }
    }
  } catch (e) {
    const err = new Error(`config.json: ${e.message}`);
    err.code = "CONFIG";
    throw err;
  }
  return path.join(__dirname, "..", "..", "data", "dashboard.json");
}

function pick(o, keys) {
  const out = {};
  for (const k of keys) {
    if (o && Object.prototype.hasOwnProperty.call(o, k)) out[k] = o[k];
  }
  return out;
}

function normalizeSideFromText(v) {
  const s = String(v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  if (!s) return null;
  if (s.includes("COMPRA") || s.includes("COMPRADOR") || s.includes("ALTA")) return "buy";
  if (s.includes("VENDA") || s.includes("VENDEDOR") || s.includes("BAIXA")) return "sell";
  return null;
}

function computePainelBiasSummary(data) {
  let buy = 0;
  let sell = 0;
  const reasons = [];

  const radarSide = normalizeSideFromText(data && data.radar && data.radar.dir);
  if (radarSide === "buy") {
    buy += 3;
    reasons.push("radar compra");
  } else if (radarSide === "sell") {
    sell += 3;
    reasons.push("radar venda");
  }

  const regimeSide = normalizeSideFromText(data && data.regimeMercado && data.regimeMercado.vies);
  if (regimeSide === "buy") {
    buy += 2;
    reasons.push("regime comprador");
  } else if (regimeSide === "sell") {
    sell += 2;
    reasons.push("regime vendedor");
  }

  const trendSide = normalizeSideFromText(data && data.flow && data.flow.trendDir);
  if (trendSide === "buy") {
    buy += 1;
    reasons.push("flow trend compra");
  } else if (trendSide === "sell") {
    sell += 1;
    reasons.push("flow trend venda");
  }

  const aggrSide = normalizeSideFromText(data && data.aggression);
  if (aggrSide === "buy") {
    buy += 1;
    reasons.push("agressao compradora");
  } else if (aggrSide === "sell") {
    sell += 1;
    reasons.push("agressao vendedora");
  }

  const buyN = Number(data && data.buy);
  const sellN = Number(data && data.sell);
  if (Number.isFinite(buyN) && Number.isFinite(sellN) && buyN !== sellN) {
    if (buyN > sellN) {
      buy += 1;
      reasons.push("placar compra");
    } else {
      sell += 1;
      reasons.push("placar venda");
    }
  }

  const side = buy > sell ? "buy" : sell > buy ? "sell" : "neutral";
  const label = side === "buy" ? "Alta" : side === "sell" ? "Baixa" : "Lateral";
  const delta = Math.abs(buy - sell);
  const confidence01 = Math.max(0, Math.min(1, delta / 4));
  return {
    side,
    label,
    scoreBuy: buy,
    scoreSell: sell,
    confidence01,
    reasons: reasons.slice(0, 6),
  };
}

function compactDashboardForAI(data) {
  if (!data || typeof data !== "object") return { error: "payload inválido" };
  const out = {
    schemaVersion: data.schemaVersion,
    meta: pick(data.meta || {}, ["time", "symbol"]),
    placar: pick(data, ["buy", "sell"]),
    placarLine: typeof data.placarLine === "string" ? data.placarLine : undefined,
    aggression: typeof data.aggression === "string" ? data.aggression : undefined,
    alert: typeof data.alert === "string" ? data.alert : undefined,
  };

  const rm = data.regimeMercado;
  if (rm && typeof rm === "object") {
    out.regimeMercado = pick(rm, ["ativo", "rotulo", "codigo", "vies", "confianca", "notas"]);
  }

  const fl = data.flow;
  if (fl && typeof fl === "object") {
    out.flow = pick(fl, ["zMini", "zRef", "ntslZ", "trendDir"]);
  }

  const d = data.delta;
  if (d && typeof d === "object") {
    out.delta = pick(d, [
      "buyPct",
      "sellPct",
      "deltaPct",
      "buyVol",
      "sellVol",
      "streak",
      "hammer",
    ]);
  }

  const mk = data.makers;
  if (mk && typeof mk === "object") {
    out.makers = pick(mk, ["mini", "ref"]);
  }

  const rad = data.radar;
  if (rad && typeof rad === "object") {
    out.radar = pick(rad, ["dir", "peaks", "persist", "saldoPicos", "saldoPersist", "flip"]);
  }

  const ap = data.aggressionProxy;
  if (ap && typeof ap === "object") {
    out.aggressionProxy = pick(ap, ["finePct", "heavyPct", "heavySide"]);
  }

  const go = data.gatilho;
  if (go && typeof go === "object") {
    out.gatilho = pick(go, [
      "buyReady",
      "sellReady",
      "buyBlockReason",
      "sellBlockReason",
      "consensoSegundos",
      "consensoSegRestantesCompra",
      "consensoSegRestantesVenda",
    ]);
  }

  if (Array.isArray(data.levels) && data.levels.length) {
    out.levelsCount = data.levels.length;
    out.levelsSample = data.levels.slice(0, 5).map((row) =>
      pick(row || {}, ["label", "value", "intensity"]),
    );
  }

  out.painelBias = computePainelBiasSummary(data);

  return out;
}

/** Lê e compacta em memória; devolve { dataPath, compact, error? }. */
function loadCompactContext(env) {
  let dataPath;
  try {
    dataPath = getDataFilePath(env);
  } catch (e) {
    return { error: e.message, code: e.code || "ERR" };
  }
  if (!fs.existsSync(dataPath)) {
    return {
      error: "ficheiro não encontrado",
      dataPath,
      hint: "Confirma dataFile em config.json (ex.: MQL5\\Files\\dashboard.json).",
    };
  }
  let data;
  try {
    data = parseJsonWithEncodingFallback(dataPath);
  } catch (e) {
    return { error: e.message, dataPath };
  }
  const compact = compactDashboardForAI(data);
  compact._senseIa = { name: "SENSE IA", role: "contexto compacto do dashboard para leitura / prompts" };
  compact._sourcePath = dataPath;
  compact._readAt = new Date().toISOString();
  return { dataPath, compact };
}

module.exports = {
  stripJsonBom,
  getDataFilePath,
  pick,
  compactDashboardForAI,
  loadCompactContext,
};
