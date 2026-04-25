/**
 * Demo pulso (Δ% simulado) e anti-piscar do painel (delta glitch, resumo/placar, core HUD parcial).
 * Depende de dashboard-guard (`hudSnapshotLooksStable` no scope global do script), renderer-state,
 * renderer-delta.js (`deltaLooksGlitchy`), renderer-placar-meta.js (linha placar / scores / absorção).
 * Carregar depois de renderer-placar-meta.js e antes de renderer-hud.js.
 */
(function () {
  "use strict";
  if (typeof window === "undefined") {
    throw new Error("Painel SENSE: ambiente sem window.");
  }
  if (!window.DashboardGuard || typeof window.DashboardGuard.hudSnapshotLooksStable !== "function") {
    throw new Error("Painel SENSE: falta dashboard-guard.js antes de renderer-panel-debounce.js (ver index.html).");
  }
  if (!window.SenseRendererState || typeof window.SenseRendererState !== "object") {
    throw new Error("Painel SENSE: falta renderer-state.js antes de renderer-panel-debounce.js (ver index.html).");
  }
  if (typeof deltaLooksGlitchy !== "function") {
    throw new Error("Painel SENSE: falta renderer-delta.js antes de renderer-panel-debounce.js (ver index.html).");
  }
  if (
    typeof placarLineRich !== "function" ||
    typeof summaryScoresMeaningful !== "function" ||
    typeof summaryScoresZeroish !== "function" ||
    typeof absorptionShown !== "function" ||
    typeof isSuspiciousPlacarOneOne !== "function"
  ) {
    throw new Error("Painel SENSE: falta renderer-placar-meta.js antes de renderer-panel-debounce.js (ver index.html).");
  }
})();

/** Ativo com `index.html?demoPulso=1` (Electron define via `SENSE_DEMO_PULSO=1` ou `config.json` → demoPulsoSpeed). */
function demoPulsoSpeedActive() {
  try {
    return new URLSearchParams(window.location.search).get("demoPulso") === "1";
  } catch (e) {
    return false;
  }
}

/**
 * Sobrepõe deltaPctPicos / deltaPctPersist para pré-visualizar pulso (avanço/recuo/hot, mescla no PERSIST)
 * sem MT5 — ciclo ~10 s. Só altera cópia rasa de `radar`.
 * @param {object|null|undefined} d
 */
function applyDemoPulsoSpeedOverlay(d) {
  if (!d || typeof d !== "object" || !demoPulsoSpeedActive()) return d;
  const rad = d.radar && typeof d.radar === "object" ? d.radar : null;
  if (!rad) return d;
  const phase = Math.floor(Date.now() / 700) % 14;
  /** @type {[number, number][]} [pico, persist] */
  const seq = [
    [36, -14],
    [52, -14],
    [52, -36],
    [52, -36],
    [26, -17],
    [26, -4],
    [44, -4],
    [-38, -4],
    [-20, 18],
    [-20, 41],
    [-14, 26],
    [-14, 26],
    [10, 8],
    [10, 2],
    [10, 2],
  ];
  const pair = seq[phase] || seq[0];
  return {
    ...d,
    radar: {
      ...rad,
      deltaPctPicos: pair[0],
      deltaPctPersist: pair[1],
    },
  };
}

const PANEL_NEUTRAL_CONSEC = 1;
/** Delta glitch: leituras extra antes de aceitar frame mau (barra 100% / V 0). */
const DELTA_GLITCH_CONSEC = 2;
/** HUD core (Agressão/Radar/Makers): segura só 1 frame quando JSON vem parcial no meio da escrita. */
const HUD_CORE_NEUTRAL_CONSEC = 1;

/**
 * Anti-piscar só onde não compete com o HUD do MT5: delta glitch + placar/resumo suspeito.
 * Heurísticas de linha placar / scores / absorção: renderer-placar-meta.js (`placarLineRich`, `summaryScores*`, `absorptionShown`, …).
 * Radar, makers, agressão, fluxo, níveis e sinal — sempre o JSON atual (tempo real).
 */
function applyPanelNeutralDebounce(d) {
  const S = window.SenseRendererState;
  const prev = S.lastGoodResult && S.lastGoodResult.data;
  if (!prev || !d || typeof d !== "object") return d;
  let out;
  try {
    out = JSON.parse(JSON.stringify(d));
  } catch (e) {
    return d;
  }

  const prevDelta = prev.delta && typeof prev.delta === "object" ? prev.delta : null;
  const incomingDelta =
    d.delta && typeof d.delta === "object" ? JSON.parse(JSON.stringify(d.delta)) : null;

  if (prevDelta && incomingDelta) {
    let holdDeltaGlitch = false;

    if (deltaLooksGlitchy(incomingDelta) && !deltaLooksGlitchy(prevDelta)) {
      S.panelNeutralStreak.deltaGlitch++;
      if (S.panelNeutralStreak.deltaGlitch < DELTA_GLITCH_CONSEC) holdDeltaGlitch = true;
      else S.panelNeutralStreak.deltaGlitch = 0;
    } else {
      S.panelNeutralStreak.deltaGlitch = 0;
    }

    if (holdDeltaGlitch) {
      // Mantém volumes/% do frame bom; sequência/confirmação vêm do EA (alinhados ao gráfico).
      out.delta = {
        ...prevDelta,
        ...incomingDelta,
        buyVol: prevDelta.buyVol,
        sellVol: prevDelta.sellVol,
        buyPct: prevDelta.buyPct,
        sellPct: prevDelta.sellPct,
      };
    }
  } else {
    S.panelNeutralStreak.deltaGlitch = 0;
  }

  const holdPlacarEmpty = placarLineRich(prev.placarLine) && !placarLineRich(out.placarLine);
  const holdScoresZero = summaryScoresMeaningful(prev) && summaryScoresZeroish(out);
  const holdAbsorption = absorptionShown(prev) && !absorptionShown(out);
  const holdAlertEmpty =
    typeof prev.alert === "string" &&
    prev.alert.trim().length > 0 &&
    !String(out.alert || "").trim();
  const holdSuspiciousOneOne =
    summaryScoresMeaningful(prev) &&
    !isSuspiciousPlacarOneOne(prev) &&
    isSuspiciousPlacarOneOne(out);

  const needSummaryHold =
    holdPlacarEmpty || holdScoresZero || holdAbsorption || holdAlertEmpty || holdSuspiciousOneOne;

  if (needSummaryHold) {
    S.panelNeutralStreak.summary++;
    if (S.panelNeutralStreak.summary < PANEL_NEUTRAL_CONSEC) {
      if (holdPlacarEmpty) out.placarLine = prev.placarLine;
      if (holdScoresZero || holdSuspiciousOneOne) {
        out.buy = prev.buy;
        out.sell = prev.sell;
        out.strengthPct = prev.strengthPct;
      }
      if (holdAbsorption && typeof prev.absorption === "string") out.absorption = prev.absorption;
      if (holdAlertEmpty && typeof prev.alert === "string") out.alert = prev.alert;
    } else {
      S.panelNeutralStreak.summary = 0;
    }
  } else {
    S.panelNeutralStreak.summary = 0;
  }

  /*
   * Anti-piscar para bloco Agressão/Radar/Makers:
   * quando o frame atual perde strings-chave (comum durante escrita parcial),
   * mantém o último core estável por poucos ciclos.
   */
  const prevHudStable = hudSnapshotLooksStable(prev);
  const nowHudStable = hudSnapshotLooksStable(out);
  const needHudCoreHold = prevHudStable && !nowHudStable;

  if (needHudCoreHold) {
    S.panelNeutralStreak.hudCore++;
    if (S.panelNeutralStreak.hudCore < HUD_CORE_NEUTRAL_CONSEC) {
      if (typeof prev.aggression === "string") out.aggression = prev.aggression;
      if (prev.radar && typeof prev.radar === "object") out.radar = JSON.parse(JSON.stringify(prev.radar));
      if (prev.makers && typeof prev.makers === "object") out.makers = JSON.parse(JSON.stringify(prev.makers));
    } else {
      S.panelNeutralStreak.hudCore = 0;
    }
  } else {
    S.panelNeutralStreak.hudCore = 0;
  }

  return out;
}
