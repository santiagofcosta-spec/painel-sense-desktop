/**
 * Regime de mercado (JSON) → confiança por lado, contexto do gatilho e limiar TRI.
 * `renderRegimeMercadoSideConfHtml` é incorporado no cartão por renderer-regime-ui.js (carregar regime-ui depois deste ficheiro).
 * Depende de renderer-utils (escapeHtml), renderer-flow-levels.js (stripAccentsForDisplay) e renderer-state.js.
 * Carregar antes de renderer.js.
 */
if (typeof window === "undefined") {
  throw new Error("Painel SENSE: ambiente sem window.");
}
if (!window.SenseRendererState || typeof window.SenseRendererState !== "object") {
  throw new Error("Painel SENSE: falta renderer-state.js antes de renderer-regime-context.js (ver index.html).");
}
if (typeof stripAccentsForDisplay !== "function" || typeof escapeHtml !== "function") {
  throw new Error(
    "Painel SENSE: falta renderer-flow-levels.js (stripAccentsForDisplay) e renderer-utils.js (escapeHtml) antes de renderer-regime-context.js (ver index.html).",
  );
}

function rs() {
  return window.SenseRendererState;
}

/**
 * Limiares em `window` evitam ReferenceError por TDZ entre scripts / ordem de avaliação.
 * Igual a `SENSE_REGIME_CONFIAVEL_MIN` no `SENSE_RegimeTracker.mqh` (0,45).
 */
window.SENSE_REGIME_CONFIAVEL_MIN = 0.45;
/** Alinhado ao default em renderer.js (`GATILHO_TRI_PREP_THRESHOLD_01`) quando o EA não envia `regimeTriPulseMin`. */
window.SENSE_GATILHO_TRI_PREP_FALLBACK = 0.3;

function deriveRegimeSideConf(rm) {
  const cc = Number(rm.confiancaCompra);
  const cv = Number(rm.confiancaVenda);
  if (Number.isFinite(cc) && Number.isFinite(cv) && cc >= 0 && cv >= 0) {
    return { compra: Math.min(1, Math.max(0, cc)), venda: Math.min(1, Math.max(0, cv)) };
  }
  const c = Number(rm.confianca);
  const base = Number.isFinite(c) ? Math.min(1, Math.max(0, c)) : 0;
  const cod = String(rm.codigo ?? "").toLowerCase();
  const v = String(rm.vies ?? "").toLowerCase();
  let compra = base * 0.35;
  let venda = base * 0.35;
  if (cod === "tendencia_alta") {
    compra = base;
    venda = base * 0.22;
  } else if (cod === "tendencia_baixa") {
    venda = base;
    compra = base * 0.22;
  } else if (cod === "misto") {
    compra = base * 0.55;
    venda = base * 0.55;
  } else if (cod === "lateral_ntsl" || cod === "divergencia_mini_ref") {
    compra = base * 0.38;
    venda = base * 0.38;
  } else if (cod === "compressao" || cod === "basis_em_movimento" || cod === "curva_tensa") {
    compra = base * 0.48;
    venda = base * 0.48;
  } else {
    compra = v === "compra" ? base * 0.78 : base * 0.35;
    venda = v === "venda" ? base * 0.78 : base * 0.35;
  }
  return { compra, venda };
}

function regimeFiabilidadeLabel(rm, side, conf01) {
  const k = side === "compra" ? "regimeCompraConfiavel" : "regimeVendaConfiavel";
  if (rm && Object.prototype.hasOwnProperty.call(rm, k) && rm[k] !== undefined && rm[k] !== null && rm[k] !== "") {
    const ok = rm[k] === true || rm[k] === "true";
    const nok = rm[k] === false || rm[k] === "false";
    if (ok) return { text: "Confiável", cls: "regime-side__fiab--ok" };
    if (nok) return { text: "Não confiável", cls: "regime-side__fiab--bad" };
  }
  if (!Number.isFinite(conf01)) return { text: "—", cls: "regime-side__fiab--unk" };
  if (conf01 < 0.35) return { text: "Suspeito · não confiável", cls: "regime-side__fiab--bad" };
  if (conf01 < window.SENSE_REGIME_CONFIAVEL_MIN) return { text: "Fraco · não confiável", cls: "regime-side__fiab--warn" };
  return { text: "Confiável", cls: "regime-side__fiab--ok" };
}

function syncGatilhoTriPulseThresholdFromRm(rm) {
  const triPulseMinRaw = Number(rm && rm.regimeTriPulseMin);
  const S = rs();
  S.gatilhoTriPulseThreshold01 = Number.isFinite(triPulseMinRaw)
    ? Math.max(0.05, Math.min(0.95, triPulseMinRaw))
    : window.SENSE_GATILHO_TRI_PREP_FALLBACK;
}

/** Deriva confiável a partir do texto do chip (mesma regra que antes no render). */
function confiavelBoolFromFiabLabelText(lb) {
  if (!lb || typeof lb.text !== "string") return null;
  const t = stripAccentsForDisplay(lb.text).toUpperCase();
  if (t.includes("NAO CONFIAVEL")) return false;
  if (t.includes("CONFIAVEL")) return true;
  return null;
}

/**
 * Fonte canónica para o gatilho: `regimeMercado` no JSON (não o DOM).
 * Inclui `rm.ativo === false` — alinha ao fallback antigo de `updateContextoPctFromFlowBox`.
 */
function computeGatilhoContextoFlowFromRegimeMercado(rm) {
  syncGatilhoTriPulseThresholdFromRm(rm);
  if (!rm || typeof rm !== "object") {
    return {
      compra: NaN,
      venda: NaN,
      buy01: NaN,
      sell01: NaN,
      buyConf: null,
      sellConf: null,
      lbC: { text: "—", cls: "regime-side__fiab--unk" },
      lbV: { text: "—", cls: "regime-side__fiab--unk" },
    };
  }
  const { compra, venda } = deriveRegimeSideConf(rm);
  const buy01 = Number.isFinite(compra) ? Math.max(0, Math.min(1, Number(compra))) : NaN;
  const sell01 = Number.isFinite(venda) ? Math.max(0, Math.min(1, Number(venda))) : NaN;
  const lbC = regimeFiabilidadeLabel(rm, "compra", compra);
  const lbV = regimeFiabilidadeLabel(rm, "venda", venda);
  return {
    compra,
    venda,
    buy01,
    sell01,
    buyConf: confiavelBoolFromFiabLabelText(lbC),
    sellConf: confiavelBoolFromFiabLabelText(lbV),
    lbC,
    lbV,
  };
}

function applyGatilhoContextoFlowGlobals(c) {
  const S = rs();
  S.gatilhoContextoFlowBuy01 = Number.isFinite(c.buy01) ? c.buy01 : NaN;
  S.gatilhoContextoFlowSell01 = Number.isFinite(c.sell01) ? c.sell01 : NaN;
  S.gatilhoContextoFlowBuyConfiavel = typeof c.buyConf === "boolean" ? c.buyConf : null;
  S.gatilhoContextoFlowSellConfiavel = typeof c.sellConf === "boolean" ? c.sellConf : null;
}

function renderRegimeMercadoSideConfHtml(rm) {
  const c = computeGatilhoContextoFlowFromRegimeMercado(rm);
  applyGatilhoContextoFlowGlobals(c);
  const pct = (x) => (Number.isFinite(x) ? `${Math.round(x * 100)}%` : "—");
  return `<div class="regime-mercado__sideconf" role="group" aria-label="Confiança do contexto por lado" title="Confiança do contexto por lado. Limiar confiável ≥ ${Math.round(
    window.SENSE_REGIME_CONFIAVEL_MIN * 100,
  )}% (EA: SENSE_REGIME_CONFIAVEL_MIN). No gatilho: só entrar se o lado estiver confiável (regimeCompraConfiavel / regimeVendaConfiavel).">
    <span class="regime-side regime-side--buy"><span class="regime-side__lbl">Compra</span> <strong class="regime-side__pct">${escapeHtml(
      pct(c.compra),
    )}</strong> <span class="regime-side__fiab ${c.lbC.cls}">${escapeHtml(c.lbC.text)}</span></span>
    <span class="regime-side__sep" aria-hidden="true">·</span>
    <span class="regime-side regime-side--sell"><span class="regime-side__lbl">Venda</span> <strong class="regime-side__pct">${escapeHtml(
      pct(c.venda),
    )}</strong> <span class="regime-side__fiab ${c.lbV.cls}">${escapeHtml(c.lbV.text)}</span></span>
  </div>`;
}

/**
 * Alinhado ao EA: compra só com regime de compra confiável, venda com regime de venda confiável.
 * JSON novo: regimeCompraConfiavel / regimeVendaConfiavel; legado: deriva de confiancaCompra/Venda ou confianca.
 */
function regimeSideConfiavelRawFromDash(side, d) {
  const rm = d && d.regimeMercado && typeof d.regimeMercado === "object" ? d.regimeMercado : null;
  if (!rm || rm.ativo === false) return true;
  const key = side === "buy" ? "regimeCompraConfiavel" : "regimeVendaConfiavel";
  if (Object.prototype.hasOwnProperty.call(rm, key) && rm[key] !== undefined && rm[key] !== null && rm[key] !== "") {
    if (rm[key] === true || rm[key] === "true") return true;
    if (rm[key] === false || rm[key] === "false") return false;
  }
  const { compra, venda } = deriveRegimeSideConf(rm);
  const c = side === "buy" ? compra : venda;
  if (!Number.isFinite(c)) return true;
  return c >= window.SENSE_REGIME_CONFIAVEL_MIN;
}

function regimeSideConfiavelFromDash(side, d) {
  const S = rs();
  if (regimeSideConfiavelRawFromDash(side, d)) return true;
  const now = Date.now();
  if (side === "buy") return S.regimeCompraConfiavelMemUntil > now;
  return S.regimeVendaConfiavelMemUntil > now;
}
