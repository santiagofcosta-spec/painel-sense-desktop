/**
 * Gatilho operacional (schema v6+): timers, preparo, termometro, BE, checklist, HTML.
 * Depende de renderer-utils, renderer-state, renderer-sense-ia, renderer-flow-levels (stripAccents), renderer-regime-context.
 * stripAccentsForDisplay: renderer-flow-levels.js (carregado antes deste ficheiro) — só usada em runtime.
 * Carregar antes de renderer.js.
 */
(function () {
  "use strict";
  if (typeof window === "undefined") {
    throw new Error("Painel SENSE: ambiente sem window.");
  }
  if (!window.SenseRendererState || typeof window.SenseRendererState !== "object") {
    throw new Error("Painel SENSE: falta renderer-state.js antes de renderer-gatilho.js (ver index.html).");
  }
  if (typeof escapeHtml !== "function" || typeof fmtNum !== "function") {
    throw new Error("Painel SENSE: falta renderer-utils.js antes de renderer-gatilho.js (ver index.html).");
  }
  if (typeof senseIaNextAutoLabel !== "function") {
    throw new Error("Painel SENSE: falta renderer-sense-ia.js antes de renderer-gatilho.js (ver index.html).");
  }
  if (typeof regimeSideConfiavelFromDash !== "function") {
    throw new Error("Painel SENSE: falta renderer-regime-context.js antes de renderer-gatilho.js (ver index.html).");
  }
})();

/**
 * Estado mutável: mesmo objeto que renderer.js (`window.SenseRendererState`).
 * Não declarar `const S` aqui — scripts partilham o escopo global e `renderer.js` já declara `S`.
 */

if (
  typeof gatilhoReadyBool !== "function" ||
  typeof updateGatilhoHoldTimers !== "function" ||
  typeof updateRegimeConfiavelMemory !== "function" ||
  typeof updateGatilhoPrepTriangleMemory !== "function" ||
  typeof updateContextoPctFromFlowBox !== "function"
) {
  throw new Error("Painel SENSE: falta renderer-gatilho-memory.js antes de renderer-gatilho.js (ver index.html).");
}
function trendBiasLabel(trendDir, ntslZ, lateralPct, weakPct, strongPct) {
  const z = Number(ntslZ);
  const lateral = Number(lateralPct);
  const weak = Number(weakPct);
  const strong = Number(strongPct);
  const lateralV = Number.isFinite(lateral) && lateral >= 0 ? lateral : 0.1;
  const weakV = Number.isFinite(weak) && weak > 0 ? weak : 0.18;
  const strongV = Number.isFinite(strong) && strong > weakV ? strong : 0.34;

  if (Number.isFinite(z)) {
    if (Math.abs(z) < lateralV) return "ATIVO LATERAL";
    if (z >= strongV) return "TEND. DE ALTA FORTE";
    if (z >= weakV) return "TEND. DE ALTA";
    if (z <= -strongV) return "TEND. DE BAIXA FORTE";
    if (z <= -weakV) return "TEND. DE BAIXA";
    return "NEUTRO";
  }

  const t = Number(trendDir);
  if (!Number.isFinite(t)) return "—";
  if (t > 0) return "TEND. DE ALTA";
  if (t < 0) return "TEND. DE BAIXA";
  return "ATIVO LATERAL";
}
function trendBiasLabelFromDashboard(d) {
  const flow = d && d.flow && typeof d.flow === "object" ? d.flow : null;
  if (!flow) return null;
  const trendDir = Number(flow.trendDir);
  const ntslZ = Number(flow.ntslZ);
  const lateralPct = Number(d.ativoLateralLimitePct);
  const weakPct = Number(flow.trendWeakPct);
  const strongPct = Number(flow.trendStrongPct);
  return trendBiasLabel(trendDir, ntslZ, lateralPct, weakPct, strongPct);
}

/**
 * Viés/TEND. em alta/baixa com botão COMPRA/VENDA no sentido oposto (mesmo critério da linha Viés/ TEND.).
 * Devolve o rótulo atual (ex.: TEND. DE BAIXA FORTE) ou null.
 */
function trendContradictsGatilhoLabel(d, showBuy, showSell) {
  if (!showBuy && !showSell) return null;
  const label = trendBiasLabelFromDashboard(d);
  if (!label) return null;
  const isBearish = label === "TEND. DE BAIXA FORTE" || label === "TEND. DE BAIXA";
  const isBullish = label === "TEND. DE ALTA FORTE" || label === "TEND. DE ALTA";
  if (showBuy && isBearish) return label;
  if (showSell && isBullish) return label;
  return null;
}

/** Gatilho ativo no mesmo sentido do viés (compra com alta, venda com baixa). */
function trendAlignedWithGatilho(d, showBuy, showSell) {
  if (!showBuy && !showSell) return false;
  const label = trendBiasLabelFromDashboard(d);
  if (!label) return false;
  const isBearish = label === "TEND. DE BAIXA FORTE" || label === "TEND. DE BAIXA";
  const isBullish = label === "TEND. DE ALTA FORTE" || label === "TEND. DE ALTA";
  if (showBuy && isBullish) return true;
  if (showSell && isBearish) return true;
  return false;
}
function pickGatilhoTradeFields(go, side) {
  if (!go || typeof go !== "object") return { entry: "", sl: "", tp: "" };
  const pick = (...keys) => {
    for (const k of keys) {
      const v = go[k];
      if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
    }
    return "";
  };
  if (side === "buy") {
    return {
      entry: pick(
        "entryExecutedBuy",
        "entryBuyExecuted",
        "precoEntradaExecutadaCompra",
        "avgEntryPriceBuy",
        "positionOpenPriceBuy",
        "entryPriceBuy",
        "entryPrice",
        "entry",
        "preco",
        "price",
        "precoEntrada"
      ),
      sl: pick("stopLossBuy", "stopLoss", "sl", "stop_loss"),
      tp: pick(
        "takeProfitExecutedBuy",
        "tpExecutadoCompra",
        "positionTpBuy",
        "takeProfitBuy",
        "takeProfit",
        "stopGain",
        "tp",
        "take_profit",
        "alvo"
      ),
    };
  }
  if (side === "sell") {
    return {
      entry: pick(
        "entryExecutedSell",
        "entrySellExecuted",
        "precoEntradaExecutadaVenda",
        "avgEntryPriceSell",
        "positionOpenPriceSell",
        "entryPriceSell",
        "entryPrice",
        "entry",
        "preco",
        "price",
        "precoEntrada"
      ),
      sl: pick("stopLossSell", "stopLoss", "sl", "stop_loss"),
      tp: pick(
        "takeProfitExecutedSell",
        "tpExecutadoVenda",
        "positionTpSell",
        "takeProfitSell",
        "takeProfit",
        "stopGain",
        "tp",
        "take_profit",
        "alvo"
      ),
    };
  }
  return { entry: "", sl: "", tp: "" };
}
function ativoLateralFromDash(d) {
  if (d && typeof d === "object" && typeof d.ativoLateral === "boolean") return d.ativoLateral;
  const f = d && d.flow && typeof d.flow === "object" ? d.flow : null;
  if (!f) return false;
  const z = Number(f.ntslZ);
  const wRaw = Number(d && d.ativoLateralLimitePct);
  const w = Number.isFinite(wRaw) && wRaw >= 0 ? wRaw : 0.1;
  if (!Number.isFinite(z) || !Number.isFinite(w) || w <= 0) return false;
  return Math.abs(z) < w;
}
function gatilhoDeltaImbalance01(d) {
  const delta = d && d.delta && typeof d.delta === "object" ? d.delta : null;
  const bv = Number(delta && delta.buyVol);
  const sv = Number(delta && delta.sellVol);
  if (!Number.isFinite(bv) || !Number.isFinite(sv) || bv + sv < 1e-9) return 0;
  return (bv - sv) / (bv + sv);
}

/**
 * Pré-validação do gatilho (termômetro), alinhada à ordem do EA em GatilhoBlockReasonBuy/Sell:
 * ZFlow → consenso placar → microestrutura → absorção → SR.
 * Nota: não usar `r.includes("SR ")` genérico — qualquer mensagem com "SR " inflava um dos lados para 5/6.
 * Contexto não confiável: baixa o score mas mantém diferença C/V (antes ambos em 0,05 → termómetro preso em 50%).
 */
function gatilhoEaPrepScore01(side, go, readyNow, blockReason, d) {
  const clamp01 = (x) => Math.max(0, Math.min(1, Number(x) || 0));
  const regimeOk = regimeSideConfiavelFromDash(side, d);
  let score;
  let zflowHardOff = false;
  if (readyNow) {
    score = 1;
  } else if (ativoLateralFromDash(d)) {
    score = 0.06;
  } else {
    const r = stripAccentsForDisplay(String(blockReason || ""))
      .toUpperCase()
      .trim();
    const need = Number(go && go.consensoSegundos);
    const rem = Number(side === "buy" ? go && go.consensoSegRestantesCompra : go && go.consensoSegRestantesVenda);
    const consPart =
      Number.isFinite(need) && need > 0 && Number.isFinite(rem) ? clamp01((need - rem) / need) : 0;

    const prepFallback = () => {
      const armed = gatilhoReadyBool(side === "buy" ? go && go.consensoCompraAtivo : go && go.consensoVendaAtivo);
      const msOk = gatilhoReadyBool(side === "buy" ? go && go.msOkCompra : go && go.msOkVenda);
      const buyPts = Number(d && d.srDetectBuyPts);
      const sellPts = Number(d && d.srDetectSellPts);
      const srOk =
        Number.isFinite(buyPts) && Number.isFinite(sellPts)
          ? side === "buy"
            ? buyPts >= sellPts
            : sellPts >= buyPts
          : true;
      return clamp01((1 + (armed ? 1 : 0) + consPart + (msOk ? 1 : 0) + (srOk ? 1 : 0)) / 5);
    };

    if (r === "ZFLOW OFF") {
      zflowHardOff = true;
      score = 0;
    } else if (side === "buy") {
      if (r.includes("SEM CONSENSO COMPRA")) score = 1 / 6;
      else if (r.includes("CONSENSO COMPRA") && /\d/.test(r)) score = (2 + consPart) / 6;
      else if (r.includes("MICROESTRUTURA BLOQ COMPRA")) score = 3 / 6;
      else if (r.includes("ABSORCAO BLOQ COMPRA")) score = 4 / 6;
      else if (r.includes("SR VENDA A FRENTE") || r.includes("SR COMPRA INSUFICIENTE")) score = 5 / 6;
      else score = prepFallback();
    } else {
      if (r.includes("SEM CONSENSO VENDA")) score = 1 / 6;
      else if (r.includes("CONSENSO VENDA") && /\d/.test(r)) score = (2 + consPart) / 6;
      else if (r.includes("MICROESTRUTURA BLOQ VENDA")) score = 3 / 6;
      else if (r.includes("ABSORCAO BLOQ VENDA")) score = 4 / 6;
      else if (r.includes("SR COMPRA A FRENTE") || r.includes("SR VENDA INSUFICIENTE")) score = 5 / 6;
      else score = prepFallback();
    }
  }

  if (!regimeOk) {
    score = clamp01(0.035 + score * 0.24);
  }
  if (score > 1e-6 && !zflowHardOff) {
    const imb = gatilhoDeltaImbalance01(d);
    score = clamp01(score + (side === "buy" ? 1 : -1) * imb * 0.05);
  }
  return score;
}
function parseAggressionZMedian(aggText) {
  const m = String(aggText || "").match(/(?:Z\s*(?:[Mm]edio|[Mm]dio)|Zm|ZM)\s*([+-]?\d+(?:[.,]\d+)?)/i);
  if (!m) return null;
  const n = parseFloat(m[1].replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * Intensidade 0–1 por lado (COMPRA / VENDA) a partir do texto do EA — usada pelo logo do gatilho em repouso.
 */
function aggressionBeastGlow(aggText) {
  const s = stripAccentsForDisplay(String(aggText || "")).toUpperCase();
  const z = parseAggressionZMedian(aggText);
  const zBuy = z != null && z > 0 ? z : 0;
  const zSell = z != null && z < 0 ? -z : 0;

  const off = { bull: 0.04, bear: 0.04 };
  if (s.includes("USE_ZFLOW OFF") || s.includes("(USE_ZFLOW OFF)")) return off;
  if (/AGRESSAO:\s*[—\-–]/.test(s) || /Z\s*MEDIO\s*0\.00/i.test(s)) return { bull: 0.06, bear: 0.06 };

  let bull = 0.06;
  let bear = 0.06;

  if (s.includes("COMPRA")) {
    let tier = 2;
    if (s.includes("MUITO FORTE")) tier = 4;
    else if (s.includes("FORTE")) tier = 3;
    const base = ((tier - 1) / 3) * 0.72 + 0.22;
    const zPart = Math.min(0.38, (zBuy / 6) * 0.38);
    bull = Math.min(1, base * 0.95 + zPart);
  }
  if (s.includes("VENDA")) {
    let tier = 2;
    if (s.includes("MUITO FORTE")) tier = 4;
    else if (s.includes("FORTE")) tier = 3;
    const base = ((tier - 1) / 3) * 0.72 + 0.22;
    const zPart = Math.min(0.38, (zSell / 6) * 0.38);
    bear = Math.min(1, base * 0.95 + zPart);
  }
  return { bull, bear };
}

/** Modo visual da logo + intensidade (--glow) alinhada à agressão do EA. */
function aggressionLogoMeta(aggText) {
  const { bull, bear } = aggressionBeastGlow(aggText);
  const b = Math.min(1, Math.max(0, bull));
  const e = Math.min(1, Math.max(0, bear));
  const glow = Math.max(b, e);
  const s = stripAccentsForDisplay(String(aggText || "")).toUpperCase();
  if (s.includes("USE_ZFLOW OFF") || s.includes("(USE_ZFLOW OFF)")) return { glow, mode: "off" };
  const hasBuy = s.includes("COMPRA");
  const hasSell = s.includes("VENDA");
  let mode = "neutral";
  if (hasBuy && !hasSell) mode = "buy";
  else if (hasSell && !hasBuy) mode = "sell";
  else if (hasBuy && hasSell) mode = b >= e ? "buy" : "sell";
  return { glow, mode };
}

/** Escala da logo SENSE por força da AGR (apenas logo, sem mexer em textos/botoes). */
function aggressionLogoScale(aggText) {
  const s = stripAccentsForDisplay(String(aggText || "")).toUpperCase();
  if (s.includes("USE_ZFLOW OFF") || s.includes("(USE_ZFLOW OFF)")) return 1.72;
  if (/AGRESSAO:\s*[—\-–]/.test(s) || /Z\s*MEDIO\s*0\.00/i.test(s)) return 1.78;
  if (s.includes("MUITO FORTE")) return 2.38;
  if (s.includes("FORTE") && !s.includes("MUITO FORTE")) return 2.24;
  if (s.includes("MODERADA")) return 2.08;
  if (s.includes("ENTRANDO")) return 1.92;
  if (s.includes("FRACA")) return 1.68;
  if (s.includes("COMPRA") || s.includes("VENDA")) return 1.86;
  return 1.78;
}

/** Marca SENSE (PNG fundo escuro + ondas) — `assets/sense-logo-idle.png`. */
const GATILHO_IDLE_LOGO_SRC = "assets/sense-logo-idle.png";

function renderGatilhoIdleLogo(aggText) {
  const { glow, mode } = aggressionLogoMeta(aggText);
  const logoScale = aggressionLogoScale(aggText);
  const g = glow.toFixed(4);
  const maxCls = glow >= 0.88 ? " gatilho-idle-logo--glow-max" : "";
  const maskUrl = `url('${GATILHO_IDLE_LOGO_SRC}')`;
  const glowN = Number(g);
  const flowSec = Number.isFinite(glowN) ? (2.85 - glowN * 1.35).toFixed(2) : "2.85";
  const nextLabel = senseIaNextAutoLabel();
  const nextHtml = nextLabel
    ? `<span class="gatilho-idle-logo__ia-next" aria-hidden="true">${escapeHtml(nextLabel)}</span>`
    : "";
  return `<div class="gatilho-idle-logo gatilho-idle-logo--${mode}${maxCls} gatilho-idle-logo--sense-ia" style="--glow:${g};--gatilho-idle-agg-scale:${logoScale.toFixed(2)}" title="SENSE — leitura de agressao · Clique: SENSE IA (sentimento do painel)">
    <div class="gatilho-idle-logo__inner">
      <div class="gatilho-idle-logo__art" style="--sense-mask:${maskUrl};--flow-speed:${flowSec}s">
        <img class="gatilho-idle-logo__img" src="${GATILHO_IDLE_LOGO_SRC}" alt="SENSE" width="256" height="256" decoding="async" draggable="false" />
        <div class="gatilho-idle-logo__flow-lines" aria-hidden="true"></div>
        <div class="gatilho-idle-logo__shine" aria-hidden="true"></div>
      </div>
    </div>
    <span class="gatilho-idle-logo__ia" aria-hidden="true">IA</span>
    ${nextHtml}
  </div>`;
}
/** Texto curto para a faixa (BUY/SELL + motivo legível); detalhe no `title`. */
function abbreviateGatilhoBlockReason(reason) {
  const raw = String(reason || "").trim();
  if (!raw) return "";
  const r = stripAccentsForDisplay(raw)
    .toUpperCase()
    .trim();
  if (r.includes("SEM CONSENSO COMPRA") || r.includes("SEM CONSENSO VENDA") || r.includes("SEM CONSENSO")) {
    return "Bloq. sem consenso";
  }
  if (r.includes("MICROESTRUTURA BLOQ COMPRA")) return "micro bloqueado · BUY";
  if (r.includes("MICROESTRUTURA BLOQ VENDA")) return "micro bloqueado · SELL";
  if (r.includes("ABSORCAO BLOQ COMPRA")) return "absorção bloq. · BUY";
  if (r.includes("ABSORCAO BLOQ VENDA")) return "absorção bloq. · SELL";
  if (r === "ZFLOW OFF" || r.includes("ZFLOW OFF")) return "ZFlow OFF";
  if (r.includes("SR VENDA A FRENTE") || r.includes("SR COMPRA INSUFICIENTE")) return "SR bloqueado · BUY";
  if (r.includes("SR COMPRA A FRENTE") || r.includes("SR VENDA INSUFICIENTE")) return "SR bloqueado · SELL";
  if (/CONSENSO COMPRA/.test(r)) {
    const m = raw.match(/\d+/);
    return m ? `consenso placar BUY ${m[0]}s` : "consenso placar BUY";
  }
  if (/CONSENSO VENDA/.test(r)) {
    const m = raw.match(/\d+/);
    return m ? `consenso placar SELL ${m[0]}s` : "consenso placar SELL";
  }
  if (raw.length <= 26) return "Bloqueio: " + raw;
  return "Bloqueio: " + raw.slice(0, 23) + "…";
}

/**
 * Texto por lado: pronto, bloqueio do EA, ou consenso em curso — não confundir com o sinal COMPRA/VENDA do strip.
 * @param {boolean} [short] — true: rótulos curtos para a faixa; false: texto completo (tooltip).
 */
function buildGatilhoSideMotiveText(side, go, readyNow, blockReason, mode, holdThisSide, short) {
  const reason = String(blockReason || "").trim();
  const shortUi = short !== false;
  /*
   * Hold do painel (timer) mantém o botão visível sem exigir buyReady/sellReady a cada tick — o EA pode oscilar.
   * O motivo na faixa deve refletir isso: não mostrar "Bloq. …" só porque o JSON voltou a ready=false com bloqueio antigo.
   */
  if (mode === "hold" && holdThisSide) {
    return shortUi
      ? "Pronto · hold"
      : "Pronto — disparo em hold (botão visível; o EA pode alternar ready enquanto o timer do painel corre)";
  }
  if (readyNow) {
    return shortUi ? "Pronto (EA)" : "Pronto — gatilho válido no EA";
  }
  if (reason) {
    return shortUi ? abbreviateGatilhoBlockReason(reason) : "Bloqueado: " + reason;
  }
  const need = Number(go && go.consensoSegundos);
  const rem =
    side === "buy"
      ? Number(go && go.consensoSegRestantesCompra)
      : Number(go && go.consensoSegRestantesVenda);
  if (Number.isFinite(need) && need > 0 && Number.isFinite(rem) && rem > 0) {
    return shortUi
      ? "consenso pendente " + Math.ceil(rem) + "s"
      : "Aguardando consenso — " + Math.ceil(rem) + "s restantes";
  }
  if (Number.isFinite(need) && need > 0 && Number.isFinite(rem) && rem <= 0) {
    return shortUi ? "consenso OK · EA" : "Consenso concluído; aguardando validação do EA";
  }
  return "—";
}

/** Uma faixa só (altura baixa): COMPRA e VENDA no mesmo texto — botões e logo não ficam empurrados. */
function renderGatilhoCompactReasonPill(go, mode, showBuy, showSell, dashboardData) {
  const rawBuy = gatilhoReadyBool(go && go.buyReady);
  const rawSell = gatilhoReadyBool(go && go.sellReady);
  const buyReadyNow = rawBuy && regimeSideConfiavelFromDash("buy", dashboardData);
  const sellReadyNow = rawSell && regimeSideConfiavelFromDash("sell", dashboardData);
  const br0 = go && typeof go.buyBlockReason === "string" ? go.buyBlockReason.trim() : "";
  const sr0 = go && typeof go.sellBlockReason === "string" ? go.sellBlockReason.trim() : "";
  const buyBlockReason =
    rawBuy && !regimeSideConfiavelFromDash("buy", dashboardData)
      ? br0
        ? `${br0} · Contexto compra não confiável`
        : "Contexto compra não confiável"
      : br0;
  const sellBlockReason =
    rawSell && !regimeSideConfiavelFromDash("sell", dashboardData)
      ? sr0
        ? `${sr0} · Contexto venda não confiável`
        : "Contexto venda não confiável"
      : sr0;
  const holdBuy = mode === "hold" && showBuy;
  const holdSell = mode === "hold" && showSell;
  const txtBuy = buildGatilhoSideMotiveText("buy", go, buyReadyNow, buyBlockReason, mode, holdBuy, true);
  const txtSell = buildGatilhoSideMotiveText("sell", go, sellReadyNow, sellBlockReason, mode, holdSell, true);
  const txtBuyFull = buildGatilhoSideMotiveText("buy", go, buyReadyNow, buyBlockReason, mode, holdBuy, false);
  const txtSellFull = buildGatilhoSideMotiveText("sell", go, sellReadyNow, sellBlockReason, mode, holdSell, false);
  const line =
    txtBuy === txtSell
      ? txtBuy === "—"
        ? "Compra / Venda: —"
        : `Compra / Venda: ${txtBuy}.`
      : `Compra: ${txtBuy} · Venda: ${txtSell}`;
  const lineFull = `COMPRA — ${txtBuyFull} · VENDA — ${txtSellFull}`;
  return `<div class="gatilho-lateral-alert-wrap gatilho-aux-line-wrap"><div class="gatilho-lateral-alert gatilho-lateral-alert--reason-info gatilho-compact-reason" title="${escapeHtml(lineFull)}">${escapeHtml(line)}</div></div>`;
}

function gatilhoChecklistItem(label, ok, waitText, tone) {
  const cls = ok ? "ok" : "pending";
  const toneCls = ok ? ` gatilho-check-item--${tone || "warm"}` : "";
  const mark = ok ? "●" : "○";
  const suffix = ok ? "" : waitText ? ` (${waitText})` : "";
  return `<span class="gatilho-check-item gatilho-check-item--${cls}${toneCls}"><span class="gatilho-check-dot">${mark}</span> <span class="gatilho-check-label">${escapeHtml(
    label
  )}${escapeHtml(suffix)}</span></span>`;
}

function buildGatilhoChecklistSide(side, go, dashboardData) {
  const isBuy = side === "buy";
  const rawReady = gatilhoReadyBool(isBuy ? go && go.buyReady : go && go.sellReady);
  const regimeOk = regimeSideConfiavelFromDash(side, dashboardData);
  const blockReason = String(isBuy ? go && go.buyBlockReason : go && go.sellBlockReason || "").trim();
  const highConf = !!(isBuy ? go && go.buyHighConf : go && go.sellHighConf);
  const need = Math.max(1, Number(go && go.consensoSegundos) || 0);
  const rem = Number(
    isBuy ? go && go.consensoSegRestantesCompra : go && go.consensoSegRestantesVenda
  );
  const consensoOk = Number.isFinite(rem) ? rem <= 0 : !!(isBuy ? go && go.consensoCompraAtivo : go && go.consensoVendaAtivo);
  const consensoWait = !consensoOk && Number.isFinite(rem) && rem > 0 ? `${Math.ceil(rem)}s` : "";

  const microOn = !!(go && go.microestruturaAtiva);
  const microOk = microOn ? !!(isBuy ? go && go.msOkCompra : go && go.msOkVenda) : true;
  const microRelaxedByHighConf = highConf && !microOk && !/MICROESTRUTURA BLOQ/i.test(blockReason);
  const microPass = microOk || microRelaxedByHighConf;
  const microWait = microOn && !microPass ? "micro" : "";

  const absorptionBlocked = /ABSORCAO BLOQ/i.test(blockReason);
  const absorptionOk = !absorptionBlocked;

  const srBlocked = /^SR\s/i.test(blockReason);
  const srOk = !srBlocked;

  const readyFinal = rawReady && regimeOk;
  const items = [
    gatilhoChecklistItem("Consenso", consensoOk, consensoWait || (need > 0 ? `${need}s` : ""), "warm"),
    gatilhoChecklistItem("Microestrutura", microPass, microWait, "warm"),
    gatilhoChecklistItem("Absorcao", absorptionOk, absorptionBlocked ? "bloqueado" : "", "warm"),
    gatilhoChecklistItem("SR", srOk, srBlocked ? "a favor do oposto" : "", "warm"),
    gatilhoChecklistItem("Regime confiavel", regimeOk, regimeOk ? "" : "contexto", "warm"),
    gatilhoChecklistItem("Pronto para disparo", readyFinal, readyFinal ? "" : "faltam aprovacoes", "ready"),
  ];

  const tag = highConf ? `<span class="gatilho-check-hc" title="Conviccao alta ativa neste lado.">HC</span>` : "";
  return `${isBuy ? "COMPRA" : "VENDA"} ${tag} — ${items.join(" · ")}`;
}

function renderGatilhoChecklistPill(go, dashboardData, focusSide) {
  const side = String(focusSide || "").toLowerCase();
  const buyLine = side === "sell" ? "" : buildGatilhoChecklistSide("buy", go, dashboardData);
  const sellLine = side === "buy" ? "" : buildGatilhoChecklistSide("sell", go, dashboardData);
  if (!buyLine && !sellLine) return "";
  const title = "Checklist de aprovacao do gatilho: veja o que ja esta OK e o que ainda falta.";
  return `<div class="gatilho-lateral-alert-wrap gatilho-aux-line-wrap"><div class="gatilho-lateral-alert gatilho-lateral-alert--reason-info gatilho-compact-reason gatilho-checklist" title="${escapeHtml(
    title
  )}">${buyLine ? `<span class="gatilho-check-line">${buyLine}</span>` : ""}${sellLine ? `<span class="gatilho-check-line">${sellLine}</span>` : ""}</div></div>`;
}

/** Breakeven no JSON: flags truthy (EA pode mandar string) ou chaves opcionais explícitas. */
function breakevenOperacaoAtiva(go) {
  const b = go && go.breakeven && typeof go.breakeven === "object" ? go.breakeven : null;
  if (!b) return false;
  return (
    dashBoolTruthy(b.emOperacao) ||
    dashBoolTruthy(b.em_operacao) ||
    dashBoolTruthy(b.ativo) ||
    dashBoolTruthy(b.exibirBreakeven) ||
    dashBoolTruthy(b.mostrarPrecosBe)
  );
}

/** Só o par vazio do MQL sem posição (`emOperacao`/`ativo` false e sem preços). */
function breakevenJsonEhSoRepousoMql(b) {
  if (!b || typeof b !== "object") return true;
  if (computeBreakevenPrecos(b)) return false;
  const keys = Object.keys(b);
  const soFlags = keys.every((k) => k === "emOperacao" || k === "ativo" || k === "em_operacao");
  if (!soFlags) return false;
  return (
    !dashBoolTruthy(b.emOperacao) &&
    !dashBoolTruthy(b.em_operacao) &&
    !dashBoolTruthy(b.ativo)
  );
}

/** Primeiro lado do gatilho com entrada e TP numéricos distintos (para BE sintético). */
function primeiroLadoComEntradaTp(go) {
  if (!go || typeof go !== "object") return null;
  for (const side of ["buy", "sell"]) {
    const f = pickGatilhoTradeFields(go, side);
    const E = dashNum(f.entry);
    const TP = dashNum(f.tp);
    if (Number.isFinite(E) && Number.isFinite(TP) && Math.abs(TP - E) > 1e-12) return side;
  }
  return null;
}

/** Completa entrada/TP/lado no objeto breakeven a partir do gatilho quando o EA mandou flags mas esqueceu números. */
/** Sobrescreve entrada/TP do bloco breakeven com preços de posição no gatilho (EA), quando existirem. */
function mergeBreakevenComPrecosExecutadosNoGatilho(b, go) {
  if (!b || typeof b !== "object" || !go || typeof go !== "object") return b;
  const out = { ...b };
  const lo = String(out.lado ?? out.side ?? "").toLowerCase();
  const buy =
    lo === "buy" || lo === "compra" || lo === "c" || out.ladoCompra === true;
  const sell =
    lo === "sell" || lo === "venda" || lo === "v" || out.ladoVenda === true;
  if (buy) {
    const e = dashNum(
      go.entryExecutedBuy ?? go.entryBuyExecuted ?? go.precoEntradaExecutadaCompra
    );
    const t = dashNum(go.takeProfitExecutedBuy ?? go.tpExecutadoCompra);
    if (Number.isFinite(e)) out.entrada = e;
    if (Number.isFinite(t)) out.tp = t;
  } else if (sell) {
    const e = dashNum(
      go.entryExecutedSell ?? go.entrySellExecuted ?? go.precoEntradaExecutadaVenda
    );
    const t = dashNum(go.takeProfitExecutedSell ?? go.tpExecutadoVenda);
    if (Number.isFinite(e)) out.entrada = e;
    if (Number.isFinite(t)) out.tp = t;
  }
  return out;
}

function enrichBreakevenBFromGatilho(b, go) {
  const base = typeof b === "object" && b ? { ...b } : {};
  const side = primeiroLadoComEntradaTp(go);
  if (!side) return base;
  const f = pickGatilhoTradeFields(go, side);
  const E = dashNum(base.entrada ?? base.entryPrice ?? base.entry);
  const TP = dashNum(base.tp ?? base.takeProfit ?? base.takeProfitAtivo);
  base.entrada = Number.isFinite(E) ? E : dashNum(f.entry);
  base.tp = Number.isFinite(TP) ? TP : dashNum(f.tp);
  if (!base.lado && !base.side) base.lado = side === "buy" ? "buy" : "sell";
  return base;
}

/** Alinhado ao SENSE: distância TP–entrada em «pontos» > 10000 → BE ao 40%; senão ao 50%. */
const SENSE_BE_DIST_TP_ENTRADA_THRESH = 10000;

function computeBreakevenPrecos(b) {
  const E = dashNum(b.entrada ?? b.entryPrice ?? b.entry ?? b.precoAbertura);
  const TP = dashNum(b.tp ?? b.takeProfit ?? b.takeProfitAtivo);
  // Com entrada+TP no JSON, derivar sempre daqui (bate com o MT5). precos40/50 do EA
  // podiam vir de outro snapshot, outra posição ou preço de referência do gatilho (~4991).
  if (Number.isFinite(E) && Number.isFinite(TP)) {
    const dist = TP - E;
    if (Math.abs(dist) >= 1e-12) {
      const pct = (p) => E + (p / 100) * dist;
      return { p40: pct(40), p50: pct(50) };
    }
  }
  const p40e = dashNum(b.preco40 ?? b.precoBe40 ?? b.be40);
  const p50e = dashNum(b.preco50 ?? b.precoBe50 ?? b.be50);
  if (Number.isFinite(p40e) && Number.isFinite(p50e)) return { p40: p40e, p50: p50e };
  return null;
}

/** 40 ou 50: qual % conta para «BE ativo» (EA manda beMarcoPct / distTpEntradaPts). */
function breakevenMarcoPctAtivo(b) {
  if (!b || typeof b !== "object") return null;
  const m = dashNum(b.beMarcoPct ?? b.be_marco_pct ?? b.beRegraPct);
  if (m === 40 || m === 50) return m;
  const d = dashNum(b.distTpEntradaPts ?? b.dist_tp_entrada_pts);
  if (Number.isFinite(d)) return d > SENSE_BE_DIST_TP_ENTRADA_THRESH ? 40 : 50;
  return null;
}

function breakevenNivelDisparadoFromB(b) {
  const n = dashNum(b.nivelDisparado ?? b.nivelPct ?? b.nivel);
  if (n === 50) return 50;
  if (n === 40) return 40;
  const s = String(b.nivelDisparado ?? b.nivel ?? "").trim();
  if (s === "50" || s === "40") return Number(s);
  return null;
}

function breakevenDisparadoEstado(b, p40, p50) {
  if (!b || typeof b !== "object") return { disparado: false, nivel: null };
  if (dashBoolTruthy(b.disparado) || dashBoolTruthy(b.breakevenAtivado)) {
    const nivel = breakevenNivelDisparadoFromB(b);
    return { disparado: true, nivel };
  }
  const last = dashNum(b.precoAtual ?? b.last ?? b.bid ?? b.ask);
  if (!Number.isFinite(last) || !Number.isFinite(p40)) return { disparado: false, nivel: null };
  const lado = String(b.lado ?? b.side ?? "").toLowerCase();
  const isBuy = lado === "buy" || lado === "compra" || lado === "c" || b.ladoCompra === true;
  const isSell = lado === "sell" || lado === "venda" || lado === "v" || b.ladoVenda === true;
  const marco = breakevenMarcoPctAtivo(b);
  if (isBuy) {
    if (marco === 40) {
      if (last >= p40) return { disparado: true, nivel: 40 };
    } else if (marco === 50) {
      if (Number.isFinite(p50) && last >= p50) return { disparado: true, nivel: 50 };
    } else {
      if (Number.isFinite(p50) && last >= p50) return { disparado: true, nivel: 50 };
      if (last >= p40) return { disparado: true, nivel: 40 };
    }
  } else if (isSell) {
    if (marco === 40) {
      if (last <= p40) return { disparado: true, nivel: 40 };
    } else if (marco === 50) {
      if (Number.isFinite(p50) && last <= p50) return { disparado: true, nivel: 50 };
    } else {
      if (Number.isFinite(p50) && last <= p50) return { disparado: true, nivel: 50 };
      if (last <= p40) return { disparado: true, nivel: 40 };
    }
  }
  return { disparado: false, nivel: null };
}

/** Monta o bloco BE (linha + opcional “BREAKEVEN ATIVADO” quando disparado ou preço cruzou 40%/50%). */
function formatGatilhoBreakevenBlockHtml(b, precos, tip, wrapClass) {
  const st = breakevenDisparadoEstado(b, precos.p40, precos.p50);
  const p40s = fmtNum(precos.p40, 3);
  const p50s = fmtNum(precos.p50, 3);
  const lado = String(b.lado ?? b.side ?? "").toLowerCase();
  const isBuy = lado === "buy" || lado === "compra" || lado === "c" || b.ladoCompra === true;
  const isSell = lado === "sell" || lado === "venda" || lado === "v" || b.ladoVenda === true;
  const sideLabel = isBuy ? "COMPRA" : isSell ? "VENDA" : "—";
  const marco = breakevenMarcoPctAtivo(b);
  const distPts = dashNum(b.distTpEntradaPts ?? b.dist_tp_entrada_pts);
  const regraLinhaFull =
    marco === 40
      ? `Ativo: 40% (dist TP–entrada > ${SENSE_BE_DIST_TP_ENTRADA_THRESH} pts)`
      : marco === 50
        ? `Ativo: 50% (dist ≤ ${SENSE_BE_DIST_TP_ENTRADA_THRESH} pts)`
        : "Referência 40%/50% (sem dist do EA)";
  const msgText =
    st.nivel != null
      ? `BREAKEVEN ATIVADO (${st.nivel}%)`
      : "BREAKEVEN ATIVADO";
  const msgHtml = st.disparado
    ? `<div class="gatilho-breakeven__msg gatilho-breakeven__msg--fire" title="Preço atingiu o nível de BE ou o EA sinalizou stop ao empate.">${escapeHtml(
        msgText
      )}</div>`
    : "";
  const cls = wrapClass || "gatilho-breakeven-wrap";
  const distHintFull =
    Number.isFinite(distPts) && distPts >= 0 ? ` · dist TP–entrada: ${fmtNum(distPts, 0)} pts` : "";
  const fullLine = `${regraLinhaFull}${distHintFull} · BE 40%: ${p40s} · BE 50%: ${p50s} · ${sideLabel}`;
  const title = `${String(tip || "").trim()}\n${fullLine}`.trim();
  const distUi =
    Number.isFinite(distPts) && distPts >= 0
      ? `${fmtNum(distPts, 0)} pts`
      : "— pts";
  const compactLine = `BE ATIVO: entrada ${distUi} => 40% preço ${p40s} => 50% preço ${p50s} ${sideLabel}`;
  return `<div class="${cls}" title="${escapeHtml(title)}">
    <div class="gatilho-breakeven__lines" title="${escapeHtml(title)}">
      <div class="gatilho-breakeven__line gatilho-breakeven__line--compact">${escapeHtml(compactLine)}</div>
    </div>
    ${msgHtml}
  </div>`;
}

/**
 * BE 40%/50% + “BREAKEVEN ATIVADO” quando aplicável.
 * — JSON `gatilhoOperacional.breakeven` (não só com emOperacao: também objeto com preços).
 * — Se faltar entrada/TP no breakeven mas emOperacao=true, completa a partir do gatilho.
 * — Sintético: hold (um ou dois botões) ou repouso com `allowSynthetic` e entrada+TP no JSON do gatilho.
 */
function pickSideParaBreakevenSintetico(go, holdCtx) {
  const showBuy = !!holdCtx.showBuy;
  const showSell = !!holdCtx.showSell;
  if (showBuy && !showSell) return "buy";
  if (showSell && !showBuy) return "sell";
  if (showBuy && showSell) return primeiroLadoComEntradaTp(go);
  if (holdCtx.allowSynthetic) return primeiroLadoComEntradaTp(go);
  return null;
}

function renderBreakevenSinteticoHtml(go, side) {
  if (!side || !go) return "";
  const f = pickGatilhoTradeFields(go, side);
  const E = dashNum(f.entry);
  const TP = dashNum(f.tp);
  if (!Number.isFinite(E) || !Number.isFinite(TP) || Math.abs(TP - E) <= 1e-12) return "";
  const dist = TP - E;
  const pct = (p) => E + (p / 100) * dist;
  const precos = { p40: pct(40), p50: pct(50) };
  const sideLabel = side === "buy" ? "COMPRA" : "VENDA";
  const p40s = fmtNum(precos.p40, 3);
  const p50s = fmtNum(precos.p50, 3);
  const distUi = `${fmtNum(Math.abs(dist), 0)} pts`;
  const compactLine = `BE ATIVO: entrada ${distUi} => 40% preço ${p40s} => 50% preço ${p50s} ${sideLabel}`;
  const tip = `BE 40% e 50% entre entrada e TP do gatilho (${sideLabel}). Com bloco «breakeven» no JSON vêm também preço atual e “BREAKEVEN ATIVADO” automáticos.`;
  return `<div class="gatilho-breakeven-wrap gatilho-breakeven-wrap--synthetic" title="${escapeHtml(tip)}">
    <div class="gatilho-breakeven__lines" title="${escapeHtml(tip)}">
      <div class="gatilho-breakeven__line gatilho-breakeven__line--compact">${escapeHtml(compactLine)}</div>
    </div>
  </div>`;
}

function tryRenderBreakevenFromJson(go) {
  const bRaw = go?.breakeven;
  if (!bRaw || typeof bRaw !== "object") return "";
  // Regra operacional: mostrar BE apenas com operação aberta no EA.
  if (!breakevenOperacaoAtiva(go)) return "";
  if (breakevenJsonEhSoRepousoMql(bRaw)) return "";
  let b = mergeBreakevenComPrecosExecutadosNoGatilho({ ...bRaw }, go);
  let precos = computeBreakevenPrecos(b);
  if (!precos && breakevenOperacaoAtiva(go)) {
    b = enrichBreakevenBFromGatilho({ ...bRaw }, go);
    b = mergeBreakevenComPrecosExecutadosNoGatilho(b, go);
    precos = computeBreakevenPrecos(b);
  }
  if (!precos || !Number.isFinite(precos.p40) || !Number.isFinite(precos.p50)) return "";
  const lado = String(b.lado ?? b.side ?? "").toLowerCase();
  const isBuy = lado === "buy" || lado === "compra" || lado === "c" || b.ladoCompra === true;
  const isSell = lado === "sell" || lado === "venda" || lado === "v" || b.ladoVenda === true;
  const sideLabel = isBuy ? "COMPRA" : isSell ? "VENDA" : "—";
  const tip = `Breakeven SENSE: se dist TP–entrada > ${SENSE_BE_DIST_TP_ENTRADA_THRESH} pts → só marco 40%; senão só 50%. Referências 40%/50% no percurso. ${sideLabel}.`;
  return formatGatilhoBreakevenBlockHtml(b, precos, tip, "gatilho-breakeven-wrap");
}

function renderGatilhoBreakevenBlock(go, holdCtx) {
  holdCtx = holdCtx || {};
  if (go && typeof go === "object") {
    const fromJson = tryRenderBreakevenFromJson(go);
    if (fromJson) return fromJson;
  }
  return "";
}

/** Mapeia classes da cápsula antiga para o tubo vertical (calor + lado). */
function gatilhoThermoMeterModKey(thermoToneFull) {
  const t = String(thermoToneFull || "");
  const heat = t.includes("--ready")
    ? "ready"
    : t.includes("--hot")
      ? "hot"
      : t.includes("--warm")
        ? "warm"
        : "cold";
  let side = "neutral";
  if (t.includes("thermo-neutral")) side = "neutral";
  else if (t.includes("gatilho-lateral-alert--sell")) side = "sell";
  else if (t.includes("gatilho-lateral-alert--buy")) side = "buy";
  return { heat, side };
}

/**
 * Termómetro vertical: posição 0 = venda (base), 1 = compra (topo); mesma métrica que readinessBuy/Sell.
 */
function renderGatilhoThermoMeterHtml(readinessBuy, readinessSell, thermoToneFull, title) {
  const clamp01 = (x) => Math.max(0, Math.min(1, Number(x) || 0));
  const pos = clamp01((readinessBuy - readinessSell + 1) / 2);
  const intensity = clamp01(Math.max(readinessBuy, readinessSell));
  const { heat, side } = gatilhoThermoMeterModKey(thermoToneFull);
  // Só apresentação: 0% no equilíbrio (meio do tubo); sobe até 100% quanto mais se afasta de C ou V (|pos−0,5|×2). pos/CSS inalterados.
  const strengthPct = Math.min(100, Math.round(Math.abs(pos - 0.5) * 200));
  const domBuy = pos > 0.5;
  const domSell = pos < 0.5;
  const atCenter = strengthPct === 0;
  const pctTone = atCenter ? "neut" : domBuy ? "buy" : "sell";
  const viesShort = atCenter ? "equilibrado" : domBuy ? "comprador" : "vendedor";
  const markerDir = atCenter ? "mid" : domBuy ? "up" : "down";
  const markerAnim = !atCenter && strengthPct > 10;
  const markerClass = `gatilho-thermo-viz__marker gatilho-thermo-viz__marker--${markerDir}${markerAnim ? " gatilho-thermo-viz__marker--anim" : ""}`;
  const escTitle = escapeHtml(
    `${String(title || "").trim()} — Força ${strengthPct}% (0% = equilíbrio C/V; sobe até 100% ao inclinar). Seta: ${markerDir === "up" ? "▲ compra" : markerDir === "down" ? "▼ venda" : "neutro"}. Viés: ${viesShort}.`,
  );
  const ariaPreparo = atCenter
    ? "Preparo do gatilho: equilíbrio, força zero; indicador ao meio do percurso V a C"
    : `Preparo do gatilho: força ${strengthPct} por cento relativamente ao centro; viés ${viesShort}; seta ${markerDir === "up" ? "para compra (topo)" : "para venda (base)"}`;
  return `<div class="gatilho-thermo-meter-wrap" title="${escTitle}">
    <div class="gatilho-thermo-viz gatilho-thermo-viz--heat-${heat} gatilho-thermo-viz--side-${side}" style="--thermo-pos: ${pos}; --thermo-intensity: ${intensity};" role="img" aria-label="${escapeHtml(ariaPreparo)}.">
      <span class="gatilho-thermo-viz__cap gatilho-thermo-viz__cap--c">C</span>
      <div class="gatilho-thermo-viz__tube-wrap">
        <div class="gatilho-thermo-viz__tube">
          <div class="gatilho-thermo-viz__track" aria-hidden="true"></div>
          <div class="gatilho-thermo-viz__fill" aria-hidden="true"></div>
        </div>
        <div class="${markerClass}" aria-hidden="true"></div>
      </div>
      <span class="gatilho-thermo-viz__cap gatilho-thermo-viz__cap--v">V</span>
    </div>
    <div class="gatilho-thermo-pct gatilho-thermo-pct--${pctTone}" aria-hidden="true">
      <span class="gatilho-thermo-pct__num">${strengthPct}%</span>
    </div>
  </div>`;
}

/**
 * Termómetros idle/hold e flags de hold de disparo — partilhado entre Gatilho (coluna AGR) e faixa Makers.
 */
function gatilhoBuildPrepState(go, schemaVersion, dashboardData) {
  const readinessLevelClass = (r01) => {
    if (r01 >= 0.92) return "gatilho-lateral-alert--ready";
    if (r01 >= 0.68) return "gatilho-lateral-alert--hot";
    if (r01 >= 0.4) return "gatilho-lateral-alert--warm";
    return "gatilho-lateral-alert--cold";
  };
  /** Neutro (amarelo): preparo compra ≈ venda; ao desequilibrar, azul ou vermelho. */
  const THERMO_NEUTRAL_EPS = 0.08;
  const readinessSideClass = (buy01, sell01, text, holdBuyOnly, holdSellOnly, holdBoth) => {
    if (holdSellOnly && !holdBuyOnly) return "gatilho-lateral-alert--sell";
    if (holdBuyOnly && !holdSellOnly) return "gatilho-lateral-alert--buy";
    const t = stripAccentsForDisplay(String(text || "")).toUpperCase();
    const comboCv = /COMPRA\s*\/\s*VENDA\s*:/i.test(t);
    const hasCompraLabeled = /\bCOMPRA\s*:/.test(t) || comboCv;
    const hasVendaLabeled = /\bVENDA\s*:/.test(t) || comboCv;
    if (holdBoth && hasCompraLabeled && hasVendaLabeled) return "gatilho-lateral-alert--thermo-neutral";
    if (hasCompraLabeled && !hasVendaLabeled) return "gatilho-lateral-alert--buy";
    if (hasVendaLabeled && !hasCompraLabeled) return "gatilho-lateral-alert--sell";
    if (Math.abs(buy01 - sell01) <= THERMO_NEUTRAL_EPS) return "gatilho-lateral-alert--thermo-neutral";
    return buy01 > sell01 ? "gatilho-lateral-alert--buy" : "gatilho-lateral-alert--sell";
  };
  const readinessLevelForHold = (rb, rs, holdBuyOnly, holdSellOnly) => {
    if (holdSellOnly && !holdBuyOnly) return readinessLevelClass(rs);
    if (holdBuyOnly && !holdSellOnly) return readinessLevelClass(rb);
    return readinessLevelClass(Math.max(rb, rs));
  };
  const v = Number(schemaVersion || 1);
  if (v < 6 || !go || typeof go !== "object") return null;
  const now = Date.now();
  const holdBuy = window.SenseRendererState.gatilhoBuyHoldUntil > 0 && now < window.SenseRendererState.gatilhoBuyHoldUntil;
  const holdSell = window.SenseRendererState.gatilhoSellHoldUntil > 0 && now < window.SenseRendererState.gatilhoSellHoldUntil;
  const rawBuyReady = gatilhoReadyBool(go && go.buyReady);
  const rawSellReady = gatilhoReadyBool(go && go.sellReady);
  const buyReadyNow = rawBuyReady && regimeSideConfiavelFromDash("buy", dashboardData);
  const sellReadyNow = rawSellReady && regimeSideConfiavelFromDash("sell", dashboardData);
  const buyBlockReasonBase = go && typeof go.buyBlockReason === "string" ? go.buyBlockReason.trim() : "";
  const sellBlockReasonBase = go && typeof go.sellBlockReason === "string" ? go.sellBlockReason.trim() : "";
  const buyBlockReason =
    rawBuyReady && !regimeSideConfiavelFromDash("buy", dashboardData)
      ? buyBlockReasonBase
        ? `${buyBlockReasonBase} · Contexto compra não confiável`
        : "Contexto compra não confiável"
      : buyBlockReasonBase;
  const sellBlockReason =
    rawSellReady && !regimeSideConfiavelFromDash("sell", dashboardData)
      ? sellBlockReasonBase
        ? `${sellBlockReasonBase} · Contexto venda não confiável`
        : "Contexto venda não confiável"
      : sellBlockReasonBase;
  const consensoNeedSec = Number(go && go.consensoSegundos);
  const consensoRemBuy = Number(go && go.consensoSegRestantesCompra);
  const consensoRemSell = Number(go && go.consensoSegRestantesVenda);
  const consensoBuyStarted =
    Number.isFinite(consensoNeedSec) &&
    consensoNeedSec > 0 &&
    Number.isFinite(consensoRemBuy) &&
    consensoRemBuy < consensoNeedSec;
  const consensoSellStarted =
    Number.isFinite(consensoNeedSec) &&
    consensoNeedSec > 0 &&
    Number.isFinite(consensoRemSell) &&
    consensoRemSell < consensoNeedSec;
  const consensoBuyPassed = consensoBuyStarted && consensoRemBuy <= 0;
  const consensoSellPassed = consensoSellStarted && consensoRemSell <= 0;
  const isSemConsenso = (s) => {
    const t = String(s || "").trim().toUpperCase();
    return t.startsWith("SEM CONSENSO");
  };
  const infoParts = [];
  const showBuySemConsenso = consensoBuyPassed && !buyReadyNow && isSemConsenso(buyBlockReason);
  const showSellSemConsenso = consensoSellPassed && !sellReadyNow && isSemConsenso(sellBlockReason);
  if (showBuySemConsenso && showSellSemConsenso) {
    infoParts.push("COMPRA/VENDA: SEM CONSENSO");
  } else {
    if (consensoBuyPassed && !buyReadyNow && buyBlockReason) infoParts.push(`COMPRA: ${buyBlockReason}`);
    if (consensoSellPassed && !sellReadyNow && sellBlockReason) infoParts.push(`VENDA: ${sellBlockReason}`);
  }
  const infoText = infoParts.join(" · ");
  const dualSummaryForThermo = [buyBlockReason && `COMPRA: ${buyBlockReason}`, sellBlockReason && `VENDA: ${sellBlockReason}`]
    .filter(Boolean)
    .join(" · ");
  const readinessBuy = gatilhoEaPrepScore01("buy", go, buyReadyNow, buyBlockReason, dashboardData);
  const readinessSell = gatilhoEaPrepScore01("sell", go, sellReadyNow, sellBlockReason, dashboardData);
  const hbOnlyPre = holdBuy && !holdSell;
  const hsOnlyPre = holdSell && !holdBuy;
  const hbBothPre = holdBuy && holdSell;
  const thermoToneIdle =
    go && typeof go === "object"
      ? `${readinessLevelForHold(readinessBuy, readinessSell, hbOnlyPre, hsOnlyPre)} ${readinessSideClass(
          readinessBuy,
          readinessSell,
          infoText,
          hbOnlyPre,
          hsOnlyPre,
          hbBothPre
        )}`.trim()
      : "gatilho-lateral-alert--cold gatilho-lateral-alert--thermo-neutral";
  const thermoTooltip =
    "Preparo: filtros EA (ZFlow, consenso, micro, absorção, SR) e contexto por lado. O número mostrado é a força 0–100% a partir do equilíbrio (0% = centro); tubo e seta seguem o mesmo eixo físico. C = topo, V = base.";
  const thermoMeterIdle = renderGatilhoThermoMeterHtml(readinessBuy, readinessSell, thermoToneIdle, thermoTooltip);
  const showBuy = holdBuy;
  const showSell = holdSell;
  const thermoSideTextHold = dualSummaryForThermo || infoText;
  const thermoToneHold =
    go && typeof go === "object"
      ? `${readinessLevelForHold(readinessBuy, readinessSell, hbOnlyPre, hsOnlyPre)} ${readinessSideClass(
          readinessBuy,
          readinessSell,
          thermoSideTextHold,
          hbOnlyPre,
          hsOnlyPre,
          hbBothPre
        )}`.trim()
      : "gatilho-lateral-alert--cold gatilho-lateral-alert--thermo-neutral";
  const thermoMeterHold = renderGatilhoThermoMeterHtml(readinessBuy, readinessSell, thermoToneHold, thermoTooltip);
  return {
    showBuy,
    showSell,
    readinessBuy,
    readinessSell,
    thermoMeterIdle,
    thermoMeterHold,
    thermoTooltip,
  };
}

/** Termómetro + logo SENSE na coluna Makers (no sítio da antiga bússola PTAX). */
function renderMakersPreparoRow(go, schemaVersion, aggressionText, dashboardData) {
  const prep = gatilhoBuildPrepState(go, schemaVersion, dashboardData);
  const agg = typeof aggressionText === "string" ? aggressionText : "";
  /* Sem schema v6 / gatilhoOperacional o termómetro não existe — a logo SENSE IA continua obrigatória (atalho). */
  if (!prep) {
    const logoHtmlOnly = `<div class="hud-makers-preparo__logo hud-makers-preparo__logo--dual" data-sense-ia-trigger="1" title="SENSE IA — clique para consultar">
        <div class="hud-makers-preparo__dual-layer hud-makers-preparo__dual-layer--logo">${renderGatilhoIdleLogo(agg)}</div>
        <div class="hud-makers-preparo__dual-layer hud-makers-preparo__dual-layer--text" aria-hidden="true"></div>
      </div>`;
    return `<div class="hud-makers-preparo hud-makers-preparo--no-prep" role="group" aria-label="Marca SENSE e SENSE IA">
      ${logoHtmlOnly}
    </div>`;
  }
  const { showBuy, showSell, thermoMeterIdle, thermoMeterHold } = prep;
  const idle = !showBuy && !showSell;
  const thermoHtml = idle ? thermoMeterIdle : thermoMeterHold;
  /* Duas camadas: logo + texto IA (texto preenchido em syncSenseIaHudOverlayLayers após o tick). */
  // Logo central SENSE: visível em repouso e com gatilho ativo (antes sumia no HOLD).
  const logoHtml = `<div class="hud-makers-preparo__logo hud-makers-preparo__logo--dual${
    idle ? "" : " hud-makers-preparo__logo--with-hold"
  }" data-sense-ia-trigger="1" title="SENSE IA — clique para consultar">
        <div class="hud-makers-preparo__dual-layer hud-makers-preparo__dual-layer--logo">${renderGatilhoIdleLogo(agg)}</div>
        <div class="hud-makers-preparo__dual-layer hud-makers-preparo__dual-layer--text" aria-hidden="true"></div>
      </div>`;
  return `<div class="hud-makers-preparo${idle ? "" : " hud-makers-preparo--hold"}" role="group" aria-label="Preparo do gatilho e marca SENSE">
    <div class="hud-makers-preparo__thermo">${thermoHtml}</div>
    ${logoHtml}
  </div>`;
}

function contextoSideHintFromDash(dashboardData) {
  const rm = dashboardData && dashboardData.regimeMercado && typeof dashboardData.regimeMercado === "object"
    ? dashboardData.regimeMercado
    : null;
  const vies = stripAccentsForDisplay(String((rm && rm.vies) || "")).toLowerCase();
  if (vies.includes("compra")) return "buy";
  if (vies.includes("venda")) return "sell";
  const td = Number(dashboardData && dashboardData.flow && dashboardData.flow.trendDir);
  if (Number.isFinite(td)) {
    if (td > 0.02) return "buy";
    if (td < -0.02) return "sell";
  }
  return "";
}

function pickContextSide(buyScore, sellScore, dashboardData) {
  const b = Number.isFinite(buyScore) ? buyScore : 0;
  const s = Number.isFinite(sellScore) ? sellScore : 0;
  if (b > s) return "buy";
  if (s > b) return "sell";
  return contextoSideHintFromDash(dashboardData);
}

function renderGatilhoMemoriaTrianguloHtml(dashboardData) {
  const now = Date.now();
  const buyMem = window.SenseRendererState.regimeCompraConfiavelMemUntil > now;
  const sellMem = window.SenseRendererState.regimeVendaConfiavelMemUntil > now;
  // Triângulo segue estritamente a linha "Contexto de mercado" (sem fallback implícito do regime).
  const buyConfiavelNow = window.SenseRendererState.gatilhoContextoFlowBuyConfiavel === true;
  const sellConfiavelNow = window.SenseRendererState.gatilhoContextoFlowSellConfiavel === true;
  // Regra direta pedida: usar % da linha "Contexto de mercado" (Fluxo por ativo) acima de 30%.
  const buyPctAbove = Number.isFinite(window.SenseRendererState.gatilhoContextoFlowBuy01) && window.SenseRendererState.gatilhoContextoFlowBuy01 >= window.SenseRendererState.gatilhoTriPulseThreshold01;
  const sellPctAbove =
    Number.isFinite(window.SenseRendererState.gatilhoContextoFlowSell01) && window.SenseRendererState.gatilhoContextoFlowSell01 >= window.SenseRendererState.gatilhoTriPulseThreshold01;
  // Fase 1 (prep): basta passar o limiar percentual do contexto (amarelo), sem exigir confiável.
  const buyPrep = !buyMem && buyPctAbove;
  const sellPrep = !sellMem && sellPctAbove;
  if (!buyMem && !sellMem && !buyPrep && !sellPrep) return "";

  const buyScore = Number.isFinite(window.SenseRendererState.gatilhoContextoFlowBuy01) ? window.SenseRendererState.gatilhoContextoFlowBuy01 : 0;
  const sellScore = Number.isFinite(window.SenseRendererState.gatilhoContextoFlowSell01) ? window.SenseRendererState.gatilhoContextoFlowSell01 : 0;

  // Mostrar um lado só: prioridade para "confiável" (memória), depois lado mais forte no %.
  let side = "";
  let mode = "";
  if (buyMem && !sellMem) {
    side = "buy";
    mode = "mem";
  } else if (sellMem && !buyMem) {
    side = "sell";
    mode = "mem";
  } else if (buyMem && sellMem) {
    if (buyConfiavelNow && !sellConfiavelNow) side = "buy";
    else if (sellConfiavelNow && !buyConfiavelNow) side = "sell";
    else side = pickContextSide(buyScore, sellScore, dashboardData);
    mode = "mem";
  } else if (buyPrep && !sellPrep) {
    side = "buy";
    mode = "prep";
  } else if (sellPrep && !buyPrep) {
    side = "sell";
    mode = "prep";
  } else if (buyPrep && sellPrep) {
    side = pickContextSide(buyScore, sellScore, dashboardData);
    mode = "prep";
  }
  if (!side) return "";

  const tri = side === "buy" ? "▲" : "▼";
  const title =
    mode === "mem"
      ? side === "buy"
        ? "Memória Compra confiável ativa (120s)."
        : "Memória Venda confiável ativa (120s)."
      : side === "buy"
        ? "Compra acima de 30% no Contexto de mercado (pulso lento)."
        : "Venda acima de 30% no Contexto de mercado (pulso lento).";
  return `<span class="gatilho-mem-tri-wrap" aria-label="Sinal de preparo/memória do contexto">
    <span class="gatilho-mem-tri gatilho-mem-tri--${side} gatilho-mem-tri--${mode}" title="${title}" aria-hidden="true">${tri}</span>
  </span>`;
}

function renderGatilhoOperacional(go, schemaVersion, _aggressionText, dashboardData) {
  const prep = gatilhoBuildPrepState(go, schemaVersion, dashboardData);
  if (!prep) return "";
  const { showBuy, showSell, readinessBuy, readinessSell } = prep;
  const contextoSide = contextoSideHintFromDash(dashboardData);
  const regimeBuyOk = regimeSideConfiavelFromDash("buy", dashboardData);
  const regimeSellOk = regimeSideConfiavelFromDash("sell", dashboardData);
  let checklistFocusSide = "";
  if (showBuy && !showSell) checklistFocusSide = "buy";
  else if (showSell && !showBuy) checklistFocusSide = "sell";
  else if (contextoSide === "buy" || contextoSide === "sell") checklistFocusSide = contextoSide;
  else if (regimeBuyOk && !regimeSellOk) checklistFocusSide = "buy";
  else if (regimeSellOk && !regimeBuyOk) checklistFocusSide = "sell";
  else {
    const rb = Number(readinessBuy) || 0;
    const rs = Number(readinessSell) || 0;
    if (rb > 0 || rs > 0) checklistFocusSide = rb >= rs ? "buy" : "sell";
  }
  const memoriaTriangulo = renderGatilhoMemoriaTrianguloHtml(dashboardData);
  const memoriaTrianguloInline = memoriaTriangulo
    ? memoriaTriangulo.replace("gatilho-mem-tri-wrap", "gatilho-mem-tri-wrap gatilho-mem-tri-wrap--inline")
    : "";
  const memoriaTrianguloRow = memoriaTrianguloInline
    ? `<div class="gatilho-mem-tri-row">${memoriaTrianguloInline}</div>`
    : "";
  const titleRow = `<div class="gatilho-title-row"><h4 class="gatilho-subtitle">Gatilho operacional</h4></div>`;
  if (!showBuy && !showSell) {
    const idleMotiveLine = renderGatilhoChecklistPill(go, dashboardData, checklistFocusSide);
    const breakevenBlockIdle = renderGatilhoBreakevenBlock(go, { allowSynthetic: true });
    return `
    <div class="gatilho-wrap gatilho-wrap--idle${breakevenBlockIdle ? " gatilho-wrap--breakeven" : ""}">
      ${titleRow}
      ${idleMotiveLine}
      ${memoriaTrianguloRow}
      ${breakevenBlockIdle}
    </div>`;
  }

  const lateral = ativoLateralFromDash(dashboardData);
  const showLateralWarn = lateral && (showBuy || showSell);
  const trendClashLabel = trendContradictsGatilhoLabel(dashboardData, showBuy, showSell);
  const trendOk =
    trendAlignedWithGatilho(dashboardData, showBuy, showSell) && !trendClashLabel && !showLateralWarn;
  const cuidadoParts = [];
  if (showLateralWarn) cuidadoParts.push("ATV LATERAL");
  if (trendClashLabel) cuidadoParts.push(trendClashLabel);
  const showCuidadoLine = cuidadoParts.length > 0;
  const cuidadoTitle = [
    showLateralWarn && "Viés NTSL dentro da zona fraca — EA não opera; sinal só informativo.",
    trendClashLabel && `Gatilho com lado contrário ao viés em Viés/TEND.: ${trendClashLabel}.`,
  ]
    .filter(Boolean)
    .join(" ");
  const buyF = pickGatilhoTradeFields(go, "buy");
  const sellF = pickGatilhoTradeFields(go, "sell");
  const fmt = (x) => (x && String(x).trim() ? escapeHtml(x) : "—");
  const rows = (f) => `
      <div class="gatilho-detail-row"><span class="gatilho-detail-k">Preco</span><span class="gatilho-detail-v">${fmt(f.entry)}</span></div>
      <div class="gatilho-detail-row"><span class="gatilho-detail-k">Stop loss</span><span class="gatilho-detail-v">${fmt(f.sl)}</span></div>
      <div class="gatilho-detail-row"><span class="gatilho-detail-k">Stop gain</span><span class="gatilho-detail-v">${fmt(f.tp)}</span></div>`;
  const showBoth = showBuy && showSell;

  const buyBtn = showBuy
    ? `<div class="gatilho-btn gatilho-btn--buy gatilho-btn--on">
         <span class="gatilho-btn__label">COMPRA</span>
       </div>`
    : "";
  const sellBtn = showSell
    ? `<div class="gatilho-btn gatilho-btn--sell gatilho-btn--on">
         <span class="gatilho-btn__label">VENDA</span>
       </div>`
    : "";

  const detailsBuy = showBuy
    ? `<div class="gatilho-details${showBoth ? " gatilho-details--stacked" : ""}">${showBoth ? '<div class="gatilho-side-tit">Compra</div>' : ""}${rows(buyF)}</div>`
    : "";
  const detailsSell = showSell
    ? `<div class="gatilho-details${showBoth ? " gatilho-details--stacked" : ""}">${showBoth ? '<div class="gatilho-side-tit">Venda</div>' : ""}${rows(sellF)}</div>`
    : "";
  const details = `<div class="gatilho-details-wrap">${detailsBuy}${detailsSell}</div>`;
  const lateralAlert = showCuidadoLine
    ? `<div class="gatilho-lateral-alert-wrap gatilho-aux-line-wrap"><div class="gatilho-lateral-alert gatilho-lateral-alert--cuidado" title="${escapeHtml(
        cuidadoTitle
      )}">CUIDADO · ${cuidadoParts.map((p) => escapeHtml(p)).join(" · ")}</div></div>`
    : "";
  const direcaoOkAlert = trendOk
    ? `<div class="gatilho-lateral-alert-wrap gatilho-aux-line-wrap"><div class="gatilho-lateral-alert gatilho-lateral-alert--direcao-ok" title="Viés/TEND. alinhado ao gatilho ativo (compra com alta, venda com baixa).">VIÉS ALINHADO</div></div>`
    : "";
  // Quando há botão COMPRA/VENDA ativo, oculta a linha de checklist para não sobrepor.
  const compactReasonHold = showBuy || showSell ? "" : renderGatilhoChecklistPill(go, dashboardData, checklistFocusSide);

  // BE só quando o botão COMPRA/VENDA não está na tela (evita competir visualmente com o hold).
  const breakevenBlockHold =
    showBuy || showSell ? "" : renderGatilhoBreakevenBlock(go, { showBuy, showSell });

  /* Termómetro na coluna Makers; aqui só botões + preço/SL/TP. */
  return `
    <div class="gatilho-wrap gatilho-wrap--hold${showCuidadoLine ? " gatilho-wrap--lateral-warn" : ""}${
      breakevenBlockHold ? " gatilho-wrap--breakeven" : ""
    }">
      ${titleRow}
      ${lateralAlert}
      ${direcaoOkAlert}
      ${compactReasonHold}
      ${memoriaTrianguloRow}
      <div class="gatilho-body gatilho-body--hold-only-main">
        <div class="gatilho-body__main">
      <div class="gatilho-btns">
        ${buyBtn}
        ${sellBtn}
      </div>
      ${details}
        </div>
      </div>
      ${breakevenBlockHold}
    </div>
  `;
}
