/**
 * Níveis (rótulos, slot, barrinhas SR), texto sem acentos corruptos, fluxo Z/NTSL (classes + viés HTML), snapshot SR.
 * Depende de renderer-utils (`repairPortugueseDisplayText`, `escapeHtml`).
 * `trendBiasLabel` vem de renderer-gatilho.js — só usada em runtime por `trendBiasLabelHtml`.
 * Carregar depois de renderer-sense-ia.js e antes de renderer-regime-context.js.
 */
(function () {
  "use strict";
  if (typeof window === "undefined") {
    throw new Error("Painel SENSE: ambiente sem window.");
  }
  if (typeof repairPortugueseDisplayText !== "function") {
    throw new Error("Painel SENSE: falta renderer-utils.js antes de renderer-flow-levels.js (ver index.html).");
  }
  if (typeof escapeHtml !== "function") {
    throw new Error("Painel SENSE: falta renderer-utils.js antes de renderer-flow-levels.js (ver index.html).");
  }
})();

function formatLevelLabelForDisplay(label) {
  let s = String(label || "").trim();
  s = s.replace(/\bALVO\s+VENDA\b/gi, "ALVO PROJETADO VENDA");
  s = s.replace(/\bALVO\s+COMPRA\b/gi, "ALVO PROJETADO COMPRA");
  s = s.replace(/\bH4\b/gi, "");
  s = s.replace(/\bL4\b/gi, "");
  s = s.replace(/\bN\d{2}\b/gi, "");
  s = s.replace(/\s{2,}/g, " ").trim();
  return s.length ? s : "—";
}

/** Mantém cada item do bloco de níveis sempre na mesma linha, mesmo quando o texto muda. */
function levelSlotKey(label) {
  const s = stripAccentsForDisplay(String(label || "")).toUpperCase();
  if (s.includes("ALVO PROJETADO VENDA")) return "target_sell";
  if (s.includes("ALVO PROJETADO COMPRA")) return "target_buy";
  if (s.includes("RESISTENCIA")) return "resistance";
  if (s.includes("SUPORTE")) return "support";
  if (s.includes("MELHOR VENDA")) return "best_sell";
  if (s.includes("MELHOR COMPRA")) return "best_buy";
  return `misc:${s}`;
}

/**
 * Barrinhas ao lado do preço — Suporte/Resistência detectados ou Melhor compra/venda detectada.
 * flow01: 0–1 = força agregada do fluxo (|Z mini|, |Z ref|, |Δ|, placar), sobe e desce com o mercado.
 */
function renderSrMeterBarsForLevel(label, flow01) {
  const s = stripAccentsForDisplay(String(label || "")).toUpperCase();
  const isSup = s.includes("SUPORTE");
  const isRes = s.includes("RESISTENCIA");
  const isBuySide = s.includes("COMPRA") || isSup;
  const isSellSide = s.includes("VENDA") || isRes;
  const isFalse = s.includes("FALSO") || s.includes("FALSA");
  const supDet = isSup && (s.includes("DETECTADO") || s.includes("DETECTADA"));
  const resDet = isRes && (s.includes("DETECTADA") || s.includes("DETECTADO"));
  const melhorCompraDet =
    s.includes("MELHOR") &&
    s.includes("COMPRA") &&
    (s.includes("DETECTADO") || s.includes("DETECTADA"));
  const melhorVendaDet =
    s.includes("MELHOR") &&
    s.includes("VENDA") &&
    (s.includes("DETECTADO") || s.includes("DETECTADA"));
  const trackedLevel = supDet || resDet || melhorCompraDet || melhorVendaDet || isFalse;
  if (!trackedLevel) return "";
  const t = Number(flow01);
  const flow = Number.isFinite(t) ? Math.max(0, Math.min(1, t)) : 0;
  const total = 12;
  const filledRaw = Math.round(flow * total);
  const filled = Math.max(3, Math.min(total, filledRaw));
  const pct = Math.round(flow * 100);
  let palette = isBuySide && !isSellSide ? "sr-meter--sup" : "sr-meter--res";
  // Em estado "falso", inverter a cor para evidenciar fluxo contrário.
  if (isFalse) {
    palette = palette === "sr-meter--sup" ? "sr-meter--res" : "sr-meter--sup";
  }
  let html = `<span class="sr-meter ${palette}" style="--sr-flow:${flow}" role="img" aria-label="Fluxo ${pct} por cento" title="Fluxo (Z/Δ/placar): ${pct}%">`;
  for (let i = 0; i < total; i++) {
    const on = i < filled ? " sr-meter__seg--on" : " sr-meter__seg--off";
    const segBoost =
      i < filled && filled > 0 ? ` style="--sr-seg:${((i + 1) / filled).toFixed(4)}"` : "";
    html += `<span class="sr-meter__seg${on} ${palette}"${segBoost}></span>`;
  }
  html += "</span>";
  return html;
}

/** Evita e acentos mal codificados no texto vindo do EA (ex.: UTF-8 errado no MQL5). */
function stripAccentsForDisplay(s) {
  return repairPortugueseDisplayText(String(s || ""))
    .replace(/\uFFFD/g, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
/** HTML do viés + pulsada leve em todo o texto (Baixa Forte, Neutro, etc.). */
function trendBiasLabelHtml(trendDir, ntslZ, lateralPct, weakPct, strongPct) {
  const label = trendBiasLabel(trendDir, ntslZ, lateralPct, weakPct, strongPct);
  const esc = escapeHtml(label);
  const pulseCls = "flow-trend-label";
  if (label === "TEND. DE BAIXA FORTE") {
    return `<strong class="flow-trend flow-trend--sell-strong ${pulseCls}">${esc}</strong>`;
  }
  if (label === "TEND. DE ALTA FORTE") {
    return `<strong class="flow-trend flow-trend--buy-strong ${pulseCls}">${esc}</strong>`;
  }
  if (label === "ATIVO LATERAL") {
    return `<strong class="flow-trend flow-trend--lateral ${pulseCls}">${esc}</strong>`;
  }
  return `<strong class="${pulseCls}">${esc}</strong>`;
}

/** Z ou % NTSL: família visual Δ bem atenuada; “forte” só com |valor| alto (≥0,85). */
function flowRowClassFromSignedMetric(v) {
  const z = Number(v);
  const base = "flow-row delta-row";
  if (!Number.isFinite(z)) return `${base} delta-row--neut`;
  if (z > 0.85) return `${base} delta-row--buy`;
  if (z < -0.85) return `${base} delta-row--sell`;
  if (z > 0.02) return `${base} delta-row--buy-soft`;
  if (z < -0.02) return `${base} delta-row--sell-soft`;
  return `${base} delta-row--neut`;
}

/** Viés/TEND.: classes alinhadas ao texto final da tendência. */
function flowRowClassFromTrendBias(trendDir, ntslZ, lateralPct, weakPct, strongPct) {
  const label = trendBiasLabel(trendDir, ntslZ, lateralPct, weakPct, strongPct);
  const base = "flow-row delta-row";
  if (label === "TEND. DE ALTA FORTE") return `${base} delta-row--buy-soft flow-row--pulse`;
  if (label === "TEND. DE ALTA") return `${base} delta-row--buy-soft`;
  if (label === "TEND. DE BAIXA FORTE") return `${base} delta-row--sell-soft flow-row--pulse`;
  if (label === "TEND. DE BAIXA") return `${base} delta-row--sell-soft`;
  return `${base} delta-row--neut`;
}

/** Rótulo Viés/TEND. igual ao bloco flow (null se sem flow). */


/** Placar SR vinha do EA (JSON) — uma leitura para fingerprint e para o mini‑placar. */
function srDetectSnapshot(d) {
  if (!d || typeof d !== "object") {
    return { buy: NaN, sell: NaN, leader: "" };
  }
  return {
    buy: Number(d.srDetectBuyPts),
    sell: Number(d.srDetectSellPts),
    leader: String(d.srDetectLeader || ""),
  };
}
