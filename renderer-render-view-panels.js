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
  ensureRendererFns("renderer-render-view-panels.js", "renderer-hud.js", ["flowMiniRefMetrics", "renderHudBlock", "renderSrDetectDiscreet", "hudAbsorptionRowHtml"]);
  ensureRendererFns("renderer-render-view-panels.js", "renderer-hud-metrics.js", ["hudRadarDeltaPctGauge"]);
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

/**
 * Substitui as 4 linhas (mini, mini AV, ref, ref AV) por dois Speeds unificados,
 * mantendo o chip de divergência (`flow-mini-ref-proxy--align`) entre eles.
 *
 * - O valor do Speed é o COMBINADO: `0.6×base + 0.4×avançado` (|x|), quando ambos
 *   existem; senão usa o disponível. Esta é a mesma fórmula já presente em
 *   `renderer-hud-metrics.js` (cálculo de força agregada).
 * - O SINAL (compra/venda) vem da base (`zMini`/`zRef`) por ter maior peso. Se a
 *   base for ~0, usamos o sinal do avançado.
 * - Tooltip de cada Speed: `Mini X.XX · AV Y.YY · Combinado ±N%`.
 *
 * O EA NÃO é alterado — só consumimos os campos já existentes.
 */
function renderFlowSymbolSpeedPair(mini, ref, flow, flowAdv, fr) {
  const ADV_CAP = 3;
  const toUnitBase = (v) => (Number.isFinite(v) ? Math.max(0, Math.min(1, Math.abs(v))) : 0);
  const toUnitAdv = (v) => (Number.isFinite(v) ? Math.max(0, Math.min(1, Math.abs(v) / ADV_CAP)) : 0);
  const combineMagnitude = (base, adv) => {
    const a = toUnitBase(base);
    const b = toUnitAdv(adv);
    if (a > 0 && b > 0) return a * 0.6 + b * 0.4;
    return Math.max(a, b);
  };
  const signOf = (base, adv) => {
    if (Number.isFinite(base) && Math.abs(base) >= 0.02) return base >= 0 ? 1 : -1;
    if (Number.isFinite(adv) && Math.abs(adv) >= 0.02) return adv >= 0 ? 1 : -1;
    return 0;
  };
  const fmtSigned = (n) => `${n >= 0 ? "+" : ""}${n}%`;

  const zMini = Number(flow.zMini);
  const zRef = Number(flow.zRef);
  const zMiniNorm = flowAdv && Number.isFinite(Number(flowAdv.zMiniNorm)) ? Number(flowAdv.zMiniNorm) : NaN;
  const zRefNorm = flowAdv && Number.isFinite(Number(flowAdv.zRefNorm)) ? Number(flowAdv.zRefNorm) : NaN;

  const miniMag = combineMagnitude(zMini, zMiniNorm);
  const refMag = combineMagnitude(zRef, zRefNorm);
  const miniSign = signOf(zMini, zMiniNorm);
  const refSign = signOf(zRef, zRefNorm);

  const miniPct = Math.round(miniSign * miniMag * 100);
  const refPct = Math.round(refSign * refMag * 100);

  const fmtN2 = (v) => (Number.isFinite(v) ? (v >= 0 ? "+" : "") + v.toFixed(2) : "—");
  const miniDisplay = miniMag > 0 ? fmtSigned(miniPct) : "0%";
  const refDisplay = refMag > 0 ? fmtSigned(refPct) : "0%";

  const miniTitle = `${mini} — Mini ${fmtN2(zMini)} · AV ${fmtN2(zMiniNorm)} · Combinado ${miniDisplay}`;
  const refTitle = `${ref} — Mini ${fmtN2(zRef)} · AV ${fmtN2(zRefNorm)} · Combinado ${refDisplay}`;

  const miniGauge = hudRadarDeltaPctGauge(mini, miniPct, "flow-mini", {
    display: miniDisplay,
    title: miniTitle,
    toneValue: miniPct,
    pctValue: miniPct,
    extraClass: "radar-delta-gauge--flow",
  });
  const refGauge = hudRadarDeltaPctGauge(ref, refPct, "flow-ref", {
    display: refDisplay,
    title: refTitle,
    toneValue: refPct,
    pctValue: refPct,
    extraClass: "radar-delta-gauge--flow",
  });

  const chipHtml =
    fr !== null
      ? `<div class="flow-speeds-pair__chip flow-mini-ref-proxy--${fr.align}" title="${escapeHtml(fr.title)}">
          <span class="flow-mini-ref-chip flow-mini-ref-chip--${fr.chipTone} flow-mini-ref-chip--lvl-${fr.chipLevel}">${escapeHtml(fr.chipText)}</span>
        </div>`
      : `<div class="flow-speeds-pair__chip flow-speeds-pair__chip--empty" aria-hidden="true"></div>`;

  return `
    <div class="flow-speeds-pair" role="group" aria-label="Speeds unificados de fluxo por ativo">
      <div class="flow-speeds-pair__gauge flow-speeds-pair__gauge--left">${miniGauge}</div>
      ${chipHtml}
      <div class="flow-speeds-pair__gauge flow-speeds-pair__gauge--right">${refGauge}</div>
    </div>
  `;
}

function paintDashboardFlowAndRegime(flowBox, d) {
  const flow = d.flow && typeof d.flow === "object" ? d.flow : null;
  const flowAdv = d.flowAdvanced && typeof d.flowAdvanced === "object" ? d.flowAdvanced : null;
  const flowAdvRow = (label, value, suffix = "") => {
    if (value == null || !Number.isFinite(Number(value))) {
      return `<div class="flow-row flow-row--thin flow-row--adv flow-row--placeholder"><span class="lbl">${escapeHtml(
        label
      )}</span><strong>—</strong></div>`;
    }
    const n = Number(value);
    const txt = `${n > 0 ? "+" : ""}${n.toFixed(2)}${suffix}`;
    const rowCls = `${flowRowClassFromSignedMetric(n)} flow-row--thin flow-row--adv`;
    return `<div class="${escapeHtml(rowCls)}"><span class="lbl">${escapeHtml(label)}</span><strong>${escapeHtml(txt)}</strong></div>`;
  };
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
    const fr = flowMiniRefMetrics(flow, flowAdv);
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
        ? `<div class="flow-ztrack" title="${escapeHtml(mini)} — intensidade de fluxo (0 a 3, mesma escala do número à direita)."><span class="flow-ztrack__fill flow-ztrack__fill--mini${zMiniSignCls}" data-sense-wpct="${escapeHtml(fr.mPct.toFixed(0))}"></span></div>`
        : "";
    const zRefBar =
      fr !== null
        ? `<div class="flow-ztrack" title="${escapeHtml(ref)} — intensidade de fluxo (0 a 3, mesma escala do número à direita)."><span class="flow-ztrack__fill flow-ztrack__fill--ref${zRefSignCls}" data-sense-wpct="${escapeHtml(fr.rPct.toFixed(0))}"></span></div>`
        : "";
    const chipBetween =
      fr !== null
        ? `<div class="flow-row flow-row--proxy-chip flow-mini-ref-proxy--${fr.align}" title="${escapeHtml(
            fr.title
          )}"><span class="flow-mini-ref-chip flow-mini-ref-chip--${fr.chipTone} flow-mini-ref-chip--lvl-${fr.chipLevel}">${escapeHtml(fr.chipText)}</span></div>`
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
    const zMiniNormVal = flowAdv && Number.isFinite(Number(flowAdv.zMiniNorm)) ? Number(flowAdv.zMiniNorm) : null;
    const zRefNormVal = flowAdv && Number.isFinite(Number(flowAdv.zRefNorm)) ? Number(flowAdv.zRefNorm) : null;
    const advCap = 3;
    const advMiniPct = zMiniNormVal == null ? 0 : (Math.min(Math.abs(zMiniNormVal), advCap) / advCap) * 100;
    const advRefPct = zRefNormVal == null ? 0 : (Math.min(Math.abs(zRefNormVal), advCap) / advCap) * 100;
    const advMiniSignCls =
      zMiniNormVal != null && zMiniNormVal > 0.02
        ? " flow-ztrack__fill--pos"
        : zMiniNormVal != null && zMiniNormVal < -0.02
          ? " flow-ztrack__fill--neg"
          : " flow-ztrack__fill--neut";
    const advRefSignCls =
      zRefNormVal != null && zRefNormVal > 0.02
        ? " flow-ztrack__fill--pos"
        : zRefNormVal != null && zRefNormVal < -0.02
          ? " flow-ztrack__fill--neg"
          : " flow-ztrack__fill--neut";
    const zMiniAdvBar =
      zMiniNormVal == null
        ? ""
        : `<div class="flow-ztrack"><span class="flow-ztrack__fill flow-ztrack__fill--mini${advMiniSignCls}" data-sense-wpct="${escapeHtml(advMiniPct.toFixed(0))}"></span></div>`;
    const zRefAdvBar =
      zRefNormVal == null
        ? ""
        : `<div class="flow-ztrack"><span class="flow-ztrack__fill flow-ztrack__fill--ref${advRefSignCls}" data-sense-wpct="${escapeHtml(advRefPct.toFixed(0))}"></span></div>`;
    const zMiniNormRow =
      zMiniNormVal != null
        ? `<div class="${escapeHtml(
            `${flowRowClassFromSignedMetric(zMiniNormVal)} flow-row--zline flow-row--thin flow-row--adv${
              Math.abs(zMiniNormVal) >= 0.85 ? " flow-row--pulse" : ""
            }`
          )}"><span class="lbl">${escapeHtml(
            `${mini} AV.`
          )}</span><div class="flow-row__zmid">${zMiniAdvBar}</div><strong>${escapeHtml(
            fmtNum(zMiniNormVal)
          )}</strong></div>`
        : `<div class="flow-row flow-row--thin flow-row--adv flow-row--placeholder"><span class="lbl">${escapeHtml(
            `${mini} AV.`
          )}</span><strong>—</strong></div>`;
    const zRefNormRow =
      zRefNormVal != null
        ? `<div class="${escapeHtml(
            `${flowRowClassFromSignedMetric(zRefNormVal)} flow-row--zline flow-row--thin flow-row--adv${
              Math.abs(zRefNormVal) >= 0.85 ? " flow-row--pulse" : ""
            }`
          )}"><span class="lbl">${escapeHtml(
            `${ref} AV.`
          )}</span><div class="flow-row__zmid">${zRefAdvBar}</div><strong>${escapeHtml(
            fmtNum(zRefNormVal)
          )}</strong></div>`
        : `<div class="flow-row flow-row--thin flow-row--adv flow-row--placeholder"><span class="lbl">${escapeHtml(
            `${ref} AV.`
          )}</span><strong>—</strong></div>`;
    /* "Significativo" = a linha **sempre permanece no DOM** (para preservar o layout total).
       Quando o valor não passa o limiar, recebe a classe `flow-row--hidden-by-threshold` que o
       CSS converte em `visibility: hidden` (mantém a altura). Resultado: o Contexto de Mercado e
       o Footprint nunca se mexem quando uma destas linhas aparece/some. */
    const wrapHidden = (rowHtml, isSignificant) =>
      isSignificant ? rowHtml : rowHtml.replace(/^<div class="/, '<div class="flow-row--hidden-by-threshold ');

    const tapeSpeedZ = flowAdv && Number.isFinite(Number(flowAdv.tapeSpeedZ)) ? Number(flowAdv.tapeSpeedZ) : null;
    const tapeSpeedSig = tapeSpeedZ != null && Math.abs(tapeSpeedZ) >= 1.0;
    const tapeSpeedRow = wrapHidden(
      flowAdvRow("Tape Vel (Z)", tapeSpeedZ != null ? tapeSpeedZ : NaN),
      tapeSpeedSig,
    );

    const spreadZ = flowAdv && Number.isFinite(Number(flowAdv.spreadZ)) ? Number(flowAdv.spreadZ) : null;
    const spreadLiqAlert = !!(flowAdv && flowAdv.spreadLiquidityAlert);
    const spreadSuffix = spreadZ != null && spreadLiqAlert ? "  LIQ.REDUZ." : "";
    const spreadSig = spreadZ != null && (Math.abs(spreadZ) >= 1.0 || spreadLiqAlert);
    const spreadZRow = wrapHidden(
      flowAdvRow("Spread Z", spreadZ != null ? spreadZ : NaN, spreadSuffix),
      spreadSig,
    );

    const ofi = flowAdv && flowAdv.ofiNocional && typeof flowAdv.ofiNocional === "object" ? flowAdv.ofiNocional : null;
    const ofiPctBid = ofi && Number.isFinite(Number(ofi.pctBid)) ? Number(ofi.pctBid) : null;
    const ofiEma = ofi && Number.isFinite(Number(ofi.ema)) ? Number(ofi.ema) : null;
    const ofiWBid = ofi && Number.isFinite(Number(ofi.wBid)) ? Number(ofi.wBid) : null;
    const ofiWAsk = ofi && Number.isFinite(Number(ofi.wAsk)) ? Number(ofi.wAsk) : null;
    const ofiLivroSigned = ofiPctBid != null ? (ofiPctBid - 50) / 50 : null;
    const ofiNacionalSigned =
      ofiWBid != null && ofiWAsk != null && ofiWBid + ofiWAsk > 0 ? (ofiWBid - ofiWAsk) / (ofiWBid + ofiWAsk) : null;
    const ofiLivroPulse = ofiLivroSigned != null && Math.abs(ofiLivroSigned) >= 0.85 ? " flow-row--pulse" : "";
    const ofiNacionalPulse = ofiNacionalSigned != null && Math.abs(ofiNacionalSigned) >= 0.85 ? " flow-row--pulse" : "";
    const ofiEmaPulse = ofiEma != null && Math.abs(ofiEma) >= 0.05 ? " flow-row--pulse" : "";

    /* Livro Pond.: desvio significativo do equilíbrio 50/50 → ≥ 15 pp (|signed| ≥ 0.30). */
    const ofiLivroSig = ofiPctBid != null && Math.abs(ofiLivroSigned) >= 0.30;
    const ofiLivroHtml =
      ofiPctBid != null
        ? `<div class="${escapeHtml(`${flowRowClassFromSignedMetric(ofiLivroSigned)} flow-row--thin flow-row--adv${ofiLivroPulse}`)}"><span class="lbl">Livro Pond.</span><strong>${escapeHtml(ofiPctBid.toFixed(1))}% bid</strong></div>`
        : `<div class="flow-row flow-row--thin flow-row--adv flow-row--placeholder"><span class="lbl">Livro Pond.</span><strong>—</strong></div>`;
    const ofiLivroRow = wrapHidden(ofiLivroHtml, ofiLivroSig);

    /* OFI Nacional: |signed| ≥ 0.20 (20% de desequilíbrio compra/venda). */
    const ofiNacionalSig = ofiNacionalSigned != null && Math.abs(ofiNacionalSigned) >= 0.20;
    const ofiNacionalHtml =
      ofiNacionalSigned != null
        ? `<div class="${escapeHtml(`${flowRowClassFromSignedMetric(ofiNacionalSigned)} flow-row--thin flow-row--adv${ofiNacionalPulse}`)}"><span class="lbl">OFI Nacional</span><strong>${escapeHtml((ofiNacionalSigned >= 0 ? "+" : "") + (ofiNacionalSigned * 100).toFixed(1))}%</strong></div>`
        : `<div class="flow-row flow-row--thin flow-row--adv flow-row--placeholder"><span class="lbl">OFI Nacional</span><strong>—</strong></div>`;
    const ofiNacionalRow = wrapHidden(ofiNacionalHtml, ofiNacionalSig);

    /* OFI/EMA: |ema| ≥ 0.03 (acima do ruído). Pulse já cuida do estado "muito forte". */
    const ofiEmaSig = ofiEma != null && Math.abs(ofiEma) >= 0.03;
    const ofiEmaHtml =
      ofiEma != null
        ? `<div class="${escapeHtml(`${flowRowClassFromSignedMetric(ofiEma)} flow-row--thin flow-row--adv${ofiEmaPulse}`)}"><span class="lbl">OFI/EMA</span><strong>${escapeHtml((ofiEma >= 0 ? "+" : "") + ofiEma.toFixed(3))}</strong></div>`
        : `<div class="flow-row flow-row--thin flow-row--adv flow-row--placeholder"><span class="lbl">OFI/EMA</span><strong>—</strong></div>`;
    const ofiEmaRow = wrapHidden(ofiEmaHtml, ofiEmaSig);
    const fp = flowAdv && flowAdv.footprint && typeof flowAdv.footprint === "object" ? flowAdv.footprint : null;
    const fpBuy = fp && Number.isFinite(Number(fp.buyVol)) ? Number(fp.buyVol) : 0;
    const fpSell = fp && Number.isFinite(Number(fp.sellVol)) ? Number(fp.sellVol) : 0;
    const fpTot = fpBuy + fpSell;
    const fpBuyPct = fpTot > 0 ? Math.round((100 * fpBuy) / fpTot) : null;
    const fpSellPct = fpTot > 0 ? Math.round((100 * fpSell) / fpTot) : null;
    const fpDeltaNorm = fp && Number.isFinite(Number(fp.deltaNorm)) ? Number(fp.deltaNorm) : null;
    const fpHasBuyExhaust = !!(fp && fp.exaustionBuy);
    const fpHasSellExhaust = !!(fp && fp.exaustionSell);
    const fpDualExhaust = fpHasBuyExhaust && fpHasSellExhaust;
    const fpExhaustText = (() => {
      if (!fp) return "";
      const hasBuy = fpHasBuyExhaust;
      const hasSell = fpHasSellExhaust;
      if (hasBuy && hasSell) return "⚡ EXAUSTÃO COMPRA + VENDA";
      if (hasBuy) return "⚡ EXAUSTÃO COMPRA";
      if (hasSell) return "⚡ EXAUSTÃO VENDA";
      return "";
    })();
    const fpAlertCls = fpExhaustText
      ? ` flow-row--footprint-alert ${
          fpDualExhaust ? "flow-row--footprint-alert-dual" : fpHasBuyExhaust ? "flow-row--footprint-alert-buy" : "flow-row--footprint-alert-sell"
        }`
      : "";
    const fpDeltaTxt =
      fpDeltaNorm != null ? (fpDeltaNorm > 0 ? "+" : "") + fpDeltaNorm.toFixed(2) : "";
    const footprintCvRow =
      fp && fpBuyPct != null && fpSellPct != null
        ? `<div class="flow-row delta-row flow-row--thin flow-row--adv flow-row--footprint${fpAlertCls}">
            <span class="lbl">Footprint C/V</span>
            <strong><span class="flow-adv-fp-buy">${escapeHtml(String(fpBuyPct))}%</span><span class="flow-adv-fp-sep"> | </span><span class="flow-adv-fp-sell">${escapeHtml(String(fpSellPct))}%</span>${
              fpDeltaNorm != null ? ` · <span class="flow-adv-fp-delta">Δ${escapeHtml(fpDeltaTxt)}</span>` : ""
            }${
              fpExhaustText
                ? ` · <span class="flow-adv-exhaust${fpDualExhaust ? " flow-adv-exhaust--dual" : ""}">${escapeHtml(fpExhaustText)}</span>`
                : ""
            }</strong>
          </div>`
        : `<div class="flow-row flow-row--thin flow-row--adv flow-row--placeholder flow-row--footprint"><span class="lbl">Footprint C/V</span><strong>—</strong></div>`;
    const speedsPairHtml = renderFlowSymbolSpeedPair(mini, ref, flow, flowAdv, fr);
    setElementHtmlIfChanged(
      flowBox,
      `
      ${speedsPairHtml}
      ${tapeSpeedRow}
      ${spreadZRow}
      ${ofiLivroRow}
      ${ofiNacionalRow}
      ${ofiEmaRow}
      ${footprintCvRow}
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
    let _hudHtml = renderHudBlock(d, v, consensus);
    if (d && d.flowAdvanced && d.flowAdvanced.footprint && typeof renderFootprintBlock === "function")
      _hudHtml += renderFootprintBlock(d);
    setElementHtmlIfChanged(hudBox, _hudHtml);
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

  if (typeof paintAlvoInvertidoOverlay === "function" && paintAlvoInvertidoOverlay(levelsBox, d)) {
    return;
  }

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
  const levelsPtaxHtml = renderPtaxBussolaPlacarStrip(d);
  const levelsPtaxBlock = levelsPtaxHtml ? `<div class="levels-ptax-slot">${levelsPtaxHtml}</div>` : "";
  const flowObjForTrend = d && d.flow && typeof d.flow === "object" ? d.flow : null;
  const trendDirLvl = flowObjForTrend && Number.isFinite(Number(flowObjForTrend.trendDir)) ? Number(flowObjForTrend.trendDir) : 0;
  const ntslZLvl = flowObjForTrend && Number.isFinite(Number(flowObjForTrend.ntslZ)) ? Number(flowObjForTrend.ntslZ) : null;
  const weakPctLvl =
    flowObjForTrend && Number.isFinite(Number(flowObjForTrend.trendWeakPct)) ? Number(flowObjForTrend.trendWeakPct) : 0.18;
  const strongPctLvl =
    flowObjForTrend && Number.isFinite(Number(flowObjForTrend.trendStrongPct)) ? Number(flowObjForTrend.trendStrongPct) : 0.34;
  const lateralPctLvl = Number.isFinite(Number(d && d.ativoLateralLimitePct)) ? Number(d.ativoLateralLimitePct) : 0.1;
  const ntslStrLvl =
    ntslZLvl != null
      ? `${((ntslZLvl > 0 ? "+" : "") + ntslZLvl.toFixed(2)).replace(".", ",")}%`
      : "—";
  const rowNtslLvl = flowRowClassFromSignedMetric(ntslZLvl);
  const rowTrendLvl = flowRowClassFromTrendBias(trendDirLvl, ntslZLvl, lateralPctLvl, weakPctLvl, strongPctLvl);
  const ntslToneLvl =
    ntslZLvl == null
      ? "levels-trend-pct--neutral"
      : ntslZLvl > 0
        ? "levels-trend-pct--pos"
        : ntslZLvl < 0
          ? "levels-trend-pct--neg"
          : "levels-trend-pct--neutral";
  const trendRowsBelowPtax = `<div class="${rowNtslLvl} levels-trend-pct ${ntslToneLvl}" title="Soma X%+Y%: amplitude do dia vs abertura (NTSL). No MT5 aparece como VIÉS no HUD.">
      <span class="lbl">% da TEND.</span><strong>${escapeHtml(ntslStrLvl)}</strong>
    </div>
    <div class="${rowTrendLvl} ${ntslToneLvl} flow-row--thin" title="Viés de tendência mapeado de −1 (baixa) a +1 (alta).">
      <span class="lbl">Viés/ TEND.</span>${trendBiasLabelHtml(trendDirLvl, ntslZLvl, lateralPctLvl, weakPctLvl, strongPctLvl)}
    </div>`;
  /* Linhas de Absorção (Absorção, Absorção 2, Absorção Real) deixam de competir pelo slot rotativo do Radar
     (que alterna Radar → Absorção → IA Apoio) e passam a viver no rodapé deste painel «Alvos / Níveis».
     Mantemos a mesma estrutura HTML (`hud-line--absorption-*`) — assim cores e animações permanecem intactas.
     O wrapper só recebe HTML quando há absorção; quando não há, fica vazio e `:empty { display: none }` o oculta. */
  const absorptionFooterHtml =
    typeof hudAbsorptionRowHtml === "function" ? hudAbsorptionRowHtml(d) : "";
  const absorptionFooterBlock = absorptionFooterHtml
    ? `<div class="levels-absorption-wrap" aria-label="Absorção (mostrar apenas quando ativa)">${absorptionFooterHtml}</div>`
    : "";

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
          .join("")}${srLevelsBlock}${levelsPtaxBlock}${trendRowsBelowPtax}${absorptionFooterBlock}`
      : `<p class="hint-inline">Sem níveis.</p>${srLevelsBlock}${levelsPtaxBlock}${trendRowsBelowPtax}${absorptionFooterBlock}`
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
    }" data-sense-wpct="${escapeHtml(String(strength))}"></div></div>
    <div class="meta-foot meta-foot--compact">${escapeHtml(metaTime || "")} · ${escapeHtml(meta.symbol || "")}</div>
    `
  );
}
