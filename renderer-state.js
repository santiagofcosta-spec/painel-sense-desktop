/**
 * Estado mutável do painel (tick, gatilho, overlay SENSE IA, SR motion, consenso).
 * Carregar depois de renderer-utils.js e antes de renderer.js.
 */
(function () {
  if (typeof window === "undefined") return;
  if (window.SenseRendererState) return;

  window.SenseRendererState = {
    lastGoodResult: null,
    lastStableDelta: null,
    levelsHoldMap: new Map(),
    lastRegimeMercadoFingerprint: null,
    lastDeltaPctPico: null,
    lastDeltaPctPersist: null,
    deltaDotRecedeLatched: { pico: false, persist: false },
    senseIaHudOverlayMessage: null,
    senseIaHudOverlayMeta: null,
    senseIaHudOverlayPhase: null,
    senseIaHudOverlayCodaHtml: null,
    senseIaHudOverlayTimer: null,
    senseIaHudOverlaySummaryTimer: null,
    senseIaHudOverlayAnimShownFor: null,
    senseIaAutoEveryMs: 0,
    senseIaNextAutoAtMs: 0,
    gatilhoTriPulseThreshold01: 0.3,
    gatilhoPrevBuyReady: false,
    gatilhoPrevSellReady: false,
    gatilhoBuyHoldUntil: 0,
    gatilhoSellHoldUntil: 0,
    regimeCompraConfiavelMemUntil: 0,
    regimeVendaConfiavelMemUntil: 0,
    regimeCompraConfiavelMemStrength01: 0,
    regimeVendaConfiavelMemStrength01: 0,
    gatilhoPrepTriBuyUntil: 0,
    gatilhoPrepTriSellUntil: 0,
    gatilhoPrepTriPrevBuyAbove: false,
    gatilhoPrepTriPrevSellAbove: false,
    gatilhoPrepTriCurrentBuyAbove: false,
    gatilhoPrepTriCurrentSellAbove: false,
    gatilhoContextoFlowBuy01: NaN,
    gatilhoContextoFlowSell01: NaN,
    gatilhoContextoFlowBuyConfiavel: null,
    gatilhoContextoFlowSellConfiavel: null,
    panelNeutralStreak: { deltaGlitch: 0, summary: 0, hudCore: 0 },
    srDetectResizeObserver: null,
    srDetectTextMotionRaf: null,
    srDetectTextMotionActive: false,
    consensusLatched: { bias: "neutral", lockUntil: 0 },
  };
})();
