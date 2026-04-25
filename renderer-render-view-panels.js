/**
 * Pintura dos painéis principais (fluxo/regime, HUD, níveis, Δ, placar).
 * Carregar depois de renderer-consensus-signal.js e antes de renderer-render-view.js (núcleo).
 */
(function () {
  "use strict";
  if (typeof ensureRendererFns !== "function" || typeof ensureRendererState !== "function") {
    throw new Error("Painel SENSE: falta renderer-contracts.js antes de renderer-render-view-panels.js (ver index.html).");
  }
  ensureRendererFns("renderer-render-view-panels.js", "renderer-utils.js", ["escapeHtml", "fmtNum", "fmtDeltaVol"]);
  ensureRendererState("renderer-render-view-panels.js");
  ensureRendererFns("renderer-render-view-panels.js", "renderer-consensus-signal.js", ["setElementHtmlIfChanged"]);
  ensureRendererFns("renderer-render-view-panels.js", "renderer-flow-levels.js", [
    "stripAccentsForDisplay",
    "formatLevelLabelForDisplay",
    "levelSlotKey",
    "flowRowClassFromSignedMetric",
    "flowRowClassFromTrendBias",
    "trendBiasLabelHtml",
    "renderSrMeterBarsForLevel",
  ]);
  ensureRendererFns("renderer-render-view-panels.js", "renderer-hud.js", ["flowMiniRefMetrics", "renderHudBlock", "renderSrDetectDiscreet"]);
  ensureRendererFns("renderer-render-view-panels.js", "renderer-regime-ui.js", ["renderRegimeMercadoHtml", "applyRegimeMercadoFlash"]);
  ensureRendererFns("renderer-render-view-panels.js", "renderer-gatilho.js", ["updateContextoPctFromFlowBox"]);
  ensureRendererFns("renderer-render-view-panels.js", "renderer-sense-ia.js", ["syncSenseIaHudOverlayLayers"]);
  ensureRendererFns("renderer-render-view-panels.js", "renderer-delta.js", [
    "deltaLooksGlitchy",
    "deltaVolSumIsZero",
    "mergeDeltaNumericFromStable",
    "deltaDisplayForUi",
    "normalizeSide",
    "hammerConfirmacaoDisplayText",
    "deltaAgrPctForDisplay",
    "deltaRowClassStreakRapida",
    "deltaRowClassFromSide",
    "renderDeltaBars",
    "streakDot",
    "streakSequenciaDisplayText",
    "renderDeltaTapeProxyHtml",
  ]);
  ensureRendererFns("renderer-render-view-panels.js", "renderer-placar-meta.js", ["renderPtaxBussolaPlacarStrip"]);
})();

function paintDashboardFlowAndRegime(flowBox, d) {
  const flow = d.flow && typeof d.flow === "object" ? d.flow : null;
  if (flow) {
    const mini = flow.miniSymbol || flow.mini_symbol || "—";
    const ref = flow.refSymbol || flow.ref_symbol || mini;
    const ntslZ = Number(flow.ntslZ);
    const trendDir = Number(flow.trendDir);
    const lateralPct = Number(d.ativoLateralLimitePct);
    const trendWeakPct = Number(flow.trendWeakPct);
    const trendStrongPct = Number(flow.trendStrongPct);
    const ntslStr = Number.isFinite(ntslZ) ? ntslZ.toFixed(2) : "—";
    const rowMini = escapeHtml(flowRowClassFromSignedMetric(flow.zMini));
    const rowRef = escapeHtml(flowRowClassFromSignedMetric(flow.zRef));
    const rowNtsl = escapeHtml(flowRowClassFromSignedMetric(ntslZ));
    const rowTrend = escapeHtml(
      flowRowClassFromTrendBias(trendDir, ntslZ, lateralPct, trendWeakPct, trendStrongPct)
    );
    const fr = flowMiniRefMetrics(flow);
    const zlineCls = fr !== null ? " flow-row--zline" : "";
    const zMiniSignCls =
      Number(flow.zMini) > 0.02
        ? " flow-ztrack__fill--pos"
        : Number(flow.zMini) < -0.02
          ? " flow-ztrack__fill--neg"
          : " flow-ztrack__fill--neut";
    const zRefSignCls =
      Number(flow.zRef) > 0.02
        ? " flow-ztrack__fill--pos"
        : Number(flow.zRef) < -0.02
          ? " flow-ztrack__fill--neg"
          : " flow-ztrack__fill--neut";
    const zMiniBar =
      fr !== null
        ? `<div class="flow-ztrack" title="${escapeHtml(mini)} — intensidade de fluxo (0 a 3, mesma escala do número à direita)."><span class="flow-ztrack__fill flow-ztrack__fill--mini${zMiniSignCls}" style="width:${fr.mPct.toFixed(
            0
          )}%"></span></div>`
        : "";
    const zRefBar =
      fr !== null
        ? `<div class="flow-ztrack" title="${escapeHtml(ref)} — intensidade de fluxo (0 a 3, mesma escala do número à direita)."><span class="flow-ztrack__fill flow-ztrack__fill--ref${zRefSignCls}" style="width:${fr.rPct.toFixed(
            0
          )}%"></span></div>`
        : "";
    const chipBetween =
      fr !== null
        ? `<div class="flow-row flow-row--proxy-chip flow-mini-ref-proxy--${fr.align}" title="${escapeHtml(
            fr.title
          )}"><span class="flow-mini-ref-chip flow-mini-ref-chip--${fr.chipTone}">${escapeHtml(fr.chipText)}</span></div>`
        : "";
    const miniCells =
      fr !== null
        ? `<span class="lbl">${escapeHtml(mini)}</span><div class="flow-row__zmid">${zMiniBar}</div><strong>${escapeHtml(
            fmtNum(flow.zMini)
          )}</strong>`
        : `<span class="lbl">${escapeHtml(mini)}</span><strong>${escapeHtml(fmtNum(flow.zMini))}</strong>`;
    const refCells =
      fr !== null
        ? `<span class="lbl">${escapeHtml(ref)}</span><div class="flow-row__zmid">${zRefBar}</div><strong>${escapeHtml(
            fmtNum(flow.zRef)
          )}</strong>`
        : `<span class="lbl">${escapeHtml(ref)}</span><strong>${escapeHtml(fmtNum(flow.zRef))}</strong>`;
    setElementHtmlIfChanged(
      flowBox,
      `
      <div class="${rowMini}${zlineCls}">${miniCells}</div>
      ${chipBetween}
      <div class="${rowRef}${zlineCls}">${refCells}</div>
      <div class="${rowNtsl}" title="Soma X%+Y%: amplitude do dia vs abertura (NTSL). No MT5 aparece como VIÉS no HUD.">
        <span class="lbl">% da TEND.</span><strong>${escapeHtml(ntslStr)}</strong>
      </div>
      <div class="${rowTrend}" title="Viés de tendência mapeado de −1 (baixa) a +1 (alta).">
        <span class="lbl">Viés/ TEND.</span>${trendBiasLabelHtml(
          trendDir,
          ntslZ,
          lateralPct,
          trendWeakPct,
          trendStrongPct
        )}
      </div>
      ${renderRegimeMercadoHtml(d.regimeMercado)}
    `
    );
  } else if (d && d.ptaxBussola && typeof d.ptaxBussola === "object") {
    const regimeOnly = renderRegimeMercadoHtml(d.regimeMercado);
    setElementHtmlIfChanged(
      flowBox,
      regimeOnly || '<p class="hint-inline">Sem bloco flow. PTAX no painel Placar (bússola).</p>'
    );
  } else {
    setElementHtmlIfChanged(
      flowBox,
      (d.regimeMercado ? renderRegimeMercadoHtml(d.regimeMercado) : "") + '<p class="hint-inline">Sem bloco flow no JSON.</p>'
    );
  }

  applyRegimeMercadoFlash(flowBox, d.regimeMercado);
  updateContextoPctFromFlowBox(flowBox, d);
}

function paintDashboardHud(hudBox, d, v, consensus) {
  if (hudBox) {
    setElementHtmlIfChanged(hudBox, renderHudBlock(d, v, consensus));
    syncSenseIaHudOverlayLayers();
  }
}

function paintDashboardLevelsPanel(levelsBox, d, v, S, levelsHoldMsDefault) {
  const levels = Array.isArray(d.levels) ? d.levels : [];
  const flowObj = d.flow && typeof d.flow === "object" ? d.flow : null;
  const deltaObj = d.delta && typeof d.delta === "object" ? d.delta : null;
  const strengthPct = Number(d.strengthPct);
  const zMiniAbs = flowObj ? Math.abs(Number(flowObj.zMini)) : 0;
  const zRefAbs = flowObj ? Math.abs(Number(flowObj.zRef)) : 0;
  const deltaNormAbs = deltaObj ? Math.abs(Number(deltaObj.norm)) : 0;
  const scoreNorm = Number.isFinite(strengthPct) ? Math.max(0, Math.min(1, strengthPct / 100)) : 0;
  const flowStrength = Math.max(
    Number.isFinite(zMiniAbs) ? Math.min(1, zMiniAbs) : 0,
    Number.isFinite(zRefAbs) ? Math.min(1, zRefAbs) : 0,
    Number.isFinite(deltaNormAbs) ? Math.min(1, deltaNormAbs) : 0,
    scoreNorm
  );
  const flowIntensity = flowStrength >= 0.82 ? 3 : flowStrength >= 0.62 ? 2 : flowStrength >= 0.42 ? 1 : 0;
  const holdSecRaw = Number(d.levelsHoldSec);
  const holdSec = Number.isFinite(holdSecRaw) ? Math.max(1, Math.min(60, Math.floor(holdSecRaw))) : 6;
  const levelsHoldMs = holdSec * 1000 || levelsHoldMsDefault;
  const nowLevelsMs = Date.now();
  const nextLevelsHold = new Map();
  const isAnimatedLevelState = (label) => {
    const s = stripAccentsForDisplay(String(label || "")).toUpperCase();
    if (!s) return false;
    return (
      s.includes("DETECTADO") ||
      s.includes("DETECTADA") ||
      s.includes("FALSO") ||
      s.includes("FALSA") ||
      (s.includes("ALVO") && s.includes("CONFIRMADO"))
    );
  };
  for (const row of levels) {
    const rawLabel = String(row && row.label != null ? row.label : "").trim();
    const label = formatLevelLabelForDisplay(rawLabel);
    const slotKey = levelSlotKey(label);
    const value = String(row && row.value != null ? row.value : "");
    if (!label || label === "—") continue;
    const prev = S.levelsHoldMap.get(slotKey);
    const prevActive = prev && Number(prev.expiresAt) > nowLevelsMs;
    const prevAnimated = prevActive && isAnimatedLevelState(prev.label);
    const nextAnimated = isAnimatedLevelState(label);
    const keepPrevAnimated = prevAnimated && !nextAnimated;
    nextLevelsHold.set(slotKey, {
      slotKey,
      label: keepPrevAnimated ? prev.label : label,
      value: keepPrevAnimated ? prev.value : value,
      intensity: keepPrevAnimated ? prev.intensity : flowIntensity,
      expiresAt: keepPrevAnimated ? prev.expiresAt : nowLevelsMs + levelsHoldMs,
    });
  }
  for (const [slotKey, item] of S.levelsHoldMap.entries()) {
    if (!nextLevelsHold.has(slotKey) && item && Number(item.expiresAt) > nowLevelsMs) {
      nextLevelsHold.set(slotKey, item);
    }
  }
  S.levelsHoldMap = nextLevelsHold;

  const levelSortPriority = (label) => {
    const s = stripAccentsForDisplay(String(label || "")).toUpperCase();
    if (s.includes("ALVO PROJETADO VENDA")) return 0;
    if (s.includes("ALVO PROJETADO COMPRA")) return 1;
    if (s.includes("RESISTENCIA")) return 2;
    if (s.includes("SUPORTE")) return 3;
    if (s.includes("MELHOR VENDA")) return 4;
    if (s.includes("MELHOR COMPRA")) return 5;
    return 20;
  };
  const heldLevels = Array.from(S.levelsHoldMap.values()).sort((a, b) => {
    const pa = levelSortPriority(a && a.label);
    const pb = levelSortPriority(b && b.label);
    if (pa !== pb) return pa - pb;
    return String((a && a.slotKey) || "").localeCompare(String((b && b.slotKey) || ""), "pt-BR");
  });
  const levelRowClass = (label) => {
    const s = String(label || "").toUpperCase();
    if (s.includes("FALSA") || s.includes("FALSO")) return "level-row level-row--false";
    if (s.includes("ALVO") && (s.includes("DETECTADO") || s.includes("CONFIRMADO"))) {
      if (s.includes("COMPRA")) return "level-row level-row--target-hit-buy";
      if (s.includes("VENDA")) return "level-row level-row--target-hit-sell";
      return "level-row level-row--target-hit-buy";
    }
    const isDetected = s.includes("DETECTADA") || s.includes("DETECTADO");
    const dirClass = isDetected
      ? s.includes("COMPRA") || s.includes("SUPORTE")
        ? "level-row--detected-buy"
        : "level-row--detected-sell"
      : s.includes("COMPRA") || s.includes("SUPORTE")
        ? "level-row--buy"
        : s.includes("VENDA") || s.includes("RESISTENCIA")
          ? "level-row--sell"
          : "";
    return `level-row ${dirClass}`.trim();
  };
  const levelIntensityClass = (label, intensity) => {
    const s = stripAccentsForDisplay(String(label || "")).toUpperCase();
    if (s.includes("FALSA") || s.includes("FALSO")) return "";
    const srOrMelhorDet =
      s.includes("SUPORTE") ||
      s.includes("RESISTENCIA") ||
      (s.includes("MELHOR") &&
        (s.includes("COMPRA") || s.includes("VENDA")) &&
        (s.includes("DETECTADO") || s.includes("DETECTADA")));
    if (!srOrMelhorDet) return "";
    if (!Number.isFinite(Number(intensity)) || Number(intensity) <= 0) return "";
    const i = Math.max(1, Math.min(3, Math.floor(Number(intensity))));
    return ` level-row--int-${i}`;
  };
  const srPlacarHtml = renderSrDetectDiscreet(d);
  const srLevelsBlock = srPlacarHtml ? `<div class="levels-sr-wrap">${srPlacarHtml}</div>` : "";
  setElementHtmlIfChanged(
    levelsBox,
    heldLevels.length
      ? `${heldLevels
          .map((row) => {
            const meter = renderSrMeterBarsForLevel(row.label, flowStrength);
            const tail =
              meter === ""
                ? `<strong>${escapeHtml(String(row.value ?? ""))}</strong>`
                : `<span class="level-row__tail">${meter}<strong>${escapeHtml(String(row.value ?? ""))}</strong></span>`;
            return `<div class="${levelRowClass(row.label)}${levelIntensityClass(row.label, row.intensity)}"><span class="level-row__label">${escapeHtml(row.label)}</span>${tail}</div>`;
          })
          .join("")}${srLevelsBlock}`
      : `<p class="hint-inline">Sem níveis.</p>${srLevelsBlock}`
  );
}

function paintDashboardDeltaPanel(deltaBox, d, v, S) {
  const delta = d.delta && typeof d.delta === "object" ? d.delta : null;
  if (delta && v >= 3) {
    const useStableNums =
      S.lastStableDelta && (deltaLooksGlitchy(delta) || deltaVolSumIsZero(delta));
    const deltaForBar = useStableNums ? mergeDeltaNumericFromStable(delta, S.lastStableDelta) : delta;
    const disp = deltaDisplayForUi(deltaForBar);
    const streak = normalizeSide(delta.streak, "streak");
    const hammerSide = normalizeSide(delta.hammer, "hammer");
    const hammerPhrase = hammerConfirmacaoDisplayText(hammerSide);
    const streakSideActive = streak === "compra" || streak === "venda";
    let showStreakDot;
    let streakCssBlink = false;
    if (typeof delta.streakBlinkOn === "boolean") {
      showStreakDot = delta.streakBlinkOn;
      streakCssBlink = delta.streakBlinkOn;
    } else {
      showStreakDot = streakSideActive;
      const extremeBar = disp.buyPct >= 99 || disp.sellPct >= 99;
      streakCssBlink = streakSideActive && extremeBar;
    }
    const agrPct = deltaAgrPctForDisplay(disp, delta);
    const line = `ΔAgr ${agrPct > 0 ? "+" : ""}${agrPct} · B:${fmtDeltaVol(disp.buyVol)} V:${fmtDeltaVol(disp.sellVol)}`;
    const streakPulse = showStreakDot && streakSideActive;
    const streakWrapClass = ["streak-wrap", streakPulse ? "streak-wrap--pulse" : "", streakCssBlink ? "streak-wrap--blink" : ""]
      .filter(Boolean)
      .join(" ");
    const deltaIndependenciaHint = `<p class="hint-inline delta-hint delta-hint--independencia">No MT5, <strong>pressão no Δ (forte)</strong> (texto ao lado do Δ no gráfico) e <strong>pressão no Δ (rápida)</strong> (●) são <strong>indicadores independentes</strong> — podem coincidir ou divergir; não são a mesma regra.</p>`;
    const streakTxt = streakSequenciaDisplayText(streak, streakPulse, streakSideActive);
    const streakRowClass = deltaRowClassStreakRapida(streak, streakPulse, streakSideActive);
    const hammerRowClass = deltaRowClassFromSide(
      hammerSide === "compra" || hammerSide === "venda" ? hammerSide : "neutro"
    );
    setElementHtmlIfChanged(
      deltaBox,
      `
      <div class="delta-line">${escapeHtml(line)}</div>
      ${renderDeltaBars(disp.buyPct, disp.sellPct)}
      <div class="${escapeHtml(streakRowClass)}">
        <span class="lbl">Pressão no Δ (rápida)</span>
        <span class="${escapeHtml(streakWrapClass)}">${showStreakDot ? streakDot(streak) : streakDot("neutro")} <span class="streak-txt">${escapeHtml(streakTxt)}</span></span>
      </div>
      <div class="${escapeHtml(hammerRowClass)}">
        <span class="lbl">Pressão no Δ (forte)</span>
        <span class="hammer">${escapeHtml(hammerPhrase)}</span>
      </div>
      ${renderDeltaTapeProxyHtml(d, delta, disp)}
      ${deltaIndependenciaHint}
    `
    );
  } else {
    setElementHtmlIfChanged(deltaBox, '<p class="hint-inline">Sem bloco delta (recompile o EA com export v3).</p>');
  }
}

function paintDashboardSummaryPanel(summaryBox, d) {
  const placarLine = typeof d.placarLine === "string" ? d.placarLine : "";

  const b = Number(d.buy);
  const s = Number(d.sell);
  const strength = Math.max(0, Math.min(100, Number(d.strengthPct) || 0));
  const tiedScore = Number.isFinite(b) && Number.isFinite(s) && b === s;

  const meta = d.meta && typeof d.meta === "object" ? d.meta : {};
  const metaTime = meta.time || "";
  const placarPtaxHtml = renderPtaxBussolaPlacarStrip(d);

  setElementHtmlIfChanged(
    summaryBox,
    `
    <div class="placar-head">
      <div class="placar-big placar-big--compact">${escapeHtml(placarLine || "—")}</div>
    </div>
    <div class="scoreboard scoreboard--compact">
      <div class="score buy${tiedScore ? " score--tie" : ""}"><span class="label">BUY</span><span class="num">${Number.isFinite(b) ? b : "0"}</span></div>
      <div class="score sell${tiedScore ? " score--tie" : ""}"><span class="label">SELL</span><span class="num">${Number.isFinite(s) ? s : "0"}</span></div>
    </div>
    <div class="bar-wrap bar-wrap--compact"><div id="strengthBar" class="bar ${
      tiedScore ? "bar-tie" : b > s ? "bar-buy" : "bar-sell"
    }" style="width:${strength}%"></div></div>
    ${placarPtaxHtml ? `<div class="placar-ptax-slot">${placarPtaxHtml}</div>` : ""}
    <div class="meta-foot meta-foot--compact">${escapeHtml(metaTime || "")} · ${escapeHtml(meta.symbol || "")}</div>
    `
  );
}
