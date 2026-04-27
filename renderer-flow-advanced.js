/**
 * renderer-flow-advanced.js
 * Blocos avançados de fluxo: Z normalizado, TapeSpeed, SpreadZ (Fase 1)
 * e Footprint + Absorção Real (Fase 2, adicionados em tasks posteriores).
 * Depende de: renderer-utils.js (escapeHtml, fmtNum).
 * Carregar depois de renderer-hud.js (ver index.html).
 */
(function () {
  "use strict";
  if (typeof escapeHtml !== "function") {
    throw new Error("SENSE: falta renderer-utils.js antes de renderer-flow-advanced.js.");
  }
})();

// ── Helpers de classe CSS ─────────────────────────────────────────────────

function flowAdvZNormClass(v) {
  if (v == null || !Number.isFinite(v)) return "flow-adv--neutro";
  const a = Math.abs(v);
  if (a < 0.5) return "flow-adv--neutro";
  if (a < 1.5)  return v > 0 ? "flow-adv--buy-weak"  : "flow-adv--sell-weak";
  if (a < 2.5)  return v > 0 ? "flow-adv--buy-mid"   : "flow-adv--sell-mid";
  return v > 0 ? "flow-adv--buy-hot" : "flow-adv--sell-hot";
}

function flowAdvTapeClass(z) {
  if (!Number.isFinite(z) || Math.abs(z) < 0.5) return "flow-adv-tape--idle";
  if (Math.abs(z) < 1.0) return "flow-adv-tape--warm";
  if (Math.abs(z) < 2.0) return "flow-adv-tape--hot";
  return "flow-adv-tape--blast";
}

// ── Linhas individuais ────────────────────────────────────────────────────

function renderZNormRow(label, value) {
  const v   = Number.isFinite(Number(value)) ? Number(value) : null;
  const cls = flowAdvZNormClass(v);
  const txt = v != null ? (v > 0 ? "+" : "") + v.toFixed(2) : "—";
  return `<div class="flow-adv-row ${escapeHtml(cls)}">` +
    `<span class="flow-adv-k">${escapeHtml(label)}</span>` +
    `<span class="flow-adv-v">${escapeHtml(txt)}</span>` +
    `</div>`;
}

function renderTapeSpeedRow(fa) {
  const z   = fa.tapeSpeedZ != null ? Number(fa.tapeSpeedZ) : null;
  const tps = fa.tapeTicksPerSec != null ? Number(fa.tapeTicksPerSec) : null;
  const cls = flowAdvTapeClass(z != null && Number.isFinite(z) ? z : 0);
  const zTxt  = (z != null && Number.isFinite(z)) ? (z > 0 ? "+" : "") + z.toFixed(1) : "—";
  const tpsTxt = (tps != null && Number.isFinite(tps)) ? " · " + Math.round(tps) + " tk/s" : "";
  return `<div class="flow-adv-row flow-adv-tape ${escapeHtml(cls)}">` +
    `<span class="flow-adv-k">TAPE VEL</span>` +
    `<span class="flow-adv-v">Z ${escapeHtml(zTxt)}${escapeHtml(tpsTxt)}</span>` +
    `</div>`;
}

function renderSpreadZRow(fa) {
  const z     = fa.spreadZ != null ? Number(fa.spreadZ) : null;
  const alert = !!fa.spreadLiquidityAlert;
  const zTxt  = (z != null && Number.isFinite(z)) ? (z > 0 ? "+" : "") + z.toFixed(1) : "—";
  const cls   = alert ? "flow-adv-row flow-adv-spread--alert" : "flow-adv-row flow-adv-spread--ok";
  return `<div class="${escapeHtml(cls)}">` +
    `<span class="flow-adv-k">SPREAD Z</span>` +
    `<span class="flow-adv-v">${escapeHtml(zTxt)}${alert ? " ⚠ LIQ.REDUZ." : ""}</span>` +
    `</div>`;
}

// ── Bloco principal Fase 1 ────────────────────────────────────────────────

function renderFlowAdvancedBlock(d) {
  const fa = d && d.flowAdvanced;
  if (!fa || typeof fa !== "object") return "";

  let html = '<div class="flow-adv-block">';
  html += '<div class="flow-adv-title">FLUXO AVANÇADO</div>';
  if (fa.zMiniNorm != null) html += renderZNormRow("Z MINI NORM", fa.zMiniNorm);
  if (fa.zRefNorm  != null) html += renderZNormRow("Z REF NORM",  fa.zRefNorm);
  if (fa.tapeSpeedZ != null) html += renderTapeSpeedRow(fa);
  if (fa.spreadZ    != null) html += renderSpreadZRow(fa);
  html += "</div>";
  return html;
}

// ── Bloco Footprint M1 (Fase 2) ───────────────────────────────────────────

function renderFootprintBlock(d) {
  const fa = d && d.flowAdvanced;
  const fp = fa && fa.footprint;
  if (!fp || typeof fp !== "object") return "";

  const buy  = Number.isFinite(Number(fp.buyVol))  ? Number(fp.buyVol)  : 0;
  const sell = Number.isFinite(Number(fp.sellVol)) ? Number(fp.sellVol) : 0;
  const tot  = buy + sell;
  const buyPct  = tot > 0 ? Math.round(100 * buy  / tot) : 50;
  const sellPct = tot > 0 ? Math.round(100 * sell / tot) : 50;
  const dn      = Number.isFinite(Number(fp.deltaNorm)) ? Number(fp.deltaNorm) : 0;
  const dnTxt   = (dn >= 0 ? "+" : "") + dn.toFixed(2);
  const exB = !!fp.exaustionBuy;
  const exS = !!fp.exaustionSell;

  let html = '<div class="flow-adv-block">';
  html += '<div class="flow-adv-title">FOOTPRINT M1</div>';
  html += `<div class="flow-adv-row">` +
    `<span class="flow-adv-k">C/V vela ant.</span>` +
    `<span class="flow-adv-v">` +
    `<span class="flow-adv-fp-buy">${buyPct}%</span>` +
    `<span class="flow-adv-fp-sep"> | </span>` +
    `<span class="flow-adv-fp-sell">${sellPct}%</span>` +
    ` <span class="flow-adv-fp-delta">Δ${escapeHtml(dnTxt)}</span>` +
    `</span></div>`;
  html += `<div class="flow-adv-note">C/V vela ant. = compra vs venda na vela M1 anterior.</div>`;
  if (exB) html += `<div class="flow-adv-row"><span class="flow-adv-exhaust">⚡ EXAUSTÃO COMPRA</span></div>`;
  if (exS) html += `<div class="flow-adv-row"><span class="flow-adv-exhaust">⚡ EXAUSTÃO VENDA</span></div>`;
  if (exB || exS) {
    html += `<div class="flow-adv-note">ESGOT. = lado perdeu forca no curto prazo (sinal de exaustao).</div>`;
  }
  html += "</div>";
  return html;
}

// ── Bloco Absorção Real (Fase 2) ──────────────────────────────────────────

function renderAbsorptionRealBlock(d) {
  const fa = d && d.flowAdvanced;
  const ar = fa && fa.absorptionReal;
  if (!ar || typeof ar !== "object" || (!ar.buy && !ar.sell)) return "";

  const deltaAbs  = Number.isFinite(Number(ar.deltaAbs))  ? Number(ar.deltaAbs).toFixed(2)  : "—";
  const priceMove = Number.isFinite(Number(ar.priceMove)) ? Number(ar.priceMove).toFixed(1) + " pts" : "—";
  const side = ar.buy ? "COMPRAS ABSORVEM VENDAS" : "VENDAS ABSORVEM COMPRAS";
  const cls  = ar.buy ? "flow-adv-absorb--buy" : "flow-adv-absorb--sell";

  return `<div class="flow-adv-block ${escapeHtml(cls)}">` +
    `<div class="flow-adv-title">ABSORÇÃO REAL</div>` +
    `<div class="flow-adv-row">` +
    `<span class="flow-adv-k">${escapeHtml(side)}</span>` +
    `<span class="flow-adv-v">Δ ${escapeHtml(deltaAbs)} · mov. preço ${escapeHtml(priceMove)}</span>` +
    `</div></div>`;
}
