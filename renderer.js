/**
 * Painel SENSE — schema v3+ (fluxo, delta, placar; gatilho operacional em schema ≥6).
 * Placar/resumo/PTAX (meta rodapé, debounce de resumo, faixa PTAX): renderer-placar-meta.js.
 * UI "Contexto de mercado" (regimeMercado no fluxo): renderer-regime-ui.js.
 * Consenso / faixa de sinal / `setElementHtmlIfChanged`: renderer-consensus-signal.js.
 * Linha de agressão (AGR / Zm) para o HUD: renderer-aggression-format.js.
 * `render()`: orquestração + chamadas em renderer-render-view.js (caminho, payload, fluxo, HUD, níveis, Δ, resumo, persistência).
 * Demo pulso + anti-piscar (delta glitch, resumo, HUD parcial): renderer-panel-debounce.js.
 * Banner de dados: renderer-dom-shell.js (`setDataBanner`).
 * Pintura por secções de `render()`: renderer-render-view-panels.js + renderer-render-view.js (núcleo).
 * Ciclo IPC / intervalo / botão JSON: renderer-bootstrap.js (depois deste ficheiro).
 * Validação: dashboard-guard.js no index.html (preload não carrega o guard — evita falha do senseAPI).
 */
if (typeof window === "undefined") {
  throw new Error("Painel SENSE: ambiente sem window.");
}
const _dg = window.DashboardGuard;
if (!_dg || typeof _dg.dashboardPayloadLooksComplete !== "function") {
  throw new Error("Painel SENSE: falta dashboard-guard.js antes de renderer.js (ver index.html).");
}
if (typeof fmtNum !== "function" || typeof escapeHtml !== "function") {
  throw new Error("Painel SENSE: falta renderer-utils.js antes de renderer.js (ver index.html).");
}
if (!window.SenseRendererState || typeof window.SenseRendererState !== "object") {
  throw new Error("Painel SENSE: falta renderer-state.js antes de renderer.js (ver index.html).");
}
if (typeof window.scheduleSrDetectLeadStrongLayout !== "function") {
  throw new Error("Painel SENSE: falta renderer-sr-motion.js antes de renderer.js (ver index.html).");
}
if (typeof window.syncSenseIaHudOverlayLayers !== "function") {
  throw new Error("Painel SENSE: falta renderer-sense-ia.js antes de renderer.js (ver index.html).");
}
if (
  typeof stripAccentsForDisplay !== "function" ||
  typeof formatLevelLabelForDisplay !== "function" ||
  typeof srDetectSnapshot !== "function"
) {
  throw new Error("Painel SENSE: falta renderer-flow-levels.js antes de renderer-regime-context.js (ver index.html).");
}
if (
  typeof formatAggressionLineForUi !== "function" ||
  typeof formatAggressionZValueOnly !== "function" ||
  typeof splitAggressionZmFromFormatted !== "function"
) {
  throw new Error("Painel SENSE: falta renderer-aggression-format.js depois de renderer-flow-levels.js (ver index.html).");
}
if (typeof window.regimeSideConfiavelFromDash !== "function") {
  throw new Error("Painel SENSE: falta renderer-regime-context.js antes de renderer.js (ver index.html).");
}
if (
  typeof renderRegimeMercadoHtml !== "function" ||
  typeof applyRegimeMercadoFlash !== "function" ||
  typeof renderRegimeRastreadorHtml !== "function"
) {
  throw new Error("Painel SENSE: falta renderer-regime-ui.js depois de renderer-regime-context.js (ver index.html).");
}
if (typeof formatOkStatusLine !== "function" || typeof formatStaleStatusLine !== "function") {
  throw new Error("Painel SENSE: falta renderer-dashboard-paths.js antes de renderer.js (ver index.html).");
}
if (typeof renderGatilhoOperacional !== "function") {
  throw new Error("Painel SENSE: falta renderer-gatilho.js antes de renderer.js (ver index.html).");
}
if (typeof deltaDisplayForUi !== "function" || typeof renderDeltaTapeProxyHtml !== "function") {
  throw new Error("Painel SENSE: falta renderer-delta.js antes de renderer-placar-meta.js (ver index.html).");
}
if (
  typeof patchMetaFoot !== "function" ||
  typeof renderPtaxBussolaPlacarStrip !== "function" ||
  typeof srDetectAbsorptionNuance !== "function"
) {
  throw new Error("Painel SENSE: falta renderer-placar-meta.js antes de renderer-hud.js (ver index.html).");
}
if (
  typeof applyDemoPulsoSpeedOverlay !== "function" ||
  typeof demoPulsoSpeedActive !== "function"
) {
  throw new Error("Painel SENSE: falta renderer-panel-debounce.js depois de renderer-placar-meta.js (ver index.html).");
}
if (typeof renderHudBlock !== "function") {
  throw new Error("Painel SENSE: falta renderer-hud.js antes de renderer.js (ver index.html).");
}
if (typeof setElementHtmlIfChanged !== "function" || typeof consensusLabelPt !== "function" || typeof evaluateDirectionalConflict !== "function") {
  throw new Error("Painel SENSE: falta renderer-consensus-signal.js depois de renderer-hud.js (ver index.html).");
}
if (typeof setDataBanner !== "function") {
  throw new Error("Painel SENSE: falta renderer-dom-shell.js depois de renderer-utils.js (ver index.html).");
}
if (
  typeof paintDashboardFlowAndRegime !== "function" ||
  typeof paintDashboardHud !== "function" ||
  typeof paintDashboardLevelsPanel !== "function" ||
  typeof paintDashboardDeltaPanel !== "function" ||
  typeof paintDashboardSummaryPanel !== "function"
) {
  throw new Error(
    "Painel SENSE: falta renderer-render-view-panels.js (antes de renderer-render-view.js) antes de renderer.js (ver index.html).",
  );
}
if (
  typeof paintDashboardPathLabel !== "function" ||
  typeof getDashboardRenderBoxes !== "function" ||
  typeof runDashboardPanelsAndPersist !== "function" ||
  typeof recoverDashboardLastGoodOrClearUi !== "function" ||
  typeof mergeDashboardIncompleteSnapshot !== "function" ||
  typeof advanceDashboardMetaLagAndGatilho !== "function" ||
  typeof paintDashboardStatusLine !== "function" ||
  typeof persistDashboardRenderGuards !== "function"
) {
  throw new Error("Painel SENSE: falta renderer-render-view.js antes de renderer.js (ver index.html).");
}
document.documentElement.classList.add("realtime-optimized");
/* Aliases: evita colisão de nomes com funções do dashboard-guard.js (SyntaxError "already been declared"). */
const { dashboardPayloadLooksComplete: guardIsComplete } = _dg;

/** Estado mutável: `window.SenseRendererState` (renderer-state.js), alias local `S`. */
const S = window.SenseRendererState;
const LEVELS_HOLD_MS_DEFAULT = 6000;

/** SENSE IA (overlay, diálogo, parsers): renderer-sense-ia.js — clearSenseIaHudOverlayTimers, applySenseIaHudOverlayFromResult, syncSenseIaHudOverlayLayers, senseIaNextAutoLabel, buildSenseIaHudCodaHtml. */

/* fmtNum, fmtDeltaVol, dashBoolTruthy, dashNum, escapeHtml, repairMojibakeUtf8, repairPortugueseDisplayText → renderer-utils.js (carregado no index.html antes deste ficheiro). */
/* stripAccentsForDisplay, níveis, fluxo Z/NTSL, srDetectSnapshot → renderer-flow-levels.js; linha AGR/Zm (HUD) → renderer-aggression-format.js */

/** HUD overlay IA: senseIaHudCodaTrendLineFromBiasLabel, buildSenseIaHudCodaHtml, syncSenseIaHudOverlayLayers → renderer-sense-ia.js */

function render(result) {
  const boxes = getDashboardRenderBoxes();

  let dIn;
  let stale;
  let v;
  let now;
  let metaLagSec;

  paintDashboardPathLabel(boxes.pathLabel, result);
  const recovered = recoverDashboardLastGoodOrClearUi(result, {
    ...boxes,
  });
  if (!recovered.ok) return;
  result = recovered.result;

  const merged = mergeDashboardIncompleteSnapshot(result, {
    guardIsComplete,
    S,
    applyDemoPulsoSpeedOverlay,
  });
  dIn = merged.dIn;
  stale = merged.stale;

  const adv = advanceDashboardMetaLagAndGatilho(dIn, result, stale, S);
  v = adv.v;
  now = adv.now;
  metaLagSec = adv.metaLagSec;
  stale = adv.stale;
  result = adv.result;

  runDashboardPanelsAndPersist({
    boxes,
    dIn,
    v,
    now,
    stale,
    result,
    metaLagSec,
    guardIsComplete,
    S,
    LEVELS_HOLD_MS_DEFAULT,
  });
}

/** Diálogo SENSE IA, leitura automática, parsers HTML: renderer-sense-ia.js — chama `tick()` global (renderer-bootstrap.js). */
