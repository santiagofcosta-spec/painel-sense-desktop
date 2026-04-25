/**
 * Bloco Δ agressor: glitch/vol, merge estável, barras %, streak/martelo, proxy tape.
 * Depende de renderer-utils (`escapeHtml`) e renderer-state (`window.SenseRendererState`).
 * Carregar depois de renderer-gatilho.js e antes de renderer-placar-meta.js.
 */
(function () {
  "use strict";
  if (typeof window === "undefined") {
    throw new Error("Painel SENSE: ambiente sem window.");
  }
  if (typeof escapeHtml !== "function") {
    throw new Error("Painel SENSE: falta renderer-utils.js antes de renderer-delta.js (ver index.html).");
  }
  if (!window.SenseRendererState || typeof window.SenseRendererState !== "object") {
    throw new Error("Painel SENSE: falta renderer-state.js antes de renderer-delta.js (ver index.html).");
  }
})();

function deltaLooksGlitchy(d) {
  if (!d || typeof d !== "object") return false;
  const bvRaw = Number(d.buyVol);
  const svRaw = Number(d.sellVol);
  const bv = Number.isFinite(bvRaw) ? bvRaw : 0;
  const sv = Number.isFinite(svRaw) ? svRaw : 0;
  const pb = Number(d.buyPct);
  const ps = Number(d.sellPct);
  const volSum = bv + sv;
  const epsV = 1e-9;

  if (volSum <= 1e-12) {
    if (Number.isFinite(pb) && Number.isFinite(ps) && (pb >= 80 || ps >= 80)) return true;
    return false;
  }
  // Só um lado com volume (ex.: B:5211 V:0) — % ficam 100/0 mas é artefacto típico do export; pisca vs frames com dois lados.
  const buyOnly = bv > epsV && sv <= epsV;
  const sellOnly = sv > epsV && bv <= epsV;
  if ((buyOnly || sellOnly) && volSum >= 1) return true;

  const fromVolBuy = (100 * bv) / volSum;
  const fromVolSell = 100 - fromVolBuy;
  const tol = 15;
  if (Number.isFinite(pb) && Math.abs(pb - fromVolBuy) > tol) return true;
  if (Number.isFinite(ps) && Math.abs(ps - fromVolSell) > tol) return true;
  if (bv <= 0 && sv > 0 && Number.isFinite(pb) && pb > 8) return true;
  if (sv <= 0 && bv > 0 && Number.isFinite(ps) && ps > 8) return true;
  return false;
}

function deltaVolSumIsZero(d) {
  if (!d || typeof d !== "object") return true;
  const bv = Number(d.buyVol);
  const sv = Number(d.sellVol);
  if (!Number.isFinite(bv) || !Number.isFinite(sv)) return true;
  return bv + sv <= 1e-12;
}

function mergeDeltaNumericFromStable(raw, stable) {
  if (!raw || !stable || typeof raw !== "object" || typeof stable !== "object") return raw;
  const out = {
    ...raw,
    buyVol: stable.buyVol,
    sellVol: stable.sellVol,
    buyPct: stable.buyPct,
    sellPct: stable.sellPct,
  };
  if (stable.deltaPct !== undefined && stable.deltaPct !== null) out.deltaPct = stable.deltaPct;
  return out;
}
function deltaDisplayForUi(delta) {
  const empty = { buyPct: 0, sellPct: 0, buyVol: NaN, sellVol: NaN };
  if (!delta || typeof delta !== "object") return empty;
  let bv = Number(delta.buyVol);
  let sv = Number(delta.sellVol);
  if (Number.isFinite(bv) && Number.isFinite(sv) && bv + sv > 1e-12) {
    return {
      buyPct: (100 * bv) / (bv + sv),
      sellPct: (100 * sv) / (bv + sv),
      buyVol: bv,
      sellVol: sv,
    };
  }
  const pb = Number(delta.buyPct);
  const ps = Number(delta.sellPct);
  const pctExtreme =
    (Number.isFinite(pb) && pb >= 85) || (Number.isFinite(ps) && ps >= 85);
  const tryFallback = (lg) => {
    if (!lg || typeof lg !== "object" || deltaLooksGlitchy(lg)) return null;
    const lb = Number(lg.buyVol);
    const ls = Number(lg.sellVol);
    if (Number.isFinite(lb) && Number.isFinite(ls) && lb + ls > 1e-12) {
      return {
        buyPct: (100 * lb) / (lb + ls),
        sellPct: (100 * ls) / (lb + ls),
        buyVol: lb,
        sellVol: ls,
      };
    }
    return null;
  };
  if (pctExtreme) {
    const fromStable = window.SenseRendererState.lastStableDelta ? tryFallback(window.SenseRendererState.lastStableDelta) : null;
    if (fromStable) return fromStable;
    if (window.SenseRendererState.lastGoodResult && window.SenseRendererState.lastGoodResult.data && window.SenseRendererState.lastGoodResult.data.delta) {
      const fromLg = tryFallback(window.SenseRendererState.lastGoodResult.data.delta);
      if (fromLg) return fromLg;
    }
  }
  const b = Math.max(0, Math.min(100, Number(delta.buyPct) || 0));
  const s = Math.max(0, Math.min(100, Number(delta.sellPct) || 0));
  const sum = b + s || 1;
  return {
    buyPct: (100 * b) / sum,
    sellPct: (100 * s) / sum,
    buyVol: bv,
    sellVol: sv,
  };
}

/**
 * Valor do ΔAgr na linha: mesma base que B, V e a barra (disp).
 * O campo deltaPct do EA pode desincronizar e piscar (+100) mesmo com V corrigido na UI.
 */
function deltaAgrPctForDisplay(disp, delta) {
  const bv = Number(disp.buyVol);
  const sv = Number(disp.sellVol);
  if (Number.isFinite(bv) && Number.isFinite(sv) && bv + sv > 1e-12) {
    return Math.round(((bv - sv) / (bv + sv)) * 100);
  }
  const bp = Number(disp.buyPct);
  const sp = Number(disp.sellPct);
  if (Number.isFinite(bp) && Number.isFinite(sp)) {
    return Math.round(bp - sp);
  }
  const n = Number(delta && delta.deltaPct);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function deltaDisplayPcts(delta) {
  const d = deltaDisplayForUi(delta);
  return { buyPct: d.buyPct, sellPct: d.sellPct };
}

function renderDeltaBars(buyPct, sellPct) {
  const b = Math.max(0, Math.min(100, Number(buyPct) || 0));
  const s = Math.max(0, Math.min(100, Number(sellPct) || 0));
  const sum = b + s || 1;
  const bw = (100 * b) / sum;
  const sw = (100 * s) / sum;
  const buyOver50 = bw > 50;
  const sellOver50 = sw > 50;
  const buyCls = `delta-bar-buy${buyOver50 ? " delta-bar-over50" : ""}`;
  const sellCls = `delta-bar-sell${sellOver50 ? " delta-bar-over50" : ""}`;
  return `<div class="delta-bars" aria-hidden="true">
    <div class="delta-bars-pulse-wrap">
      <div class="delta-bars-inner">
        <div class="${buyCls}" style="width:${bw}%"></div>
        <div class="${sellCls}" style="width:${sw}%"></div>
      </div>
    </div>
    <div class="delta-pct-row"><span class="pct-buy">${b.toFixed(0)}% compra</span><span class="pct-sell">${s.toFixed(0)}% venda</span></div>
  </div>`;
}

function streakDot(side) {
  if (side === "compra") {
    return '<span class="dot dot-buy" title="Pressão no Δ (rápida) — Compradores no fluxo">●</span>';
  }
  if (side === "venda") {
    return '<span class="dot dot-sell" title="Pressão no Δ (rápida) — Vendedores no fluxo">●</span>';
  }
  return '<span class="dot dot-off" title="Sem pressão rápida ativa no Δ">○</span>';
}

/** Texto ao lado do ●: com pulso — Compradores/Vendedores no fluxo; senão COMPRA/VENDA ou — */
function streakSequenciaDisplayText(streak, streakPulse, streakSideActive) {
  if (streakPulse) {
    if (streak === "compra") return "Compradores no fluxo";
    if (streak === "venda") return "Vendedores no fluxo";
  }
  if (streakSideActive) {
    if (streak === "compra") return "COMPRA";
    if (streak === "venda") return "VENDA";
  }
  return "—";
}

/** “Martelo” no EA: limiar mais alto + mais confirmações — pressão no Δ (forte) */
function hammerConfirmacaoDisplayText(hammerSide) {
  if (hammerSide === "compra") return "Domínio compra";
  if (hammerSide === "venda") return "Domínio venda";
  return "—";
}

/** Linhas do Δ: neon azul (compra) / laranja (venda) */
function deltaRowClassFromSide(side) {
  if (side === "compra") return "delta-row delta-row--buy";
  if (side === "venda") return "delta-row delta-row--sell";
  return "delta-row delta-row--neut";
}

/** 1ª linha: neon forte com pulso; só COMPRA/VENDA (sem pulso) → tom fraco e elegante */
function deltaRowClassStreakRapida(streak, streakPulse, streakSideActive) {
  if (streakPulse) return deltaRowClassFromSide(streak);
  if (streakSideActive && streak === "compra") return "delta-row delta-row--buy-soft";
  if (streakSideActive && streak === "venda") return "delta-row delta-row--sell-soft";
  return deltaRowClassFromSide("neutro");
}

function normalizeSide(value, kind) {
  const s = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!s) return kind === "hammer" ? "" : "neutro";
  if (s === "buy" || s === "compra") return "compra";
  if (s === "sell" || s === "venda") return "venda";
  if (kind === "streak" && (s === "neutro" || s === "neutral" || s === "off")) return "neutro";
  return kind === "hammer" ? "" : "neutro";
}

/**
 * Proxy tamanho de negócio: tier + últimos prints (delta.printsLast ou proxyTape.lastPrints).
 */
function renderDeltaTapeProxyHtml(d, delta, disp) {
  const pt = d && d.proxyTape && typeof d.proxyTape === "object" ? d.proxyTape : null;
  const tierRaw = pt && pt.tier != null ? pt.tier : delta && delta.tapeTier != null ? delta.tapeTier : delta && delta.printMix;
  let tierLabel = "—";
  let tierCls = "tape-tier--unk";
  if (tierRaw != null && tierRaw !== "") {
    const t = String(tierRaw).toLowerCase();
    if (
      t.includes("miud") ||
      t.includes("miúd") ||
      t === "1" ||
      t === "fine"
    ) {
      tierLabel = "Miúdo";
      tierCls = "tape-tier--fine";
    } else if (
      t.includes("pesad") ||
      t.includes("grande") ||
      t === "3" ||
      t === "heavy"
    ) {
      tierLabel = "Pesado";
      tierCls = "tape-tier--heavy";
    } else {
      tierLabel = "Misto";
      tierCls = "tape-tier--mid";
    }
  }
  const prints = Array.isArray(delta && delta.printsLast)
    ? delta.printsLast
    : pt && Array.isArray(pt.lastPrints)
      ? pt.lastPrints
      : null;
  let maxV = 1;
  if (prints && prints.length) {
    prints.forEach((p) => {
      const v = Number((p && (p.vol ?? p.v ?? p.volume)) ?? NaN);
      if (Number.isFinite(v) && v > maxV) maxV = v;
    });
  }
  const slots = [0, 1, 2, 3, 4]
    .map((i) => {
      const p = prints && prints[i] ? prints[i] : null;
      if (!p)
        return `<div class="tape-slot tape-slot--empty" title="Sem print (export opcional)">—</div>`;
      const rawSide = p.side ?? p.lado ?? "";
      const side = String(rawSide).toLowerCase();
      const isBuy = side.includes("compra") || side.includes("buy") || side === "c" || side === "b";
      const isSell = side.includes("venda") || side.includes("sell") || side === "v" || side === "s";
      const v = Number(p.vol ?? p.v ?? p.volume) || 0;
      const h = maxV > 0 ? Math.max(6, Math.round((v / maxV) * 28)) : 6;
      const cls = isBuy ? "tape-slot--buy" : isSell ? "tape-slot--sell" : "tape-slot--neut";
      const tip = `${escapeHtml(String(rawSide || "?"))} · vol ${v}`;
      return `<div class="tape-slot ${cls}" title="${tip}"><span class="tape-slot__bar" style="height:${h}px"></span><span class="tape-slot__v">${escapeHtml(
        String(v)
      )}</span></div>`;
    })
    .join("");
  const alertSec = Number(
    pt && pt.largePrintAlertSec != null
      ? pt.largePrintAlertSec
      : pt && pt.largePrintSegundos != null
        ? pt.largePrintSegundos
        : delta && delta.largePrintSec != null
          ? delta.largePrintSec
          : NaN
  );
  const pill =
    Number.isFinite(alertSec) && alertSec > 0 && alertSec < 600
      ? `<div class="tape-pill" title="Último print grande (EA)">PRINT FORTE · há ${Math.round(alertSec)}s</div>`
      : "";
  const hasTier = tierRaw != null && String(tierRaw).trim() !== "";
  const hasPrints = !!(prints && prints.length);
  const hasAlert = !!pill;
  if (!hasTier && !hasPrints && !hasAlert) return "";
  return `<div class="tape-proxy">
    <div class="tape-proxy__head">
      <span class="tape-proxy__tit">Proxy tamanho (tape)</span>
      <span class="tape-tier ${tierCls}">${escapeHtml(tierLabel)}</span>
    </div>
    <div class="tape-proxy__prints">${slots}</div>
    ${pill}
    <p class="tape-proxy__hint">Opcional: <code>delta.printsLast[]</code> ou <code>proxyTape</code>. Não identifica institucional vs varejo.</p>
  </div>`;
}
