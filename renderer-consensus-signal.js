/**
 * Consenso global (scores + histerese), conflito direcional, faixa de sinal, helper DOM `setElementHtmlIfChanged`.
 * Depende de renderer-utils (`escapeHtml`), renderer-state (`window.SenseRendererState`), renderer-sr-motion (`window.scheduleSignalStripMarqueeLayout`),
 * renderer-hud.js (`sideFromDirectionText`, `sideFromMakersText`, `sideFromAggressionText`).
 * Carregar depois de renderer-hud.js e antes de renderer.js.
 */
(function () {
  "use strict";
  if (typeof window === "undefined") {
    throw new Error("Painel SENSE: ambiente sem window.");
  }
  if (typeof escapeHtml !== "function") {
    throw new Error("Painel SENSE: falta renderer-utils.js antes de renderer-consensus-signal.js (ver index.html).");
  }
  if (!window.SenseRendererState || typeof window.SenseRendererState !== "object") {
    throw new Error("Painel SENSE: falta renderer-state.js antes de renderer-consensus-signal.js (ver index.html).");
  }
  if (typeof window.scheduleSignalStripMarqueeLayout !== "function") {
    throw new Error("Painel SENSE: falta renderer-sr-motion.js antes de renderer-consensus-signal.js (ver index.html).");
  }
  if (
    typeof sideFromDirectionText !== "function" ||
    typeof sideFromMakersText !== "function" ||
    typeof sideFromAggressionText !== "function"
  ) {
    throw new Error("Painel SENSE: falta renderer-hud.js antes de renderer-consensus-signal.js (ver index.html).");
  }
})();

const CONSENSUS_SWITCH_HYST_MS = 350;

function addScore(bucket, side, w, reason) {
  if (side !== "buy" && side !== "sell") return;
  bucket[side] += w;
  bucket.reasons.push({ side, w, reason });
}

function computeConsensusSummaryRaw(d) {
  const score = { buy: 0, sell: 0, reasons: [] };
  const rad = d && d.radar && typeof d.radar === "object" ? d.radar : null;
  const mk = d && d.makers && typeof d.makers === "object" ? d.makers : null;
  const flow = d && d.flow && typeof d.flow === "object" ? d.flow : null;
  const delta = d && d.delta && typeof d.delta === "object" ? d.delta : null;
  const sig = String((d && d.signal) || "").toUpperCase();
  const aggr = String((d && d.aggression) || "");

  addScore(score, sideFromDirectionText(rad && rad.dir), 1.5, "Radar direção");
  addScore(score, sideFromMakersText(mk && mk.mini), 0.8, "Makers mini");
  addScore(score, sideFromMakersText(mk && mk.ref), 1.5, "Makers ref");

  const zMini = Number(flow && flow.zMini);
  if (Number.isFinite(zMini) && Math.abs(zMini) >= 0.08) addScore(score, zMini > 0 ? "buy" : "sell", 1.3, "Z mini");
  const zRef = Number(flow && flow.zRef);
  if (Number.isFinite(zRef) && Math.abs(zRef) >= 0.08) addScore(score, zRef > 0 ? "buy" : "sell", 1.6, "Z ref");
  const trendDir = Number(flow && flow.trendDir);
  if (Number.isFinite(trendDir) && Math.abs(trendDir) >= 0.12) {
    addScore(score, trendDir > 0 ? "buy" : "sell", 1.0, "Trend dir");
  }

  const bPct = Number(delta && delta.buyPct);
  const sPct = Number(delta && delta.sellPct);
  if (Number.isFinite(bPct) && Number.isFinite(sPct)) {
    const diff = Math.abs(bPct - sPct);
    if (diff >= 5) addScore(score, bPct > sPct ? "buy" : "sell", diff >= 12 ? 1.9 : 1.2, "Delta %");
  }

  const deltaPctRaw = Number(delta && delta.deltaPct);
  if (Number.isFinite(deltaPctRaw) && Math.abs(deltaPctRaw) >= 8) {
    addScore(score, deltaPctRaw > 0 ? "buy" : "sell", Math.abs(deltaPctRaw) >= 20 ? 1.6 : 1.0, "Delta raw");
  }

  addScore(score, sideFromAggressionText(aggr), 0.9, "Agressão");

  const dp = Number(rad && rad.deltaPctPicos);
  const ds = Number(rad && rad.deltaPctPersist);
  const liveNow = Number.isFinite(dp) && Number.isFinite(ds) ? (dp * 0.55 + ds * 0.45) : NaN;
  if (Number.isFinite(liveNow) && Math.abs(liveNow) >= 10) {
    addScore(score, liveNow > 0 ? "buy" : "sell", Math.abs(liveNow) >= 25 ? 2.1 : 1.3, "Radar momento");
  }

  const b = Number(d && d.buy);
  const s = Number(d && d.sell);
  if (Number.isFinite(b) && Number.isFinite(s) && b !== s) {
    addScore(score, b > s ? "buy" : "sell", 0.8, "Placar");
  }

  if (sig === "COMPRA") addScore(score, "buy", 1.0, "Sinal EA");
  if (sig === "VENDA") addScore(score, "sell", 1.0, "Sinal EA");

  const total = score.buy + score.sell;
  const diff = Math.abs(score.buy - score.sell);
  let bias = total < 1e-6 ? "neutral" : score.buy > score.sell ? "buy" : score.sell > score.buy ? "sell" : "neutral";
  const confidence01 = total > 1e-6 ? Math.max(0, Math.min(1, diff / total)) : 0;

  // Reatividade ao momento atual: evita consenso contra o fluxo curto quando o "agora" está forte.
  const reactiveNowOn = Number.isFinite(liveNow) && Math.abs(liveNow) >= 22;
  if (reactiveNowOn) {
    const liveSide = liveNow > 0 ? "buy" : "sell";
    if (bias !== "neutral" && bias !== liveSide && confidence01 < 0.62) {
      bias = liveSide;
    }
  }

  const conflictLevel = confidence01 < 0.12 ? "high" : confidence01 < 0.25 ? "medium" : "low";
  return { bias, confidence01, conflictLevel, buyScore: score.buy, sellScore: score.sell, reactiveNowOn };
}

function applyConsensusHysteresis(raw, nowMs) {
  if (!raw || raw.bias === "neutral") {
    window.SenseRendererState.consensusLatched = { bias: "neutral", lockUntil: 0 };
    return raw;
  }
  const cur = window.SenseRendererState.consensusLatched.bias;
  if (cur === "neutral" || cur === raw.bias) {
    window.SenseRendererState.consensusLatched = { bias: raw.bias, lockUntil: nowMs + CONSENSUS_SWITCH_HYST_MS };
    return raw;
  }
  if (nowMs < window.SenseRendererState.consensusLatched.lockUntil && raw.confidence01 < 0.38) {
    return { ...raw, bias: cur, hysteresisHold: true };
  }
  window.SenseRendererState.consensusLatched = { bias: raw.bias, lockUntil: nowMs + CONSENSUS_SWITCH_HYST_MS };
  return raw;
}

function consensusLabelPt(side) {
  if (side === "buy") return "COMPRA";
  if (side === "sell") return "VENDA";
  return "NEUTRO";
}

function evaluateDirectionalConflict(targetSide, d) {
  if (targetSide !== "buy" && targetSide !== "sell") return { divergent: false, conflictScore: 0 };
  const flow = d && d.flow && typeof d.flow === "object" ? d.flow : null;
  const mk = d && d.makers && typeof d.makers === "object" ? d.makers : null;
  let scoreOpp = 0;

  // Ref (Dólar) pesa mais quando contradiz.
  const refSide = sideFromMakersText(mk && mk.ref);
  if (refSide && refSide !== targetSide) scoreOpp += 2;

  const zRef = Number(flow && flow.zRef);
  if (Number.isFinite(zRef) && Math.abs(zRef) >= 0.12) {
    const zRefSide = zRef > 0 ? "buy" : "sell";
    if (zRefSide !== targetSide) scoreOpp += 1;
  }

  const trendDir = Number(flow && flow.trendDir);
  if (Number.isFinite(trendDir) && Math.abs(trendDir) >= 0.2) {
    const trendSide = trendDir > 0 ? "buy" : "sell";
    if (trendSide !== targetSide) scoreOpp += 1;
  }

  return { divergent: scoreOpp >= 2, conflictScore: scoreOpp };
}


function setElementHtmlIfChanged(el, html) {
  if (!el) return false;
  const next = String(html == null ? "" : html);
  if (el.innerHTML === next) return false;
  el.innerHTML = next;
  return true;
}

function renderSignalBanner(el, d, consensus) {
  if (!el) return;
  const sig = typeof d.signal === "string" ? d.signal.trim().toUpperCase() : "";
  const src = typeof d.signalSource === "string" ? d.signalSource.trim().toLowerCase() : "";
  if (sig === "COMPRA" || sig === "VENDA") {
    const dir = sig === "COMPRA" ? "compra" : "venda";
    const side = sig === "COMPRA" ? "buy" : "sell";
    const conflict = evaluateDirectionalConflict(side, d);
    const cs = consensus && typeof consensus === "object" ? consensus : null;
    const consensusOpposes =
      !!cs && cs.bias !== "neutral" && cs.bias !== side && (cs.conflictLevel === "medium" || cs.conflictLevel === "high");
    const isDivergent = conflict.divergent || consensusOpposes;
    const srcLabel =
      src === "hold" ? "disparo (hold)" : src === "consenso" ? "consenso placar" : src || "—";
    const v = Number((d && d.schemaVersion) || 1);
    const now = Date.now();
    const holdCompra = v >= 6 && window.SenseRendererState.gatilhoBuyHoldUntil > 0 && now < window.SenseRendererState.gatilhoBuyHoldUntil;
    const holdVenda = v >= 6 && window.SenseRendererState.gatilhoSellHoldUntil > 0 && now < window.SenseRendererState.gatilhoSellHoldUntil;
    const confirmada = sig === "COMPRA" ? holdCompra : holdVenda;
    const dirLine = confirmada
      ? sig === "COMPRA"
        ? "COMPRA CONFIRMADA"
        : "VENDA CONFIRMADA"
      : sig + (isDivergent ? " (DIVERGENTE)" : "");
    const marqueeInner = confirmada
      ? `<span class="signal-strip__dir">${escapeHtml(dirLine)}</span>`
      : `<span class="signal-strip__title">Previsão de</span><span class="signal-strip__dir">${escapeHtml(dirLine)}</span>`;
    const clsExtra = confirmada ? " signal-strip--confirmed" : "";
    const clsDvg = isDivergent ? " signal-strip--divergent" : "";
    const nextClass = `signal-strip signal-strip--active signal-${dir} signal-src-${src || "unk"}${clsExtra}${clsDvg}`;
    const nextHtml = `<span class="signal-strip__track"><span class="signal-strip__moving">${marqueeInner}</span></span><span class="signal-strip__src">${escapeHtml(
      srcLabel
    )}</span>`;
    const changed = el.className !== nextClass || setElementHtmlIfChanged(el, nextHtml);
    if (el.className !== nextClass) el.className = nextClass;
    if (changed) window.scheduleSignalStripMarqueeLayout();
    return;
  }
  if (consensus && (consensus.bias === "buy" || consensus.bias === "sell")) {
    const dir = consensus.bias === "buy" ? "compra" : "venda";
    const confPct = Math.round((Number(consensus.confidence01) || 0) * 100);
    const conflictPt =
      consensus.conflictLevel === "low" ? "baixo" : consensus.conflictLevel === "medium" ? "médio" : "alto";
    const dirLine = `CONSENSO ${consensusLabelPt(consensus.bias)}${consensus.conflictLevel !== "low" ? " (DIVERGENTE)" : ""}`;
    const clsDvg = consensus.conflictLevel !== "low" ? " signal-strip--divergent" : "";
    const nextClass = `signal-strip signal-strip--active signal-${dir} signal-src-unk${clsDvg}`;
    const nextHtml = `<span class="signal-strip__track"><span class="signal-strip__moving"><span class="signal-strip__title">Leitura global</span><span class="signal-strip__dir">${escapeHtml(
      dirLine
    )}</span></span></span><span class="signal-strip__src">${escapeHtml(`${confPct}% · conflito ${conflictPt}`)}</span>`;
    const changed = el.className !== nextClass || setElementHtmlIfChanged(el, nextHtml);
    if (el.className !== nextClass) el.className = nextClass;
    if (changed) window.scheduleSignalStripMarqueeLayout();
    return;
  }
  const idleClass = "signal-strip signal-strip--idle";
  if (el.className !== idleClass) el.className = idleClass;
  setElementHtmlIfChanged(el, '<span class="signal-strip__idle">Sem sinal ativo</span>');
}
