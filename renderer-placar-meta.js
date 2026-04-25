/**
 * Placar / resumo: meta rodapé, heurísticas de linha placar & scores, absorção (texto + nuance SR), PTAX bússola no placar.
 * Depende de renderer-utils (`fmtNum`, `escapeHtml`), renderer-flow-levels.js (`stripAccentsForDisplay`).
 * Carregar depois de renderer-delta.js e antes de renderer-panel-debounce.js (anti-piscar do resumo) e renderer-hud.js (HUD usa `srDetectAbsorptionNuance`).
 */
(function () {
  "use strict";
  if (typeof window === "undefined") {
    throw new Error("Painel SENSE: ambiente sem window.");
  }
  if (typeof escapeHtml !== "function" || typeof fmtNum !== "function") {
    throw new Error("Painel SENSE: falta renderer-utils.js antes de renderer-placar-meta.js (ver index.html).");
  }
  if (typeof stripAccentsForDisplay !== "function") {
    throw new Error("Painel SENSE: falta renderer-flow-levels.js antes de renderer-placar-meta.js (ver index.html).");
  }
})();

function patchMetaFoot(summaryBox, d) {
  if (!summaryBox) return;
  const meta = d.meta && typeof d.meta === "object" ? d.meta : {};
  const t = meta.time || "";
  const sym = meta.symbol || "";
  const el = summaryBox.querySelector(".meta-foot");
  if (el) el.textContent = `${t} · ${sym}`;
}
function placarLineRich(line) {
  return typeof line === "string" && line.trim().length > 0;
}

function summaryScoresMeaningful(p) {
  const b = Number(p.buy);
  const s = Number(p.sell);
  return Number.isFinite(b) && Number.isFinite(s) && (b > 0 || s > 0);
}

function summaryScoresZeroish(p) {
  const b = Number(p.buy);
  const s = Number(p.sell);
  return Number.isFinite(b) && Number.isFinite(s) && b === 0 && s === 0;
}

/** Placeholder comum em exports a meio — não deve substituir placar real. */
function isSuspiciousPlacarOneOne(p) {
  const b = Number(p.buy);
  const s = Number(p.sell);
  return Number.isFinite(b) && Number.isFinite(s) && b === 1 && s === 1;
}

function absorptionShown(p) {
  const a = typeof p.absorption === "string" ? p.absorption : "";
  return a.length > 0 && a.indexOf("ABSORCAO: -") < 0;
}

/** Compradores vs vendedores absorvendo — para cruzar com o líder do placar SR. */
function absorptionToneForSr(d) {
  if (!absorptionShown(d)) return "none";
  const a = stripAccentsForDisplay(String(d.absorption || "")).toLowerCase();
  if (a.includes("compradores absorvendo")) return "compra";
  if (a.includes("vendedores absorvendo")) return "venda";
  return "none";
}

/**
 * Vantagem SR extrema (|B−V| > 5) com absorção no sentido oposto ao placar —
 * texto qualificado + animação distinta (âmbar, sem deslize JS).
 */
function srDetectAbsorptionNuance(d, buyPts, sellPts) {
  const tone = absorptionToneForSr(d);
  if (tone === "none") return null;
  const diff = Math.abs(Math.round(buyPts) - Math.round(sellPts));
  if (diff <= 5) return null;
  const sellLeads = sellPts > buyPts;
  const buyLeads = buyPts > sellPts;
  if (sellLeads && tone === "compra") {
    return {
      cls: " hud-sr-detect--absorption-nuance",
      /** Texto completo após o prefixo visual "SR: " no HTML */
      labelFull: "Resistência Máx - > ABS -VENDAS SENDO ABSORVIDAS",
      tip: " Vendas sendo absorvidas (compradores absorvendo) — possível atenuação do viés do placar SR.",
    };
  }
  if (buyLeads && tone === "venda") {
    return {
      cls: " hud-sr-detect--absorption-nuance",
      labelFull: "Suporte Máx - > ABS -COMPRAS SENDO ABSORVIDAS",
      tip: " Compras sendo absorvidas (vendedores absorvendo) — possível atenuação do viés do placar SR.",
    };
  }
  return null;
}
/**
 * PTAX BC (oficial) exportada pelo EA — média (compra+venda)/2 ou campo único.
 * Nomes aceites: bcPtaxMedia | ptaxOficialBcMedia | bcMedia; ou bcPtaxCompra + bcPtaxVenda.
 */
function bcPtaxOfficialFromRaw(raw) {
  if (!raw || typeof raw !== "object") return { media: null, note: "" };
  const note = String(raw.bcPtaxNota ?? raw.bcPtaxLabel ?? "").trim();
  const m = Number(raw.bcPtaxMedia ?? raw.ptaxOficialBcMedia ?? raw.bcMedia);
  if (Number.isFinite(m) && m > 0) return { media: m, note };
  const c = Number(raw.bcPtaxCompra ?? raw.ptaxBcCompra);
  const v = Number(raw.bcPtaxVenda ?? raw.ptaxBcVenda);
  if (Number.isFinite(c) && Number.isFinite(v) && c > 0 && v > 0) return { media: (c + v) / 2, note };
  return { media: null, note };
}

/**
 * Bússola PTAX — bloco opcional `ptaxBussola` no dashboard.json.
 * Requer pelo menos: vwapSpot0, spotLast (USD/BRL). Opcional: vwapSpotD1 | ptaxOficialD1, mediasJanelas[4], modoVies, bcPtaxMedia.
 */
function computePtaxBussola(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (raw.enabled === false) return null;
  const vwap0 = Number(raw.vwapSpot0);
  const spot = Number(raw.spotLast);
  if (!Number.isFinite(vwap0) || !Number.isFinite(spot)) return null;

  const vwapD1 = Number(raw.vwapSpotD1 ?? raw.ptaxOficialD1 ?? raw.vwapD1);
  const hasD1 = Number.isFinite(vwapD1);

  const modoRaw = String(raw.modoVies ?? raw.modoViés ?? "reversao").toLowerCase();
  const isMomentum = modoRaw === "momentum" || modoRaw === "momento";

  let medias = null;
  if (Array.isArray(raw.mediasJanelas)) {
    medias = raw.mediasJanelas.map((x) => {
      const n = Number(x);
      return Number.isFinite(n) ? n : null;
    });
  }
  let k = 0;
  if (medias) {
    k = medias.filter((x) => x != null).length;
  }
  const jc = Number(raw.janelasConcluidas);
  if (Number.isFinite(jc) && jc >= 0 && jc <= 4) {
    k = Math.max(k, Math.floor(jc));
  }

  const spreadEst = Number(raw.spreadEstimado);
  const spread =
    Number.isFinite(spreadEst) && spreadEst > 0
      ? spreadEst
      : Math.max(0.0002, Math.abs(spot - vwap0) * 0.35 + 0.00025);

  const gapSv = spot - vwap0;
  const gapDv = hasD1 ? vwap0 - vwapD1 : 0;

  const eps = Math.max(0.00025, spot * 0.00004);

  let bias = "neutra";
  let needleDeg = 90;
  let score = 0;

  if (isMomentum) {
    score = gapSv + 0.25 * gapDv;
    if (score > eps) bias = "alta";
    else if (score < -eps) bias = "baixa";
  } else {
    score = -gapSv - 0.2 * gapDv;
    if (score > eps) bias = "alta";
    else if (score < -eps) bias = "baixa";
  }

  if (bias === "alta") needleDeg = 0;
  else if (bias === "baixa") needleDeg = 180;
  else needleDeg = 90;

  let forecast = null;
  const proxyRem = spot;
  if (medias && medias.some((x) => x != null)) {
    let sum = 0;
    let count = 0;
    for (let i = 0; i < 4; i++) {
      if (medias[i] != null) {
        sum += medias[i];
        count++;
      }
    }
    const rem = 4 - count;
    if (rem >= 0) {
      forecast = (sum + rem * proxyRem) / 4;
    }
  } else {
    const anchor = hasD1 ? vwap0 * 0.62 + vwapD1 * 0.38 : vwap0;
    forecast = spot * 0.45 + anchor * 0.55;
  }

  let low = null;
  let high = null;
  if (forecast != null && Number.isFinite(forecast)) {
    low = forecast - spread / 2;
    high = forecast + spread / 2;
  }

  const bcOff = bcPtaxOfficialFromRaw(raw);
  const bcMedia = bcOff.media;
  let diffBcVsForecast = null;
  if (bcMedia != null && forecast != null && Number.isFinite(forecast)) {
    diffBcVsForecast = forecast - bcMedia;
  }

  return {
    bias,
    needleDeg,
    gapSv,
    gapDv: hasD1 ? gapDv : null,
    vwap0,
    vwapD1: hasD1 ? vwapD1 : null,
    spot,
    k,
    forecast,
    low,
    high,
    spread,
    modo: isMomentum ? "momentum" : "reversao",
    bcMedia,
    bcNote: bcOff.note || null,
    diffBcVsForecast,
  };
}

/** Bússola PTAX compacta no painel Placar (ao lado da linha PLACAR: …). */
function renderPtaxBussolaPlacarStrip(d) {
  const box = computePtaxBussola(d.ptaxBussola);
  if (!box) return "";
  const bCls = box.bias === "alta" ? "alta" : box.bias === "baixa" ? "baixa" : "neutra";
  const vShort =
    box.bias === "alta"
      ? "PTAX · alta"
      : box.bias === "baixa"
        ? "PTAX · baixa"
        : "PTAX · neutro";
  const fc = box.forecast != null ? fmtNum(box.forecast, 3) : "—";
  const lo = box.low != null ? fmtNum(box.low, 3) : "—";
  const hi = box.high != null ? fmtNum(box.high, 3) : "—";
  const nums = `S ${fmtNum(box.spot, 3)} · V ${fmtNum(box.vwap0, 3)}${
    box.vwapD1 != null ? ` · D−1 ${fmtNum(box.vwapD1, 3)}` : ""
  } · j${box.k}/4`;
  const bcLine =
    box.bcMedia != null
      ? (() => {
          const bcTxt = `BC ${fmtNum(box.bcMedia, 3)}`;
          const deltaPart =
            box.diffBcVsForecast != null && Number.isFinite(box.diffBcVsForecast)
              ? ` · Δ ${box.diffBcVsForecast >= 0 ? "+" : ""}${fmtNum(box.diffBcVsForecast, 3)}`
              : "";
          return `<div class="placar-ptax__bc">${bcTxt}${deltaPart}</div>`;
        })()
      : "";
  const pbRaw = d.ptaxBussola && typeof d.ptaxBussola === "object" ? d.ptaxBussola : null;
  const bcFetchErr =
    box.bcMedia == null && pbRaw && typeof pbRaw.bcPtaxFetchError === "string" && pbRaw.bcPtaxFetchError.trim()
      ? `<div class="placar-ptax__bc placar-ptax__bc--warn">${escapeHtml(pbRaw.bcPtaxFetchError.trim())}</div>`
      : "";
  return `<div class="placar-ptax placar-ptax--bias-${bCls}" title="Bússola PTAX (indicativo).">
    <div class="placar-ptax__compass ptax-compass ptax-compass--${bCls}" aria-hidden="true">
      <span class="ptax-compass__n">↑</span>
      <span class="ptax-compass__s">↓</span>
      <div class="ptax-compass__ring"></div>
      <div class="ptax-compass__needle" style="transform: rotate(${box.needleDeg}deg)"></div>
      <div class="ptax-compass__hub"></div>
    </div>
    <div class="placar-ptax__text">
      <div class="placar-ptax__vies placar-ptax__vies--${bCls}">${escapeHtml(vShort)}</div>
      <div class="placar-ptax__est"><span class="placar-ptax__price">${escapeHtml(fc)}</span> <span class="placar-ptax__range">[${escapeHtml(
    lo
  )}–${escapeHtml(hi)}]</span></div>
      <div class="placar-ptax__nums">${escapeHtml(nums)}</div>
      ${bcLine}
      ${bcFetchErr}
    </div>
  </div>`;
}
