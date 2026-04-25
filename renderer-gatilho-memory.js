/**
 * Gatilho (memoria/transiente): timers de hold, memoria de contexto confiavel,
 * preparo triangular e sincronizacao de contexto por `regimeMercado`.
 * Carregar antes de renderer-gatilho.js.
 */
(function () {
  "use strict";
  if (typeof window === "undefined") {
    throw new Error("Painel SENSE: ambiente sem window.");
  }
  if (!window.SenseRendererState || typeof window.SenseRendererState !== "object") {
    throw new Error("Painel SENSE: falta renderer-state.js antes de renderer-gatilho-memory.js (ver index.html).");
  }
  if (typeof regimeSideConfiavelFromDash !== "function" || typeof deriveRegimeSideConf !== "function") {
    throw new Error("Painel SENSE: falta renderer-regime-context.js antes de renderer-gatilho-memory.js (ver index.html).");
  }
  if (typeof stripAccentsForDisplay !== "function") {
    throw new Error("Painel SENSE: falta renderer-flow-levels.js antes de renderer-gatilho-memory.js (ver index.html).");
  }
  if (
    typeof computeGatilhoContextoFlowFromRegimeMercado !== "function" ||
    typeof applyGatilhoContextoFlowGlobals !== "function"
  ) {
    throw new Error("Painel SENSE: falta renderer-regime-context.js (contexto flow) antes de renderer-gatilho-memory.js (ver index.html).");
  }
})();

const GATILHO_PAINEL_BOTAO_MS = 60_000;
const GATILHO_CONTEXTO_CONFIAVEL_MEMORIA_MS = 120_000;
const GATILHO_TRI_PREP_THRESHOLD_01 = 0.3;
const GATILHO_TRI_PREP_MEMORIA_MS = 30_000;
window.SenseRendererState.gatilhoTriPulseThreshold01 = GATILHO_TRI_PREP_THRESHOLD_01;

/** JSON do EA pode vir como boolean ou string em builds antigos. */
function gatilhoReadyBool(v) {
  return v === true || v === "true" || v === 1;
}

function updateGatilhoHoldTimers(go, schemaVersion, nowMs, dashboardRoot) {
  const sv = Number(schemaVersion || 1);
  if (sv < 6) return;
  const holdMs = GATILHO_PAINEL_BOTAO_MS;
  const hasGo = go && typeof go === "object";
  const d = dashboardRoot && typeof dashboardRoot === "object" ? dashboardRoot : null;
  const rawBuy = hasGo && gatilhoReadyBool(go.buyReady);
  const rawSell = hasGo && gatilhoReadyBool(go.sellReady);
  const buyReady = rawBuy && (!d || regimeSideConfiavelFromDash("buy", d));
  const sellReady = rawSell && (!d || regimeSideConfiavelFromDash("sell", d));

  if (buyReady && !window.SenseRendererState.gatilhoPrevBuyReady) {
    window.SenseRendererState.gatilhoBuyHoldUntil = nowMs + holdMs;
  }

  if (sellReady && !window.SenseRendererState.gatilhoPrevSellReady) {
    window.SenseRendererState.gatilhoSellHoldUntil = nowMs + holdMs;
  }

  if (hasGo) {
    window.SenseRendererState.gatilhoPrevBuyReady = buyReady;
    window.SenseRendererState.gatilhoPrevSellReady = sellReady;
  }
}

function updateRegimeConfiavelMemory(_d, nowMs) {
  const buyNow = window.SenseRendererState.gatilhoContextoFlowBuyConfiavel === true;
  const sellNow = window.SenseRendererState.gatilhoContextoFlowSellConfiavel === true;
  const buy01 = Number.isFinite(window.SenseRendererState.gatilhoContextoFlowBuy01)
    ? Math.max(0, Math.min(1, window.SenseRendererState.gatilhoContextoFlowBuy01))
    : 0;
  const sell01 = Number.isFinite(window.SenseRendererState.gatilhoContextoFlowSell01)
    ? Math.max(0, Math.min(1, window.SenseRendererState.gatilhoContextoFlowSell01))
    : 0;
  if (!buyNow && !sellNow) return;

  let candidate = "";
  let cand01 = -1;
  if (buyNow) {
    candidate = "buy";
    cand01 = buy01;
  }
  if (sellNow && sell01 > cand01) {
    candidate = "sell";
    cand01 = sell01;
  }
  if (!candidate) return;

  const buyMemActive = window.SenseRendererState.regimeCompraConfiavelMemUntil > nowMs;
  const sellMemActive = window.SenseRendererState.regimeVendaConfiavelMemUntil > nowMs;
  if (candidate === "buy" && sellMemActive && window.SenseRendererState.regimeVendaConfiavelMemStrength01 >= cand01) return;
  if (candidate === "sell" && buyMemActive && window.SenseRendererState.regimeCompraConfiavelMemStrength01 >= cand01) return;

  if (candidate === "buy") {
    window.SenseRendererState.regimeCompraConfiavelMemUntil = nowMs + GATILHO_CONTEXTO_CONFIAVEL_MEMORIA_MS;
    window.SenseRendererState.regimeCompraConfiavelMemStrength01 = cand01;
    window.SenseRendererState.regimeVendaConfiavelMemUntil = 0;
    window.SenseRendererState.regimeVendaConfiavelMemStrength01 = 0;
  } else {
    window.SenseRendererState.regimeVendaConfiavelMemUntil = nowMs + GATILHO_CONTEXTO_CONFIAVEL_MEMORIA_MS;
    window.SenseRendererState.regimeVendaConfiavelMemStrength01 = cand01;
    window.SenseRendererState.regimeCompraConfiavelMemUntil = 0;
    window.SenseRendererState.regimeCompraConfiavelMemStrength01 = 0;
  }
}

function updateGatilhoPrepTriangleMemory(go, schemaVersion, nowMs, d) {
  const sv = Number(schemaVersion || 1);
  if (sv < 6) return;
  const rm = d && d.regimeMercado && typeof d.regimeMercado === "object" ? d.regimeMercado : null;
  let compra01 = NaN;
  let venda01 = NaN;
  if (
    Number.isFinite(window.SenseRendererState.gatilhoContextoFlowBuy01) &&
    Number.isFinite(window.SenseRendererState.gatilhoContextoFlowSell01)
  ) {
    compra01 = window.SenseRendererState.gatilhoContextoFlowBuy01;
    venda01 = window.SenseRendererState.gatilhoContextoFlowSell01;
  } else if (rm && rm.ativo !== false) {
    const sideConf = deriveRegimeSideConf(rm);
    compra01 = Number(sideConf.compra);
    venda01 = Number(sideConf.venda);
  }
  if (!Number.isFinite(compra01) || !Number.isFinite(venda01)) {
    const scanTexts = [d && d.contextoMercado, d && d.contexto, d && d.alert, rm && rm.notas, rm && rm.rotulo]
      .filter((x) => typeof x === "string")
      .map((x) => String(x));
    for (const txt of scanTexts) {
      const u = stripAccentsForDisplay(txt);
      const mBuy = u.match(/COMPRA\D+(\d{1,3}(?:[.,]\d+)?)\s*%/i);
      const mSell = u.match(/VENDA\D+(\d{1,3}(?:[.,]\d+)?)\s*%/i);
      if (mBuy && mSell) {
        const b = Number(String(mBuy[1]).replace(",", "."));
        const s = Number(String(mSell[1]).replace(",", "."));
        if (Number.isFinite(b) && Number.isFinite(s)) {
          compra01 = Math.max(0, Math.min(1, b / 100));
          venda01 = Math.max(0, Math.min(1, s / 100));
          break;
        }
      }
    }
  }
  if (!Number.isFinite(compra01) || !Number.isFinite(venda01)) return;
  const aboveBuy = compra01 >= window.SenseRendererState.gatilhoTriPulseThreshold01;
  const aboveSell = venda01 >= window.SenseRendererState.gatilhoTriPulseThreshold01;
  window.SenseRendererState.gatilhoPrepTriCurrentBuyAbove = aboveBuy;
  window.SenseRendererState.gatilhoPrepTriCurrentSellAbove = aboveSell;
  if (aboveBuy && !window.SenseRendererState.gatilhoPrepTriPrevBuyAbove) {
    window.SenseRendererState.gatilhoPrepTriBuyUntil = nowMs + GATILHO_TRI_PREP_MEMORIA_MS;
  }
  if (aboveSell && !window.SenseRendererState.gatilhoPrepTriPrevSellAbove) {
    window.SenseRendererState.gatilhoPrepTriSellUntil = nowMs + GATILHO_TRI_PREP_MEMORIA_MS;
  }
  window.SenseRendererState.gatilhoPrepTriPrevBuyAbove = aboveBuy;
  window.SenseRendererState.gatilhoPrepTriPrevSellAbove = aboveSell;
}

/** Sincroniza estado do gatilho a partir do JSON (`regimeMercado`), não do DOM. */
function updateContextoPctFromFlowBox(_flowBoxEl, d) {
  const rm = d && d.regimeMercado && typeof d.regimeMercado === "object" ? d.regimeMercado : null;
  const c = computeGatilhoContextoFlowFromRegimeMercado(rm);
  applyGatilhoContextoFlowGlobals(c);
}
