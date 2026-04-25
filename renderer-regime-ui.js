/**
 * UI do bloco "Contexto de mercado" (regimeMercado): rastreador, rótulo/código, fingerprint, flash estável.
 * Depende de renderer-utils (fmtNum, escapeHtml, repairMojibakeUtf8), renderer-flow-levels (stripAccentsForDisplay),
 * renderer-regime-context.js (renderRegimeMercadoSideConfHtml). Estado: lastRegimeMercadoFingerprint em window.SenseRendererState.
 * Carregar depois de renderer-regime-context.js e antes de renderer-dashboard-paths.js.
 */
(function () {
  "use strict";
  if (typeof window === "undefined") {
    throw new Error("Painel SENSE: ambiente sem window.");
  }
  if (typeof escapeHtml !== "function" || typeof fmtNum !== "function" || typeof repairMojibakeUtf8 !== "function") {
    throw new Error("Painel SENSE: falta renderer-utils.js antes de renderer-regime-ui.js (ver index.html).");
  }
  if (typeof stripAccentsForDisplay !== "function") {
    throw new Error("Painel SENSE: falta renderer-flow-levels.js antes de renderer-regime-ui.js (ver index.html).");
  }
  if (typeof renderRegimeMercadoSideConfHtml !== "function") {
    throw new Error("Painel SENSE: falta renderer-regime-context.js antes de renderer-regime-ui.js (ver index.html).");
  }
  if (!window.SenseRendererState || typeof window.SenseRendererState !== "object") {
    throw new Error("Painel SENSE: falta renderer-state.js antes de renderer-regime-ui.js (ver index.html).");
  }
})();

/** Rastreador + indicador de regime (`regimeMercado` no JSON, EA schema ≥7). */
function renderRegimeRastreadorHtml(tr) {
  if (!tr || typeof tr !== "object") return "";
  const win = Number(tr.janelaSegundos);
  const nSpread = Number(tr.amostrasSpread);
  const nTot = Number(tr.amostrasTotal);
  const bz = Number(tr.basisZ);
  const bzOk = tr.basisZConfiavel === true;
  const med = Number(tr.spreadMediaJanela);
  const sd = Number(tr.spreadDesvioJanela);
  const drift = Number(tr.spreadDrift);
  const lag = Number(tr.spreadDriftLagSeg);
  const duas = tr.temDuasPernas === true;
  const zm = Number(tr.zMiniMediaJanela);
  const zr = Number(tr.zRefMediaJanela);
  const winMin = Number.isFinite(win) ? Math.round(win / 60) : null;
  const line1 = [
    winMin != null ? `Janela ${winMin} min` : "",
    Number.isFinite(nSpread) ? `${nSpread} leituras (spread)` : "",
    Number.isFinite(nTot) ? `${nTot} leituras no total` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const line2 = duas
    ? [
        Number.isFinite(med) ? `Média do spread ${fmtNum(med, 5)}` : "",
        Number.isFinite(sd) ? `Desvio ${fmtNum(sd, 5)}` : "",
        bzOk && Number.isFinite(bz)
          ? `Desvio do spread vs. histórico da janela (Z) ${bz >= 0 ? "+" : ""}${fmtNum(bz, 2)}`
          : "",
        Number.isFinite(drift)
          ? `Tendência do spread ${drift >= 0 ? "+" : ""}${fmtNum(drift, 5)} (atraso ${Number.isFinite(lag) ? `${lag} s` : "—"})`
          : "",
      ]
        .filter(Boolean)
        .join(" · ")
    : "Só um contrato no recorte — o EA precisa de Mini e Cheio ao mesmo tempo para comparar spread.";
  const line3 =
    Number.isFinite(zm) || Number.isFinite(zr)
      ? `Média do fluxo no mini ${Number.isFinite(zm) ? fmtNum(zm, 2) : "—"} · média do fluxo no cheio ${Number.isFinite(zr) ? fmtNum(zr, 2) : "—"}`
      : "";
  const fullHint = [
    Number.isFinite(win) ? `Duração da janela: ${winMin} min (${win} s).` : "",
    Number.isFinite(nSpread) ? `Amostras usadas no spread: ${nSpread}.` : "",
    Number.isFinite(nTot) ? `Amostras totais no período: ${nTot}.` : "",
    duas ? line2 : "Uma perna só: sem par Mini + Cheio, várias métricas de spread ficam indisponíveis.",
    line3 ? "Médias na janela do indicador de fluxo (mini e contrato cheio), no mesmo sentido das linhas acima." : "",
    bzOk && Number.isFinite(bz) ? `Confiança do “spread vs. janela”: Z = ${fmtNum(bz, 2)}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const oneLine = [line1, line2, line3].filter(Boolean).join(" · ");
  return `<div class="regime-rastreador regime-rastreador--one" title="${escapeHtml(fullHint)}"><span class="regime-rastreador__one">${escapeHtml(
    oneLine
  )}</span></div>`;
}

/** Assinatura estável do bloco regime — mudou ⇒ UI pode destacar. */
function regimeMercadoFingerprint(rm) {
  if (!rm || typeof rm !== "object" || rm.ativo === false) return "";
  const tr = rm.rastreador && typeof rm.rastreador === "object" ? rm.rastreador : null;
  const bucketPct = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return "";
    const p = Math.round(Math.min(1, Math.max(0, n)) * 100);
    return Math.round(p / 5) * 5; // bucket de 5% para evitar flash por microvariação
  };
  const bucketNum = (v, step) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return "";
    const s = Number(step) > 0 ? Number(step) : 1;
    return Math.round(n / s) * s;
  };
  return [
    repairMojibakeUtf8(String(rm.codigo ?? "")),
    repairMojibakeUtf8(String(rm.vies ?? "")),
    bucketPct(rm.confianca),
    bucketPct(rm.confiancaCompra),
    bucketPct(rm.confiancaVenda),
    rm.regimeCompraConfiavel === true,
    rm.regimeVendaConfiavel === true,
    repairMojibakeUtf8(String(rm.rotulo ?? "")),
    bucketNum(rm.atrRatioM1, 0.01),
    rm.divergenciaMiniRef === true,
    bucketNum(rm.spreadTaxaMiniRef, 0.001),
    repairMojibakeUtf8(String(rm.notas ?? "")),
    tr ? String(tr.janelaSegundos) : "",
    tr ? bucketNum(tr.basisZ, 0.05) : "",
    tr ? bucketNum(tr.amostrasSpread, 1) : "",
  ].join("\x1e");
}

/** Flash breve quando o conteúdo de regime (EA) deixa de coincidir com o tick anterior. */
function applyRegimeMercadoFlash(flowBoxEl, rm) {
  if (!flowBoxEl) return;
  const el = flowBoxEl.querySelector(".regime-mercado--one");
  const fp = regimeMercadoFingerprint(rm);
  if (!el) {
    window.SenseRendererState.lastRegimeMercadoFingerprint = fp;
    return;
  }
  // Modo estável: sem flash visual para evitar “piscadas” no Contexto de mercado.
  el.classList.remove("regime-mercado--flash");
  window.SenseRendererState.lastRegimeMercadoFingerprint = fp;
  return;
  const prev = window.SenseRendererState.lastRegimeMercadoFingerprint;
  if (prev != null && fp !== "" && fp !== prev) {
    el.classList.remove("regime-mercado--flash");
    void el.offsetWidth;
    el.classList.add("regime-mercado--flash");
    window.setTimeout(() => {
      el.classList.remove("regime-mercado--flash");
    }, 400);
  }
  window.SenseRendererState.lastRegimeMercadoFingerprint = fp;
}

/**
 * Rótulo longo + sufixo EA tipo `TEND_BAIXA` / `TEND_ALTA` — separa para leitura na UI.
 */
function splitRegimeRotuloTendTag(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return { desc: "", tag: "" };
  const m = s.match(/\s(TEND_[A-Z0-9_]+)\s*$/i);
  if (!m || m.index == null) return { desc: s, tag: "" };
  const tag = m[1].toUpperCase();
  let desc = s.slice(0, m.index).trim();
  desc = desc.replace(/[.;:]+\s*$/g, "").trim();
  return { desc, tag };
}

function regimeRotuloTagTone(tag) {
  const u = String(tag || "").toUpperCase();
  if (/LATERAL/.test(u)) return "lateral";
  if (/BAIXA|VENDA|SELL|BEAR/.test(u)) return "baixa";
  if (/ALTA|COMPRA|BUY|BULL/.test(u)) return "alta";
  return "neutro";
}

/**
 * Frase longa do EA → linha compacta no painel (UTF-8/cópias com «tendência» corrompido ainda apanham).
 */
function abbreviateRegimeRotuloForUi(s) {
  const t = String(s ?? "").trim();
  if (!t) return t;
  const hasNtsl = /NTSL/i.test(t);
  const indic = /indic/i.test(t);
  const baixa = /mais\s+alinhados\s+com\s+baixa/i.test(t);
  const alta = /mais\s+alinhados\s+com\s+alta/i.test(t);
  if (hasNtsl && indic && baixa) {
    return "Ind. de TEND. mais alinhados c/ baixa no recorte atual.";
  }
  if (hasNtsl && indic && alta) {
    return "Ind. de TEND. mais alinhados c/ alta no recorte atual.";
  }
  const tl = stripAccentsForDisplay(t).toLowerCase();
  if (/divergenc.*mini.*(ref|cheio)|mini.*(ref|cheio).*divergenc/i.test(tl)) {
    return "Divergência Mini e Cheio; operar com cautela.";
  }
  if (/compress/i.test(tl) && /spread|mercado/i.test(tl)) {
    return "Spread comprimido — pouca folga entre compra e venda.";
  }
  if (/lateral/i.test(tl) && /ntsl/i.test(tl)) {
    return "Mercado lateral no recorte (NTSL).";
  }
  return t;
}

/**
 * EA (`SENSE_RegimeTracker.mqh`) manda `codigo` em snake_case (ex.: tendencia_baixa), não `TEND_BAIXA` no fim do rotulo.
 * Mapeamos para chip na UI; se no futuro o rotulo trouxer sufixo `TEND_*`, prevalece splitRegimeRotuloTendTag.
 */
function regimeCodigoToUiTag(codigoRaw) {
  const c = String(codigoRaw ?? "")
    .trim()
    .toLowerCase();
  if (!c || c === "neutro") return { tag: "", tone: "neutro" };
  if (c === "tendencia_baixa") return { tag: "TEND_BAIXA", tone: "baixa" };
  if (c === "tendencia_alta") return { tag: "TEND_ALTA", tone: "alta" };
  const map = {
    lateral_ntsl: "LATERAL_NTSL",
    divergencia_mini_ref: "DIV_MINI_REF",
    curva_tensa: "CURVA_TENSA",
    basis_em_movimento: "BASIS_MOV",
    compressao: "COMPRESSAO",
    misto: "MISTO",
    neutro: "",
  };
  const tag = map[c] != null ? map[c] : c.replace(/[^a-z0-9_]+/gi, "_").replace(/^_+|_+$/g, "").toUpperCase();
  if (!tag) return { tag: "", tone: "neutro" };
  return { tag, tone: regimeRotuloTagTone(tag) };
}

/** Rótulo curto em português para o chip (o `tag` interno mantém-se para comparações). */
function regimeTagDisplayForUi(tag) {
  const u = String(tag || "").toUpperCase();
  const map = {
    TEND_BAIXA: "Tend. a baixas",
    TEND_ALTA: "Tend. a altas",
    LATERAL_NTSL: "LATERAL",
    DIV_MINI_REF: "Divergência Mini e Cheio",
    CURVA_TENSA: "Curva tensa",
    BASIS_MOV: "Base a mexer",
    COMPRESSAO: "Compressão",
    MISTO: "Misto",
  };
  if (map[u]) return map[u];
  return u.replace(/_/g, " ").toLowerCase();
}

function buildRegimeRotuloUi(rm) {
  const rotuloRaw = String(rm.rotulo ?? "");
  const abbr = (x) => abbreviateRegimeRotuloForUi(x);
  const split = splitRegimeRotuloTendTag(rotuloRaw);
  if (split.tag) {
    return {
      desc: abbr(split.desc),
      tag: split.tag,
      tone: regimeRotuloTagTone(split.tag),
    };
  }
  const fromCodigo = regimeCodigoToUiTag(String(rm.codigo ?? ""));
  if (fromCodigo.tag) {
    return {
      desc: abbr(rotuloRaw.trim()),
      tag: fromCodigo.tag,
      tone: fromCodigo.tone,
    };
  }
  return { desc: abbr(rotuloRaw.trim()), tag: "", tone: "neutro" };
}

/** `tendencia_baixa` no JSON duplica o chip TEND_BAIXA — omitir o &lt;code&gt; nesses casos. */
function regimeCodigoRedundantWithTag(codigoRaw, uiTag) {
  const c = String(codigoRaw ?? "")
    .trim()
    .toLowerCase();
  if (!c) return false;
  return (
    (uiTag === "TEND_BAIXA" && c === "tendencia_baixa") || (uiTag === "TEND_ALTA" && c === "tendencia_alta")
  );
}

/** Regime → confiança / contexto gatilho: renderer-regime-context.js (deriveRegimeSideConf, computeGatilhoContextoFlowFromRegimeMercado, regimeSideConfiavelFromDash, …). */

function renderRegimeMercadoHtml(rm) {
  if (!rm || typeof rm !== "object") return "";
  if (rm.ativo === false) return "";
  const rotuloRaw = String(rm.rotulo ?? "");
  const rotuloParts = buildRegimeRotuloUi(rm);
  const rotuloTone = rotuloParts.tag ? rotuloParts.tone : "neutro";
  const rotuloCodigoTitle = `Código de regime (EA) · ${escapeHtml(String(rm.codigo ?? ""))}`;
  const rotuloInlineHtml = rotuloParts.tag
    ? rotuloParts.desc
      ? `<span class="regime-mercado__rotulo-desc">${escapeHtml(rotuloParts.desc)}</span>`
      : ""
    : `<span class="regime-mercado__rotulo-desc">${escapeHtml(rotuloParts.desc || rotuloRaw)}</span>`;
  const rotuloTagStripHtml = rotuloParts.tag
    ? `<span class="regime-mercado__rotulo-tag regime-mercado__rotulo-tag--strip regime-mercado__rotulo-tag--${rotuloTone}" title="${rotuloCodigoTitle}">${escapeHtml(
        regimeTagDisplayForUi(rotuloParts.tag),
      )}</span>`
    : "";
  const codigoRaw = String(rm.codigo ?? "").trim();
  const codigo = escapeHtml(codigoRaw);
  const hideRegimeCodigo =
    regimeCodigoRedundantWithTag(codigoRaw, rotuloParts.tag) || !codigoRaw;
  const vies = String(rm.vies ?? "neutro").toLowerCase();
  const conf = Number(rm.confianca);
  const confStr = Number.isFinite(conf) ? `${Math.round(Math.min(1, Math.max(0, conf)) * 100)}%` : "—";
  let viesCls = "regime-mercado__vies regime-mercado__vies--neutro";
  if (vies === "compra") viesCls = "regime-mercado__vies regime-mercado__vies--buy";
  else if (vies === "venda") viesCls = "regime-mercado__vies regime-mercado__vies--sell";
  const atr = Number(rm.atrRatioM1);
  const atrStr = Number.isFinite(atr) && atr >= 0 ? atr.toFixed(5) : "—";
  const div = rm.divergenciaMiniRef === true;
  const notas = String(rm.notas ?? "");
  const sp = rm.spreadTaxaMiniRef;
  const hasSp = sp != null && Number.isFinite(Number(sp));
  const spStr = hasSp ? fmtNum(Number(sp), 5) : "";
  const trHtml = rm.rastreador && typeof rm.rastreador === "object" ? renderRegimeRastreadorHtml(rm.rastreador) : "";
  const warnShort = div
    ? '<span class="regime-mercado__warn" title="Divergência Mini e Cheio; confira o chip entre as linhas dos dois símbolos.">Divergência Mini e Cheio</span>'
    : "";
  const viesSlug = vies === "compra" ? "compra" : vies === "venda" ? "venda" : "neutro";
  return `<div class="regime-mercado regime-mercado--one regime-mercado--vies-${viesSlug}" data-regime-codigo="${escapeHtml(
    codigoRaw.replace(/[^a-zA-Z0-9_-]/g, "")
  )}" title="${escapeHtml(notas)}">
    <div class="regime-mercado__strip">
      <span class="regime-mercado__tag" title="Contexto de mercado enviado pelo EA (inclui rastreador de spread na linha de baixo).">CONTEXTO DE MERCADO</span>
      <span class="${viesCls}">${escapeHtml(vies)}</span>
      <span class="regime-mercado__conf" title="Força global do contexto (0–100%). Por baixo: confiança de compra e de venda para o gatilho.">${escapeHtml(
        confStr,
      )}</span>
      <span class="regime-mercado__rotulo-inline">${rotuloInlineHtml}</span>
      ${hideRegimeCodigo ? "" : `<code class="regime-mercado__code">${codigo}</code>`}
      ${warnShort}
      ${rotuloTagStripHtml}
    </div>
    <div class="regime-mercado__tail">
      ${renderRegimeMercadoSideConfHtml(rm)}
      <div class="regime-mercado__tail-meta" title="Rácio de ATR no M1 e diferença de ritmo entre referência e mini (taxas).">
        <span class="regime-mercado__meta">ATR ${escapeHtml(atrStr)}</span>
        ${hasSp ? `<span class="regime-mercado__meta" title="Diferença de taxas: referência menos mini.">Δ taxa ${escapeHtml(spStr)}</span>` : ""}
      </div>
    </div>
    ${trHtml}
  </div>`;
}
