/**
 * HUD central (AGR, radar, makers, absorção, Δ%, pico/persist) — HTML do bloco Agressão·Radar·Makers.
 * Depende de: renderer-utils, renderer-gatilho (`renderGatilhoOperacional`, `renderMakersPreparoRow`), renderer-placar-meta.js (`srDetectAbsorptionNuance`).
 * Usa em runtime: `stripAccentsForDisplay` (renderer-flow-levels.js), `formatAggressionLineForUi`, `splitAggressionZmFromFormatted` (renderer-aggression-format.js),
 * `srDetectSnapshot`, `evaluateDirectionalConflict`, `consensusLabelPt` (renderer-consensus-signal.js — carregado a seguir ao HUD).
 * Carregar depois de renderer-aggression-format.js, renderer-placar-meta.js e renderer-panel-debounce.js, e antes de renderer-consensus-signal.js.
 * Latch radar Δ%: `window.SenseRendererState` (sem `const S` — evita colisão com renderer.js).
 */
(function () {
  "use strict";
  if (typeof window === "undefined") {
    throw new Error("Painel SENSE: ambiente sem window.");
  }
  if (typeof escapeHtml !== "function" || typeof fmtNum !== "function") {
    throw new Error("Painel SENSE: falta renderer-utils.js antes de renderer-hud.js (ver index.html).");
  }
  if (typeof renderGatilhoOperacional !== "function" || typeof renderMakersPreparoRow !== "function") {
    throw new Error("Painel SENSE: falta renderer-gatilho.js antes de renderer-hud.js (ver index.html).");
  }
  if (!window.SenseRendererState || typeof window.SenseRendererState !== "object") {
    throw new Error("Painel SENSE: falta renderer-state.js antes de renderer-hud.js (ver index.html).");
  }
  if (
    typeof hudRadarDeltaPctGaugesRow !== "function" ||
    typeof computeFlowStrengthFromDashboard !== "function" ||
    typeof computeAggressionMeterStrengthFromText !== "function" ||
    typeof flowMeterHtml !== "function" ||
    typeof sideFromDirectionText !== "function" ||
    typeof sideFromMakersText !== "function" ||
    typeof sideFromAggressionText !== "function" ||
    typeof aggressionMeterMode !== "function" ||
    typeof hudRadarLine !== "function"
  ) {
    throw new Error("Painel SENSE: falta renderer-hud-metrics.js antes de renderer-hud.js (ver index.html).");
  }
})();

function makerNeonClass(text) {
  const s = String(text || "");
  if (s.includes("Makers: OFF") || /REF Makers:\s*OFF/i.test(s)) return "hud-line--maker-off";
  if (s.includes("COMPRA+")) return "hud-line--maker-buy";
  if (s.includes("VENDA+")) return "hud-line--maker-sell";
  if (s.includes("NEUTRO")) return "hud-line--maker-neutro";
  return "";
}

function hudMakerLine(k, v) {
  const t = v !== undefined && v !== null && String(v).length > 0 ? String(v) : "—";
  const neon = makerNeonClass(t);
  const cls = neon ? `hud-line ${neon}` : "hud-line";
  const key = String(k || "").trim();
  if (!key) {
    return `<div class="${cls}"><span class="hud-v">${escapeHtml(t)}</span></div>`;
  }
  return `<div class="${cls}"><span class="hud-k">${escapeHtml(key)}</span><span class="hud-v">${escapeHtml(t)}</span></div>`;
}

/** Texto do EA: AGRESSÃO: COMPRA… / VENDA… / — / Use_ZFlow OFF (comparacao sem acentos) */
function aggressionNeonClass(text) {
  const s = stripAccentsForDisplay(String(text || ""));
  if (s.includes("Use_ZFlow OFF") || s.includes("(Use_ZFlow OFF)")) return "hud-aggr--off";
  if (/AGRESSAO:\s*[—\-–]/.test(s) || /Z\s*medio\s*0\.00/i.test(s)) return "hud-aggr--neutro";
  if (s.includes("VENDA")) return "hud-aggr--sell";
  if (s.includes("COMPRA")) return "hud-aggr--buy";
  return "hud-aggr--neutro";
}

/** Intensidade visual pelo tamanho da vantagem (|B−V| em pts inteiros), sem número na linha. Forte só se > 4 (≥5). */
function srDetectLeadIntensityClass(buy, sell) {
  const diff = Math.abs(Math.round(Number(buy)) - Math.round(Number(sell)));
  if (diff <= 1) return "hud-sr-detect--lead-tight";
  if (diff <= 4) return "hud-sr-detect--lead-mid";
  return "hud-sr-detect--lead-strong";
}

/** Vantagem extrema: |B−V| > 5 (≥6) — rótulo Suporte/Resistência máx. */
function srDetectLeadMaxClass(buy, sell) {
  const diff = Math.abs(Math.round(Number(buy)) - Math.round(Number(sell)));
  return diff > 5 ? " hud-sr-detect--lead-max" : "";
}

/** Placar discreto SR (EA): sup+melhor compra det. vs res+melhor venda det. */
function renderSrDetectDiscreet(d) {
  if (!d || typeof d !== "object") return "";
  const { buy, sell, leader: leaderRaw } = srDetectSnapshot(d);
  const leader = String(leaderRaw || "").toLowerCase();
  if (!Number.isFinite(buy) || !Number.isFinite(sell)) return "";
  const buyPts = Math.round(Number(buy));
  const sellPts = Math.round(Number(sell));
  const diff = Math.abs(Math.round(buy) - Math.round(sell));
  let cls = "hud-sr-detect hud-sr-detect--neutral";
  let label = "Empate";
  let tip = "SR detect.: placar apertado ou empatado";
  if (leader === "compra" || buy > sell) {
    cls = `hud-sr-detect hud-sr-detect--buy ${srDetectLeadIntensityClass(buy, sell)}${srDetectLeadMaxClass(buy, sell)}`;
    label = diff > 5 ? "Suporte Máx DETECTADO." : "Compra à frente";
    tip =
      diff > 5
        ? "Vantagem compra: extrema — suporte máximo detectado (SR)"
        : diff <= 1
          ? "Vantagem compra: apertada (cor suave)"
          : diff <= 4
            ? "Vantagem compra: média"
            : "Vantagem compra: forte";
  } else if (leader === "venda" || sell > buy) {
    cls = `hud-sr-detect hud-sr-detect--sell ${srDetectLeadIntensityClass(buy, sell)}${srDetectLeadMaxClass(buy, sell)}`;
    label = diff > 5 ? "Resistência Máx DETECTADA." : "Venda à frente";
    tip =
      diff > 5
        ? "Vantagem venda: extrema — resistência máxima detectada (SR)"
        : diff <= 1
          ? "Vantagem venda: apertada (cor suave)"
          : diff <= 4
            ? "Vantagem venda: média"
            : "Vantagem venda: forte";
  }
  const absN = srDetectAbsorptionNuance(d, buyPts, sellPts);
  if (absN) {
    cls += absN.cls;
    if (typeof absN.labelFull === "string" && absN.labelFull.length > 0) {
      label = absN.labelFull;
      tip =
        (sellPts > buyPts
          ? "Resistência em vantagem extrema no placar SR com absorção contrária."
          : "Suporte em vantagem extrema no placar SR com absorção contrária.") + absN.tip;
    }
  }
  return `<div class="${cls}" title="${escapeHtml(tip)}"><span class="hud-sr-detect__track"><span class="hud-sr-detect__moving"><span class="hud-sr-detect__text">SR: ${escapeHtml(
    label
  )}</span><span class="hud-sr-detect__score">${escapeHtml(`${buyPts} x ${sellPts}`)}</span></span></span></div>`;
}

/** SR motion / layout: `renderer-sr-motion.js` (ensureSrDetect*, schedule*, stopSrDetectTextMotion). */

function aggressionDayAccumMeta(aggText, dayBiasRaw) {
  const b = stripAccentsForDisplay(String(dayBiasRaw || "")).toUpperCase().trim();
  if (b.includes("ATENCAO") || b.includes("ATENÇÃO")) {
    return { label: "ATENCAO", cls: "hud-aggr-day--alert" };
  }
  if (b.includes("VENDEDOR")) {
    return { label: "VENDEDORA", cls: "hud-aggr-day--sell" };
  }
  if (b.includes("COMPRADOR")) {
    return { label: "COMPRADORA", cls: "hud-aggr-day--buy" };
  }
  if (b.includes("OFF")) {
    return { label: "NEUTRO", cls: "hud-aggr-day--off" };
  }
  if (b.includes("NEUTRO") || b === "—" || b === "-") {
    return { label: "NEUTRO", cls: "hud-aggr-day--off" };
  }

  const s = stripAccentsForDisplay(String(aggText || "")).toUpperCase();
  if (s.includes("VENDA")) {
    return { label: "VENDEDORA", cls: "hud-aggr-day--sell" };
  }
  if (s.includes("COMPRA")) {
    return { label: "COMPRADORA", cls: "hud-aggr-day--buy" };
  }
  return { label: "NEUTRO", cls: "hud-aggr-day--off" };
}

/** Tom da linha AGR (cor do Zm acima das barrinhas). */
function hudAggrRowToneClass(aggText) {
  const c = aggressionNeonClass(String(aggText || ""));
  if (c.includes("--buy")) return "hud-aggr-row--buy";
  if (c.includes("--sell")) return "hud-aggr-row--sell";
  if (c.includes("--off")) return "hud-aggr-row--off";
  return "hud-aggr-row--neutro";
}

/** Extrai Z médio do texto do EA (ex.: "| Z médio +1.2" / "| Zm +1,2"). */

/** RADAR: COMPRA + FORTE / VENDA + FORTE / NEUTRO */
function radarDirClass(text) {
  const s = String(text || "");
  if (s.includes("VENDA + FORTE")) return "hud-line--radar-sell";
  if (s.includes("COMPRA + FORTE")) return "hud-line--radar-buy";
  if (s.includes("NEUTRO")) return "hud-line--radar-neutro";
  return "";
}

/** ULT. VIRADA: … -> COMPRA + FORTE / VENDA + FORTE */
function radarFlipClass(text) {
  const s = String(text || "");
  if (s.includes("SEM VIRADA")) return "hud-line--radar-flip-none";
  if (s.includes("VENDA + FORTE") || (s.includes("->") && s.includes("VENDA"))) return "hud-line--radar-sell";
  if (s.includes("COMPRA + FORTE") || (s.includes("->") && s.includes("COMPRA"))) return "hud-line--radar-buy";
  return "";
}

/** Picos / persistência: acento ciano e laranja como no gráfico */
function radarSaldoSignClass(text) {
  const s = String(text || "");
  const idx = s.lastIndexOf(":");
  if (idx < 0) return "";
  const tail = s.slice(idx + 1).trim();
  if (tail.startsWith("+")) return "hud-line--radar-saldo-pos";
  if (tail.startsWith("-")) return "hud-line--radar-saldo-neg";
  return "";
}

/**
 * Heurística de intensidade (1–3) e lado a partir do texto de absorção; override opcional: absorptionIntensity.
 */
function parseAbsorptionProxy(absorption, d) {
  const raw = String(absorption || "");
  if (!raw.trim()) return null;
  const plain = stripAccentsForDisplay(raw).toUpperCase();
  if (plain.includes("ABSORCAO: -")) return null;
  const ov = d && Number(d.absorptionIntensity);
  let intensity = 2;
  if (Number.isFinite(ov) && ov >= 1 && ov <= 3) {
    intensity = Math.round(ov);
  } else {
    const s = stripAccentsForDisplay(raw).toLowerCase();
    if (/muito|extrem|\+\+\+/.test(raw) || s.includes("muito forte")) intensity = 3;
    else if (/fraca|fraco|leve|suave/.test(raw)) intensity = 1;
    else if (/forte/.test(s) && !s.includes("muito")) intensity = 3;
  }
  let side = "neutro";
  let short = "Abs.";
  const s = stripAccentsForDisplay(raw).toLowerCase();
  if (s.includes("vendedores absorvendo") || s.includes("vendedor absorvendo")) {
    side = "venda";
    short = "Vend. absorvem";
  } else if (s.includes("compradores absorvendo") || s.includes("comprador absorvendo")) {
    side = "compra";
    short = "Compr. absorvem";
  }
  return { intensity, side, short, raw };
}

/**
 * Métricas do proxy mini vs cheio: barras |z| nas linhas do símbolo; chip entre cheio e % TEND.
 * @returns {null | { mPct: number, rPct: number, chipText: string, chipTone: string, align: string, title: string }}
 */
function flowMiniRefMetrics(flow) {
  if (!flow || typeof flow !== "object") return null;
  const zM = Number(flow.zMini);
  const zR = Number(flow.zRef);
  if (!Number.isFinite(zM) && !Number.isFinite(zR)) return null;
  const cap = 3;
  const mAbs = Number.isFinite(zM) ? Math.min(Math.abs(zM), cap) : 0;
  const rAbs = Number.isFinite(zR) ? Math.min(Math.abs(zR), cap) : 0;
  const mPct = cap > 0 ? (mAbs / cap) * 100 : 0;
  const rPct = cap > 0 ? (rAbs / cap) * 100 : 0;
  const signM = !Number.isFinite(zM) ? 0 : zM > 0 ? 1 : zM < 0 ? -1 : 0;
  const signR = !Number.isFinite(zR) ? 0 : zR > 0 ? 1 : zR < 0 ? -1 : 0;
  let align = "neut";
  let chipText = "Neutro";
  let chipTone = "neut";
  if (signM !== 0 && signR !== 0) {
    if (signM === signR) {
      align = "aligned";
      chipText = "Alinhados";
      chipTone = signM > 0 ? "buy" : "sell";
    } else {
      align = "divergent";
      chipText = "Divergentes";
      chipTone = "div";
    }
  }
  const title =
    "Intensidade de fluxo no mini e na referência (escala 0–3). «Alinhados» = mesmo sentido; não distingue institucional vs retalho.";
  return { mPct, rPct, chipText, chipTone, align, title };
}

/** Estimativa LEVE/PESADO a partir do texto da linha AGRESSÃO quando não há JSON numérico. */
function deriveAggressionTextureFromText(agg) {
  const s = stripAccentsForDisplay(String(agg || "")).toLowerCase();
  let fine = 50;
  let heavy = 50;
  if (s.includes("muito forte")) {
    heavy = 72;
    fine = 28;
  } else if (s.includes("forte") && !s.includes("fraca")) {
    heavy = 62;
    fine = 38;
  } else if (s.includes("moderada")) {
    heavy = 48;
    fine = 52;
  } else if (s.includes("fraca") || s.includes("fraco") || s.includes("entrando")) {
    heavy = 32;
    fine = 68;
  }
  return { fine, heavy };
}

/**
 * Fallback contínuo (tick a tick) quando aggressionProxy não vem do EA.
 * Combina: texto AGR + força de fluxo (|zMini|/|zRef|) + atividade/assimetria do delta.
 */
function deriveAggressionTextureFromDashboard(d, agg) {
  const fromText = deriveAggressionTextureFromText(agg);
  let weightedHeavy = fromText.heavy * 0.22;
  let weightedSum = 0.22;

  const flow = d && d.flow && typeof d.flow === "object" ? d.flow : null;
  const zMini = Number(flow && flow.zMini);
  const zRef = Number(flow && flow.zRef);
  if (Number.isFinite(zMini) || Number.isFinite(zRef)) {
    const z1 = Number.isFinite(zMini) ? Math.abs(zMini) : 0;
    const z2 = Number.isFinite(zRef) ? Math.abs(zRef) : 0;
    const zAvg = (z1 + z2) / (Number.isFinite(zMini) && Number.isFinite(zRef) ? 2 : 1);
    const zNorm = Math.max(0, Math.min(1, zAvg / 1.2));
    const heavyFlow = 30 + 50 * zNorm;
    weightedHeavy += heavyFlow * 0.38;
    weightedSum += 0.38;
  }

  const delta = d && d.delta && typeof d.delta === "object" ? d.delta : null;
  const bv = Number(delta && delta.buyVol);
  const sv = Number(delta && delta.sellVol);
  if (Number.isFinite(bv) && Number.isFinite(sv) && bv + sv > 1e-9) {
    const total = Math.max(1e-9, bv + sv);
    const imbalance = Math.abs(bv - sv) / total;
    const activity = Math.max(0, Math.min(1, Math.log10(1 + total) / 4));
    const heavyDelta = 32 + 36 * imbalance + 24 * activity;
    weightedHeavy += heavyDelta * 0.4;
    weightedSum += 0.4;
  }

  const heavy = weightedSum > 0 ? weightedHeavy / weightedSum : fromText.heavy;
  const heavyClamped = Math.max(10, Math.min(90, heavy));
  return { heavy: heavyClamped, fine: 100 - heavyClamped };
}

/**
 * PRESSÃO (LEVE vs PESADO): finePct/heavyPct; opcional aggressionProxy.heavySide (buy/sell). Se pesado > leve, aviso + viés.
 */
function renderAggressionProxyBlock(d, agg) {
  const ap = d && d.aggressionProxy && typeof d.aggressionProxy === "object" ? d.aggressionProxy : null;
  let fine = Number(ap && ap.finePct);
  let heavy = Number(ap && ap.heavyPct);
  let srcNote = "Exportado pelo EA (objeto aggressionProxy: finePct, heavyPct).";
  if (!Number.isFinite(fine) || !Number.isFinite(heavy)) {
    const der = deriveAggressionTextureFromDashboard(d, agg);
    fine = der.fine;
    heavy = der.heavy;
    srcNote =
      "Estimativa contínua do painel (AGR + fluxo + delta). Para máxima fidelidade, exporte aggressionProxy.finePct / heavyPct no EA.";
  }
  const pressaoCorSignificado =
    " A fatia PESADO (vermelha) é só a proporção de agressão «pesada» vs «leve» no mix — compradores e vendedores podem agir leve ou pesado. Não confundir com direção: o viés comprador/vendedor da pressão pesada aparece na linha de baixo (Δ ou heavySide no EA).";
  const blockTitle = srcNote + pressaoCorSignificado;
  const sum = Math.max(1e-6, fine + heavy);
  const fp = (fine / sum) * 100;
  const hp = (heavy / sum) * 100;
  const pesadoDomina = hp > fp;
  let heavySide = "";
  let heavySideCls = "aggr-texture__heavy-hint--neutral";
  const apSide = ap && ap.heavySide != null ? String(ap.heavySide).toLowerCase() : "";
  if (apSide === "buy" || apSide === "compra" || apSide === "c") {
    heavySide = "compradora";
    heavySideCls = "aggr-texture__heavy-hint--buy";
  } else if (apSide === "sell" || apSide === "venda" || apSide === "v") {
    heavySide = "vendedora";
    heavySideCls = "aggr-texture__heavy-hint--sell";
  } else {
    const delta = d && d.delta && typeof d.delta === "object" ? d.delta : null;
    const bv = Number(delta && delta.buyVol);
    const sv = Number(delta && delta.sellVol);
    if (Number.isFinite(bv) && Number.isFinite(sv) && bv + sv > 1e-9) {
      if (bv > sv) {
        heavySide = "compradora";
        heavySideCls = "aggr-texture__heavy-hint--buy";
      } else if (sv > bv) {
        heavySide = "vendedora";
        heavySideCls = "aggr-texture__heavy-hint--sell";
      }
    }
  }
  const heavyHintText = heavySide ? `Pressão pesada ${heavySide}` : "Pressão pesada";
  // Mantém altura fixa do módulo para evitar "respirar" quando pesado deixa de dominar.
  const heavyHintHtml = `<div class="aggr-texture__heavy-hint ${heavySideCls}${pesadoDomina ? "" : " aggr-texture__heavy-hint--off"}">${
    pesadoDomina ? heavyHintText : "Pressão pesada"
  }</div>`;
  const ariaPress =
    pesadoDomina && heavySide
      ? `Pesado maior que leve (~${hp.toFixed(0)}%). Pressão pesada ${heavySide} (viés do Δ agressor).`
      : pesadoDomina
        ? `Pesado maior que leve (~${hp.toFixed(0)}%).`
        : `Leve ~${fp.toFixed(0)}%, pesado ~${hp.toFixed(0)}%.`;
  return `<div class="aggr-texture aggr-texture--compact" title="${escapeHtml(blockTitle)}">
    <div class="aggr-texture__label">PRESSÃO (LEVE vs PESADO)</div>
    <div class="aggr-texture__bar" role="img" aria-label="${escapeHtml(ariaPress)}">
      <span class="aggr-texture__fine" style="width:${fp.toFixed(1)}%"></span>
      <span class="aggr-texture__heavy" style="width:${hp.toFixed(1)}%"></span>
    </div>
    <div class="aggr-texture__nums"><span>LEVE ~${fp.toFixed(0)}%</span><span>PESADO ~${hp.toFixed(0)}%</span></div>
    ${heavyHintHtml}
  </div>`;
}

/**
 * Absorção no Radar, abaixo de «Últ. virada» — só renderiza quando ativa (texto ≠ placeholder ABSORCAO: -).
 * Badge de intensidade + lado; mesma família visual que as outras linhas `.hud-line` da coluna Radar.
 */
function absorptionLinesFromDash(d) {
  if (!d || typeof d !== "object") return [];
  const candidates = [
    d.absorption,
    d.absorption2,
    d.absorpcao2,
    d.absorption02,
    d.absorpcao02,
    d.absorcao2,
    d.absorcao02,
  ];
  const out = [];
  for (const raw of candidates) {
    if (typeof raw !== "string") continue;
    const t = raw.trim();
    if (!t) continue;
    const u = stripAccentsForDisplay(t).toUpperCase();
    if (u.includes("ABSORCAO: -")) continue;
    if (out.includes(t)) continue;
    out.push(t);
  }
  return out;
}

function hudAbsorptionRowHtml(d) {
  const lines = absorptionLinesFromDash(d);
  if (lines.length === 0) return "";
  return lines
    .map((absorption, idx) => {
  let toneCls = "hud-line--absorption-neut";
  if (absorption.includes("Compradores absorvendo")) toneCls = "hud-line--absorption-compra";
  else if (absorption.includes("Vendedores absorvendo")) toneCls = "hud-line--absorption-venda";
  const px = parseAbsorptionProxy(absorption, d);
  let badge = "";
  if (px) {
    const dots = [1, 2, 3]
      .map((i) => `<span class="abs-badge__dot${i <= px.intensity ? " abs-badge__dot--on" : ""}"></span>`)
      .join("");
    badge = `<div class="abs-badge abs-badge--${px.side}" title="Intensidade ${px.intensity}/3 (heurística ou absorptionIntensity no JSON).">
      <span class="abs-badge__lbl">${escapeHtml(px.short)}</span>
      <span class="abs-badge__dots" aria-hidden="true">${dots}</span>
    </div>`;
  }
      const label = idx === 0 ? "Absorção" : `Absorção ${idx + 1}`;
      return `${badge}<div class="hud-line hud-line--absorption ${toneCls}" title="${escapeHtml(absorption)}">
    <span class="hud-k">${escapeHtml(label)}</span>
    <span class="hud-v-wrap"><span class="hud-v">${escapeHtml(absorption)}</span></span>
  </div>`;
    })
    .join("");
}


function renderHudBlock(d, schemaVersion, consensus) {
  const v = Number(schemaVersion || 1);
  if (v < 5) {
    return '<p class="hint-inline">Recompile o EA (export schema v5) para Agressão, Radar e Makers.</p>';
  }
  const agg = typeof d.aggression === "string" ? d.aggression.trim() : "";
  const rad = d.radar && typeof d.radar === "object" ? d.radar : null;
  const mk = d.makers && typeof d.makers === "object" ? d.makers : null;
  if (!rad || !mk) {
    return '<p class="hint-inline">JSON sem blocos radar/makers.</p>';
  }
  const aggrCls = `hud-aggr ${aggressionNeonClass(agg)}`;
  const aggFormatted = formatAggressionLineForUi(agg || "");
  const { body: aggBody, zDisplay: aggZmAbove } = splitAggressionZmFromFormatted(aggFormatted);
  const go = d.gatilhoOperacional && typeof d.gatilhoOperacional === "object" ? d.gatilhoOperacional : null;
  const flowStrengthHud = computeFlowStrengthFromDashboard(d);
  const aggMeterStrength = computeAggressionMeterStrengthFromText(agg);
  const aggMeterMode = aggressionMeterMode(aggrCls);
  const aggMeter = flowMeterHtml(
    aggMeterStrength,
    aggMeterMode,
    "Barras conforme a linha AGRESSÃO: (fraca) e ENTRANDO = poucas; MODERADA → FORTE → MUITO FORTE = mais cheias",
    aggZmAbove
  );
  const withMeterCls = aggMeter ? " hud-aggr--with-meter" : "";
  const aggrRowTone = hudAggrRowToneClass(agg);
  const aggrDay = aggressionDayAccumMeta(agg, d.zMediaAcumBias);
  const absorptionLines = absorptionLinesFromDash(d);
  const absorptionFocus = absorptionLines.length > 0;
  const absorptionFocusHtml = absorptionFocus
    ? `<div class="hud-absorption-focus" role="group" aria-label="Absorção em destaque">
        <h3 class="hud-col-title hud-col-title--radar-follows-makers">Absorção (foco)</h3>
        <div class="hud-absorption-focus__body">${hudAbsorptionRowHtml(d)}</div>
      </div>`
    : "";
  const radarHtml = absorptionFocus
    ? absorptionFocusHtml
    : `<h3 class="hud-col-title hud-col-title--radar-follows-makers">Radar</h3>
        ${(() => {
          const side = sideFromDirectionText(rad.dir);
          const c = evaluateDirectionalConflict(side, d);
          const cs = consensus && typeof consensus === "object" ? consensus : null;
          const consensusOpposes =
            !!cs &&
            side &&
            cs.bias !== "neutral" &&
            cs.bias !== side &&
            (cs.conflictLevel === "medium" || cs.conflictLevel === "high");
          const divergent = c.divergent || consensusOpposes;
          const dirTxt = divergent && side ? `${rad.dir} (DIVERGENTE)` : rad.dir;
          const line = hudRadarLine(
            "Direção",
            dirTxt,
            "dir",
            flowStrengthHud,
            radarDirMeterMode(dirTxt),
            divergent ? "hud-line--radar-divergent" : ""
          );
          if (!cs) return line;
          const confPct = Math.round((Number(cs.confidence01) || 0) * 100);
          const conflictPt = cs.conflictLevel === "low" ? "baixo" : cs.conflictLevel === "medium" ? "médio" : "alto";
          const isNoConflict100 = confPct >= 100;
          const consensusToneCls =
            cs.conflictLevel === "medium" || cs.conflictLevel === "high"
              ? "hud-line--radar-consensus-divergent"
              : cs.bias === "buy"
              ? "hud-line--radar-consensus-buy"
              : cs.bias === "sell"
              ? "hud-line--radar-consensus-sell"
              : "hud-line--radar-consensus-neutral";
          const pulseCls = isNoConflict100 ? "hud-line--radar-consensus-pulse" : "";
          const conflictLabel = isNoConflict100 ? "SEM CONFLITO" : `conflito ${escapeHtml(conflictPt)}`;
          const reactiveTag = cs.reactiveNowOn
            ? `<span class="hud-consensus-reactive-tag" title="Consenso em modo reativo ao momento atual.">MOMENTO ON</span>`
            : "";
          const row = `<div class="hud-line hud-line--radar-consensus ${consensusToneCls} ${pulseCls}"><span class="hud-k">Consenso</span><span class="hud-v-wrap"><span class="hud-v">` +
            `${escapeHtml(consensusLabelPt(cs.bias))} · ${confPct}% · ${conflictLabel}` +
            `${cs.hysteresisHold ? " · estabilizando" : ""}</span>${reactiveTag}</span></div>`;
          return line + row;
        })()}
        ${hudRadarLine("Picos C+/V−", rad.peaks, "picos")}
        ${hudRadarLine("Persistência (s)", rad.persist, "persist")}
        ${hudRadarLine("Saldo picos", rad.saldoPicos, "saldoPicos")}
        ${hudRadarLine("Saldo persist", rad.saldoPersist, "saldoPersist")}
        ${hudRadarLine("Últ. virada", rad.flip, "flip")}`;
  return `
    <div class="hud-cols">
      <div class="hud-col">
        <h3 class="hud-col-title">AGR:</h3>
        <div class="hud-aggr-row ${aggrRowTone}">
          <p class="${aggrCls}${withMeterCls}">${escapeHtml(aggBody || "—")}</p>
          ${aggMeter}
      </div>
        <div class="hud-aggr-day ${aggrDay.cls}">
          <span class="hud-aggr-day__k">Média de AGR acum.(dia):</span>
          <span class="hud-aggr-day__v">${escapeHtml(aggrDay.label)}</span>
        </div>
        ${renderAggressionProxyBlock(d, agg)}
        ${renderGatilhoOperacional(go, v, agg, d)}
      </div>
      <div class="hud-col hud-col-instruments">
        <div class="hud-instruments-stack">
          ${renderMakersPreparoRow(go, v, agg, d)}
          <div class="hud-makers-delta">${hudRadarDeltaPctGaugesRow(rad, go)}</div>
        </div>
        <div class="hud-absorption-radar-slot">${absorptionFocus ? "" : hudAbsorptionRowHtml(d)}</div>
      </div>
      <div class="hud-col hud-col-makers">
        <h3 class="hud-col-title">Makers</h3>
        ${hudMakerLine("", mk.mini)}
        ${hudMakerLine("", mk.ref)}
        ${radarHtml}
      </div>
    </div>
  `;
}
