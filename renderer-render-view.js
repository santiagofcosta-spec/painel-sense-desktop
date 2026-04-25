/**
 * Núcleo do render: caminho no topbar, recuperação de último frame, merge incompleto,
 * meta/gatilho, linha de estado, persistência de lastGood / delta estável.
 * Painéis HTML (fluxo, HUD, níveis, Δ, placar): renderer-render-view-panels.js (carregar antes).
 */
(function () {
  "use strict";
  if (typeof ensureRendererFns !== "function" || typeof ensureRendererState !== "function") {
    throw new Error("Painel SENSE: falta renderer-contracts.js antes de renderer-render-view.js (ver index.html).");
  }
  ensureRendererFns("renderer-render-view.js", "renderer-dom-shell.js", ["setDataBanner"]);
  ensureRendererState("renderer-render-view.js");
  ensureRendererFns("renderer-render-view.js", "renderer-consensus-signal.js", [
    "setElementHtmlIfChanged",
    "consensusLabelPt",
    "computeConsensusSummaryRaw",
    "applyConsensusHysteresis",
    "renderSignalBanner",
  ]);
  ensureRendererFns("renderer-render-view.js", "renderer-dashboard-paths.js", [
    "pathLooksCloudSynced",
    "pathLooksLikeMt5Mql5Files",
    "isProjectExampleDashboardPath",
    "parseMetaTimeToMs",
    "formatOkStatusLine",
    "formatStaleStatusLine",
  ]);
  ensureRendererFns("renderer-render-view.js", "renderer-gatilho.js", [
    "updateRegimeConfiavelMemory",
    "updateGatilhoPrepTriangleMemory",
    "updateGatilhoHoldTimers",
  ]);
  ensureRendererFns("renderer-render-view.js", "renderer-panel-debounce.js", [
    "applyPanelNeutralDebounce",
    "applyDemoPulsoSpeedOverlay",
    "demoPulsoSpeedActive",
  ]);
  ensureRendererFns("renderer-render-view.js", "renderer-delta.js", ["deltaLooksGlitchy", "deltaVolSumIsZero"]);
  ensureRendererFns("renderer-render-view.js", "renderer-render-view-panels.js", [
    "paintDashboardFlowAndRegime",
    "paintDashboardHud",
    "paintDashboardLevelsPanel",
    "paintDashboardDeltaPanel",
    "paintDashboardSummaryPanel",
  ]);
})();

function paintDashboardPathLabel(pathLabel, result) {
  const pathErr = [result.path, result.error].filter(Boolean).join(" — ");
  pathLabel.textContent = pathErr || "";
  let pathTitle = pathErr || "";
  if (result.path && pathLooksCloudSynced(result.path)) {
    pathTitle +=
      "\n\n[OneDrive / nuvem] A sincronização pode atrasar o conteúdo que esta app lê em relação ao que o MetaTrader acabou de gravar. Soluções: (1) em config.json use o caminho direto em MQL5\\Files num disco local; (2) ou instale o painel numa pasta fora do OneDrive.";
  } else if (
    result.path &&
    result.ok &&
    result.data &&
    !pathLooksLikeMt5Mql5Files(result.path) &&
    !isProjectExampleDashboardPath(result.path)
  ) {
    pathTitle +=
      "\n\nO ficheiro real do EA costuma ser: %AppData%\\MetaQuotes\\Terminal\\<ID>\\MQL5\\Files\\dashboard.json — confirme se este caminho é esse.";
  }
  pathLabel.title = pathTitle;
  pathLabel.className =
    "path" +
    (!result.ok || !result.data ? " path--bad" : "") +
    (result.path && pathLooksCloudSynced(result.path) ? " path--cloud" : "");
}

/**
 * @param {object} result
 * @param {object} boxes
 * @returns {{ ok: true, result: object } | { ok: false }}
 */
function recoverDashboardLastGoodOrClearUi(result, boxes) {
  const S = window.SenseRendererState;
  const {
    status,
    signalBanner,
    levelsBox,
    flowBox,
    hudBox,
    deltaBox,
    summaryBox,
    setElementHtmlIfChanged: setHtml,
  } = boxes;
  if (!result.ok || !result.data) {
    if (S.lastGoodResult && S.lastGoodResult.data) {
      return {
        ok: true,
        result: {
          ok: true,
          path: result.path || S.lastGoodResult.path,
          data: S.lastGoodResult.data,
          stale: true,
          error: result.error,
        },
      };
    }
    S.lastStableDelta = null;
    status.textContent = result.error || "Sem dados.";
    status.className = "status error";
    if (signalBanner) {
      signalBanner.className = "signal-strip signal-strip--idle";
      setHtml(signalBanner, "");
    }
    setHtml(levelsBox, "");
    setHtml(flowBox, "");
    S.lastRegimeMercadoFingerprint = null;
    if (hudBox) setHtml(hudBox, "");
    setHtml(deltaBox, "");
    setHtml(summaryBox, "");
    setDataBanner(true, result.error || result.path);
    return { ok: false };
  }
  return { ok: true, result };
}

/**
 * @param {object} result
 * @param {{ guardIsComplete: function, S: object, applyDemoPulsoSpeedOverlay: function }} opts
 */
function mergeDashboardIncompleteSnapshot(result, opts) {
  const { guardIsComplete, S, applyDemoPulsoSpeedOverlay } = opts;
  let dIn = result.data;
  let stale = result.stale === true;
  if (
    dIn &&
    typeof dIn === "object" &&
    !guardIsComplete(dIn) &&
    S.lastGoodResult &&
    S.lastGoodResult.data &&
    guardIsComplete(S.lastGoodResult.data)
  ) {
    dIn = S.lastGoodResult.data;
    stale = true;
    result.data = dIn;
    result.stale = true;
  }
  dIn = applyDemoPulsoSpeedOverlay(dIn);
  result.data = dIn;
  return { dIn, stale };
}

/**
 * @returns {{ v: number, now: number, metaLagSec: number, stale: boolean, result: object }}
 */
function advanceDashboardMetaLagAndGatilho(dIn, result, staleIn, S) {
  let stale = staleIn;
  const v = Number(dIn.schemaVersion || 1);
  const now = Date.now();
  const metaObj = dIn && dIn.meta && typeof dIn.meta === "object" ? dIn.meta : {};
  const metaMs = parseMetaTimeToMs(metaObj.time);
  let metaLagSec = Number.isFinite(metaMs) ? (now - metaMs) / 1000 : NaN;
  const META_LAG_STALE_SEC = 2;
  if (Number.isFinite(metaLagSec)) result.metaLagSec = metaLagSec;
  if (Number.isFinite(metaLagSec) && metaLagSec > META_LAG_STALE_SEC) {
    stale = true;
    result.stale = true;
    if (!result.error) result.error = `meta.time atrasado (${Math.round(metaLagSec)}s)`;
  }
  if (S.regimeCompraConfiavelMemUntil > 0 && now >= S.regimeCompraConfiavelMemUntil) S.regimeCompraConfiavelMemUntil = 0;
  if (S.regimeVendaConfiavelMemUntil > 0 && now >= S.regimeVendaConfiavelMemUntil) S.regimeVendaConfiavelMemUntil = 0;
  if (S.gatilhoPrepTriBuyUntil > 0 && now >= S.gatilhoPrepTriBuyUntil) S.gatilhoPrepTriBuyUntil = 0;
  if (S.gatilhoPrepTriSellUntil > 0 && now >= S.gatilhoPrepTriSellUntil) S.gatilhoPrepTriSellUntil = 0;
  updateRegimeConfiavelMemory(dIn, now);
  updateGatilhoPrepTriangleMemory(dIn.gatilhoOperacional, v, now, dIn);
  if (S.gatilhoBuyHoldUntil > 0 && now >= S.gatilhoBuyHoldUntil) S.gatilhoBuyHoldUntil = 0;
  if (S.gatilhoSellHoldUntil > 0 && now >= S.gatilhoSellHoldUntil) S.gatilhoSellHoldUntil = 0;
  updateGatilhoHoldTimers(dIn.gatilhoOperacional, v, now, dIn);
  return { v, now, metaLagSec, stale, result };
}

function paintDashboardStatusLine(status, params) {
  const { stale, result, metaLagSec, consensus } = params;
  const META_LAG_HARD_BLOCK_SEC = 1;
  const demoPulsoNote = demoPulsoSpeedActive() ? " · Demo pulso %PICO/%PERSIST (valores simulados)." : "";
  const consensusNote =
    consensus && consensus.bias !== "neutral"
      ? ` · Consenso ${consensusLabelPt(consensus.bias)} ${Math.round((Number(consensus.confidence01) || 0) * 100)}%`
      : "";
  if (stale) {
    status.textContent = formatStaleStatusLine(result) + demoPulsoNote + consensusNote;
    status.className = "status warning";
  } else {
    status.textContent = formatOkStatusLine(result.path, metaLagSec) + demoPulsoNote + consensusNote;
    status.className = "status";
  }
  if (Number.isFinite(metaLagSec) && metaLagSec > META_LAG_HARD_BLOCK_SEC) {
    status.textContent =
      `TEMPO REAL DEGRADADO · meta.time atraso ${Math.round(metaLagSec)}s · mantendo último frame sem piscar`;
    status.className = "status warning";
    setDataBanner(true, `Atraso detectado (${Math.round(metaLagSec)}s). Atualizando assim que o próximo tick chegar.`);
  }
}

function persistDashboardRenderGuards(d, result, opts) {
  const { guardIsComplete, S } = opts;
  if (guardIsComplete(d)) {
    S.lastGoodResult = { ok: true, path: result.path, data: d };
  }
  if (d.delta && typeof d.delta === "object" && !deltaLooksGlitchy(d.delta) && !deltaVolSumIsZero(d.delta)) {
    try {
      S.lastStableDelta = JSON.parse(JSON.stringify(d.delta));
    } catch (e) {
      /* ignore */
    }
  }
}

function getDashboardRenderBoxes() {
  return {
    status: document.getElementById("statusLine"),
    pathLabel: document.getElementById("pathLabel"),
    signalBanner: document.getElementById("signalBanner"),
    levelsBox: document.getElementById("levelsBox"),
    flowBox: document.getElementById("flowBox"),
    hudBox: document.getElementById("hudBox"),
    deltaBox: document.getElementById("deltaBox"),
    summaryBox: document.getElementById("summaryBox"),
    setElementHtmlIfChanged,
  };
}

function runDashboardPanelsAndPersist(args) {
  const { boxes, dIn, v, now, stale, result, metaLagSec, guardIsComplete, S, LEVELS_HOLD_MS_DEFAULT } = args;
  const d = applyPanelNeutralDebounce(dIn);
  const consensus = applyConsensusHysteresis(computeConsensusSummaryRaw(d), now);
  paintDashboardStatusLine(boxes.status, { stale, result, metaLagSec, consensus });
  renderSignalBanner(boxes.signalBanner, d, consensus);
  paintDashboardFlowAndRegime(boxes.flowBox, d);
  paintDashboardHud(boxes.hudBox, d, v, consensus);
  paintDashboardLevelsPanel(boxes.levelsBox, d, v, S, LEVELS_HOLD_MS_DEFAULT);
  paintDashboardDeltaPanel(boxes.deltaBox, d, v, S);
  paintDashboardSummaryPanel(boxes.summaryBox, d);
  persistDashboardRenderGuards(d, result, { guardIsComplete, S });
  setDataBanner(false);
}
