/**
 * SENSE IA — overlay no HUD, cartão “Análise SENSE”, diálogo e leitura automática.
 * Depende de renderer-utils.js, renderer-state.js. Carregar antes de renderer.js
 * (usa trendBiasLabel / ativoLateralFromDash; `tick` vem de renderer-bootstrap.js após renderer.js).
 */
if (typeof window === "undefined") {
  throw new Error("Painel SENSE: ambiente sem window.");
}
if (!window.SenseRendererState || typeof window.SenseRendererState !== "object") {
  throw new Error("Painel SENSE: falta renderer-state.js antes de renderer-sense-ia.js (ver index.html).");
}
if (typeof escapeHtml !== "function") {
  throw new Error("Painel SENSE: falta renderer-utils.js antes de renderer-sense-ia.js (ver index.html).");
}

const __SRS = window.SenseRendererState;

function clearSenseIaHudOverlayTimers() {
  try {
    if (__SRS.senseIaHudOverlayTimer) clearTimeout(__SRS.senseIaHudOverlayTimer);
  } catch (e) {}
  try {
    if (__SRS.senseIaHudOverlaySummaryTimer) clearTimeout(__SRS.senseIaHudOverlaySummaryTimer);
  } catch (e) {}
  __SRS.senseIaHudOverlayTimer = null;
  __SRS.senseIaHudOverlaySummaryTimer = null;
}

/**
 * Mostra o resultado da leitura automática no HUD: texto principal `durMsMain` (p.ex. 90s),
 * depois cartão "Análise SENSE" durante `durMsCoda` (p.ex. 10s) e volta à logo.
 * @param {{ ok?: boolean, answer?: string, error?: string, hint?: string, model?: string, provider?: string, readAt?: string }} r
 */
function applySenseIaHudOverlayFromResult(r, durMsMain, durMsCoda) {
  clearSenseIaHudOverlayTimers();
  const mainMs = typeof durMsMain === "number" && durMsMain > 0 ? durMsMain : 90000;
  const codaMs = typeof durMsCoda === "number" && durMsCoda > 0 ? durMsCoda : 10000;
  __SRS.senseIaHudOverlayCodaHtml = null;
  __SRS.senseIaHudOverlayPhase = "full";
  if (r && r.ok) {
    __SRS.senseIaHudOverlayMessage = r.answer || "—";
    __SRS.senseIaHudOverlayMeta = [r.model, r.provider, r.readAt].filter(Boolean).join(" · ");
  } else {
    __SRS.senseIaHudOverlayMessage = (r && r.error) || "Pedido falhou.";
    if (r && r.hint) __SRS.senseIaHudOverlayMessage += "\n\n" + r.hint;
    __SRS.senseIaHudOverlayMeta = null;
  }
  __SRS.senseIaHudOverlayTimer = setTimeout(() => {
    __SRS.senseIaHudOverlayTimer = null;
    __SRS.senseIaHudOverlayMessage = null;
    __SRS.senseIaHudOverlayMeta = null;
    const d = __SRS.lastGoodResult && __SRS.lastGoodResult.data ? __SRS.lastGoodResult.data : null;
    __SRS.senseIaHudOverlayCodaHtml = buildSenseIaHudCodaHtml(d);
    __SRS.senseIaHudOverlayPhase = "summary";
    __SRS.senseIaHudOverlayAnimShownFor = null;
    tick();
    __SRS.senseIaHudOverlaySummaryTimer = setTimeout(() => {
      __SRS.senseIaHudOverlaySummaryTimer = null;
      __SRS.senseIaHudOverlayPhase = null;
      __SRS.senseIaHudOverlayCodaHtml = null;
      __SRS.senseIaHudOverlayAnimShownFor = null;
      tick();
    }, codaMs);
  }, mainMs);
  tick();
}

function senseIaNextAutoLabel() {
  if (!(__SRS.senseIaAutoEveryMs > 0) || !(__SRS.senseIaNextAutoAtMs > 0)) return "";
  const remMs = Math.max(0, __SRS.senseIaNextAutoAtMs - Date.now());
  const remSec = Math.ceil(remMs / 1000);
  const mm = Math.floor(remSec / 60);
  const ss = remSec % 60;
  if (mm >= 1) return `auto em ${mm}m`;
  return `auto em 0:${String(ss).padStart(2, "0")}`;
}

/** Rótulo Viés/TEND. → texto curto da fase final (HUD). */
function senseIaHudCodaTrendLineFromBiasLabel(label) {
  const u = String(label || "").trim();
  if (u === "TEND. DE ALTA FORTE") return "TENDÊNCIA DE ALTA FORTE";
  if (u === "TEND. DE ALTA") return "TENDÊNCIA DE ALTA";
  if (u === "TEND. DE BAIXA FORTE") return "TENDÊNCIA DE BAIXA FORTE";
  if (u === "TEND. DE BAIXA") return "TENDÊNCIA DE BAIXA";
  if (u === "ATIVO LATERAL") return "ATIVO LATERAL";
  if (u === "NEUTRO") return "NEUTRO";
  return u || "—";
}

/**
 * Fase final (~10s após o texto principal): "Análise SENSE ⇒" + caixa amarela (lateral/direção) + tendência em neon.
 * @param {object|null|undefined} d
 */
function buildSenseIaHudCodaHtml(d) {
  const flow = d && d.flow && typeof d.flow === "object" ? d.flow : null;
  const trendDir = flow ? Number(flow.trendDir) : NaN;
  const ntslZ = flow ? Number(flow.ntslZ) : NaN;
  const lateralPct = Number(d && d.ativoLateralLimitePct);
  const weakPct = flow ? Number(flow.trendWeakPct) : NaN;
  const strongPct = flow ? Number(flow.trendStrongPct) : NaN;
  const biasLabel = trendBiasLabel(trendDir, ntslZ, lateralPct, weakPct, strongPct);
  const lateral = d ? ativoLateralFromDash(d) : false;
  const trendLine = senseIaHudCodaTrendLineFromBiasLabel(biasLabel);
  const boxText = lateral ? "ATIVO LATERAL" : "ATIVO COM DIREÇÃO CLARA";

  let trendCls = "hud-makers-preparo__ia-coda-trend";
  if (biasLabel === "TEND. DE BAIXA FORTE" || biasLabel === "TEND. DE BAIXA") {
    trendCls += " hud-makers-preparo__ia-coda-trend--sell";
  } else if (biasLabel === "TEND. DE ALTA FORTE" || biasLabel === "TEND. DE ALTA") {
    trendCls += " hud-makers-preparo__ia-coda-trend--buy";
  } else {
    trendCls += " hud-makers-preparo__ia-coda-trend--lat";
  }

  return (
    `<div class="hud-makers-preparo__ia-coda">` +
    `<div class="hud-makers-preparo__ia-coda-title">Análise SENSE ⇒</div>` +
    `<div class="hud-makers-preparo__ia-coda-yellow">${escapeHtml(boxText)}</div>` +
    `<div class="${trendCls}">${escapeHtml(trendLine)}</div>` +
    `</div>`
  );
}

/**
 * Após redesenhar o HUD: mantém a logo no DOM e cruza com o texto da leitura automática (transição CSS).
 */
function syncSenseIaHudOverlayLayers() {
  const hudBox = document.getElementById("hudBox");
  if (!hudBox) return;
  const dual = hudBox.querySelector(".hud-makers-preparo__logo--dual");
  if (!dual) return;
  const textLayer = dual.querySelector(".hud-makers-preparo__dual-layer--text");
  if (!textLayer) return;
  const showFull =
    __SRS.senseIaHudOverlayPhase === "full" &&
    typeof __SRS.senseIaHudOverlayMessage === "string" &&
    __SRS.senseIaHudOverlayMessage.length > 0;
  const showSummary = __SRS.senseIaHudOverlayPhase === "summary" && typeof __SRS.senseIaHudOverlayCodaHtml === "string";
  const show = showFull || showSummary;

  if (show) {
    if (showFull) {
      const meta =
        __SRS.senseIaHudOverlayMeta && String(__SRS.senseIaHudOverlayMeta).trim()
          ? `<p class="hud-makers-preparo__ia-msg-meta">${escapeHtml(String(__SRS.senseIaHudOverlayMeta).trim())}</p>`
          : "";
      textLayer.innerHTML = `${meta}<div class="hud-makers-preparo__ia-msg">${escapeHtml(__SRS.senseIaHudOverlayMessage)}</div>`;
      textLayer.classList.remove("hud-makers-preparo__dual-layer--coda");
      dual.classList.remove("hud-makers-preparo__logo--ia-coda");
    } else {
      textLayer.innerHTML = __SRS.senseIaHudOverlayCodaHtml || "";
      textLayer.classList.add("hud-makers-preparo__dual-layer--coda");
      dual.classList.add("hud-makers-preparo__logo--ia-coda");
    }
    textLayer.setAttribute("aria-hidden", "false");
    const key = showFull
      ? __SRS.senseIaHudOverlayMessage + "|" + (__SRS.senseIaHudOverlayMeta || "")
      : "coda|" + (__SRS.senseIaHudOverlayCodaHtml || "");
    if (__SRS.senseIaHudOverlayAnimShownFor === key) {
      dual.classList.add("hud-makers-preparo--no-anim");
      dual.classList.add("hud-makers-preparo__logo--ia-visible");
    } else {
      __SRS.senseIaHudOverlayAnimShownFor = key;
      dual.classList.remove("hud-makers-preparo--no-anim");
      dual.classList.remove("hud-makers-preparo__logo--ia-visible");
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          dual.classList.add("hud-makers-preparo__logo--ia-visible");
        });
      });
    }
  } else {
    __SRS.senseIaHudOverlayAnimShownFor = null;
    textLayer.setAttribute("aria-hidden", "true");
    dual.classList.remove("hud-makers-preparo__logo--ia-coda");
    textLayer.classList.remove("hud-makers-preparo__dual-layer--coda");
    if (dual.classList.contains("hud-makers-preparo__logo--ia-visible")) {
      dual.classList.remove("hud-makers-preparo--no-anim");
      dual.classList.remove("hud-makers-preparo__logo--ia-visible");
      setTimeout(() => {
        if (!__SRS.senseIaHudOverlayPhase && !__SRS.senseIaHudOverlayMessage) textLayer.innerHTML = "";
      }, 480);
    } else {
      textLayer.innerHTML = "";
    }
  }
}

const senseIaDialog = document.getElementById("senseIaDialog");
const senseIaBody = document.getElementById("senseIaBody");
const senseIaMeta = document.getElementById("senseIaMeta");
const senseIaDialogClose = document.getElementById("senseIaDialogClose");
const hudBoxEl = document.getElementById("hudBox");

function normalizeTextFold(v) {
  return String(v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function parseSenseIaBiasLabel(answer) {
  const firstLine = String(answer || "").split(/\r?\n/, 1)[0] || "";
  const folded = normalizeTextFold(firstLine);
  if (!folded.includes("vies")) return "Lateral";
  if (folded.includes("alta")) return "Alta";
  if (folded.includes("baixa")) return "Baixa";
  return "Lateral";
}

function senseIaBiasToneClass(label) {
  if (label === "Alta") return "sense-ia-dialog__bias--alta";
  if (label === "Baixa") return "sense-ia-dialog__bias--baixa";
  return "sense-ia-dialog__bias--lateral";
}

function senseIaBiasTrackClass(label) {
  if (label === "Alta") return "sense-ia-card__confidence-track--alta";
  if (label === "Baixa") return "sense-ia-card__confidence-track--baixa";
  return "sense-ia-card__confidence-track--lateral";
}

function parseSenseIaConfidence(answer) {
  const m = String(answer || "").match(/(\d{1,3})\s*%/);
  if (!m) return null;
  const pct = Number(m[1]);
  if (!Number.isFinite(pct)) return null;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

function splitSenseIaContent(answer) {
  const lines = String(answer || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const content = lines.filter((l, i) => !(i === 0 && normalizeTextFold(l).startsWith("vies:")));
  const bullets = [];
  const paragraphs = [];
  for (const line of content) {
    if (/^[-*•]\s+/.test(line)) bullets.push(line.replace(/^[-*•]\s+/, "").trim());
    else paragraphs.push(line);
  }
  return { bullets, paragraphs };
}

function classifySenseIaBullets(items) {
  const key = [];
  const risks = [];
  const invalid = [];
  for (const item of items) {
    const f = normalizeTextFold(item);
    if (/(acima|abaixo|rompe|romper|perde|perder|invalida|invalidacao|invalidação|stop)/.test(f)) {
      invalid.push(item);
      continue;
    }
    if (/(risco|diverg|incert|cuidado|atencao|atenção|volatil|falso)/.test(f)) {
      risks.push(item);
      continue;
    }
    key.push(item);
  }
  return { key, risks, invalid };
}

function formatSenseIaRichHtml(answer) {
  const raw = String(answer || "").trim();
  if (!raw) {
    return `<div class="sense-ia-dialog__empty">Sem resposta da IA.</div>`;
  }
  const bias = parseSenseIaBiasLabel(raw);
  const conf = parseSenseIaConfidence(raw);
  const { bullets, paragraphs } = splitSenseIaContent(raw);
  const cls = classifySenseIaBullets(bullets);
  const keyItems = (cls.key.length ? cls.key : bullets).slice(0, 4);
  const riskItems = cls.risks.slice(0, 3);
  const invalidItems = cls.invalid.slice(0, 3);
  const summary = paragraphs.slice(0, 2).join(" ").trim();

  const listHtml = (arr) =>
    arr.length
      ? `<ul class="sense-ia-dialog__list">${arr.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>`
      : `<div class="sense-ia-dialog__none">—</div>`;

  return `
    <article class="sense-ia-card">
      <div class="sense-ia-card__confidence ${senseIaBiasTrackClass(bias)}" role="img" aria-label="Confiança ${conf === null ? "indisponível" : `${conf}%`}">
        <div class="sense-ia-card__confidence-fill" style="width:${conf === null ? 0 : conf}%;"></div>
      </div>
      <header class="sense-ia-card__head">
        <span class="sense-ia-dialog__bias ${senseIaBiasToneClass(bias)}">Viés ${escapeHtml(bias)}</span>
        <span class="sense-ia-dialog__conf">${conf === null ? "Confiança n/d" : `Confiança ${conf}%`}</span>
      </header>
      <section class="sense-ia-card__sec">
        <h4 class="sense-ia-card__ttl">Leitura</h4>
        <p class="sense-ia-card__txt">${escapeHtml(summary || raw)}</p>
      </section>
      <section class="sense-ia-card__sec">
        <h4 class="sense-ia-card__ttl">Sinais-chave</h4>
        ${listHtml(keyItems)}
      </section>
      <section class="sense-ia-card__sec">
        <h4 class="sense-ia-card__ttl">Riscos</h4>
        ${
          riskItems.length
            ? listHtml(riskItems)
            : `<div class="sense-ia-dialog__none">Sem risco explícito no texto atual.</div>`
        }
      </section>
      <section class="sense-ia-card__sec">
        <h4 class="sense-ia-card__ttl">Invalidação</h4>
        ${
          invalidItems.length
            ? listHtml(invalidItems)
            : `<div class="sense-ia-dialog__none">Sem gatilho de invalidação explícito.</div>`
        }
      </section>
    </article>
  `;
}

if (
  senseIaDialog &&
  window.senseAPI &&
  typeof window.senseAPI.senseIaAsk === "function"
) {
  document.documentElement.classList.add("sense-ia-enabled");

  let senseIaApiLock = false;
  let senseIaFloatingTimer = null;
  const SENSE_IA_FLOATING_MS = 60_000;

  function senseIaErrorSuggestsOllama(r) {
    const p = String((r && r.provider) || "").toLowerCase();
    if (p === "ollama") return true;
    const m = `${String((r && r.error) || "")} ${String((r && r.hint) || "")}`.toLowerCase();
    return (
      m.includes("ollama") ||
      m.includes("11434") ||
      m.includes("econnrefused") ||
      m.includes("ligação recusada") ||
      m.includes("conexao recusada") ||
      m.includes("connection refused")
    );
  }

  function buildSenseIaOllamaSetupAsideHtml() {
    return (
      `<aside class="sense-ia-dialog__setup-aside" role="note">` +
      `<h4>Ollama não respondeu — check-list rápido</h4>` +
      `<ol>` +
      `<li>Instalar Ollama para Windows em <a class="sense-ia-dialog__link" href="https://ollama.com/download" target="_blank" rel="noopener noreferrer">ollama.com/download</a>.</li>` +
      `<li>Abrir a aplicação Ollama (ícone na barra de tarefas) e esperar o servidor arrancar.</li>` +
      `<li>Num terminal: <code>ollama pull llama3.2</code> (ou o modelo definido em <code>config.json</code> → <code>senseIa.model</code>).</li>` +
      `<li>Confirmar <code>senseIa.ollamaHost</code> (por defeito <code>http://127.0.0.1:11434</code>).</li>` +
      `</ol></aside>`
    );
  }

  function buildSenseIaErrorBodyHtml(r) {
    const err = escapeHtml((r && r.error) || "Pedido SENSE IA falhou.");
    const hintRaw = r && r.hint ? String(r.hint) : "";
    const hint = hintRaw ? `<p class="sense-ia-dialog__err-pre">${escapeHtml(hintRaw)}</p>` : "";
    const aside = senseIaErrorSuggestsOllama(r) ? buildSenseIaOllamaSetupAsideHtml() : "";
    return `<div class="sense-ia-dialog__err-wrap"><p class="sense-ia-dialog__err-pre">${err}</p>${hint}${aside}</div>`;
  }

  function clearSenseIaFloatingTimer() {
    if (senseIaFloatingTimer) {
      clearTimeout(senseIaFloatingTimer);
      senseIaFloatingTimer = null;
    }
  }

  function isSenseIaDialogOpen() {
    if (!senseIaDialog) return false;
    return !senseIaDialog.hasAttribute("hidden");
  }

  function openSenseIaDialog() {
    if (!senseIaDialog) return;
    senseIaDialog.removeAttribute("hidden");
  }

  function closeSenseIaDialog() {
    if (!senseIaDialog) return;
    senseIaDialog.setAttribute("hidden", "");
  }

  function showSenseIaFloatingResult(r) {
    if (!senseIaDialog || !senseIaBody) return;
    clearSenseIaFloatingTimer();
    if (isSenseIaDialogOpen()) closeSenseIaDialog();
    senseIaDialog.classList.add("sense-ia-dialog--floating");
    openSenseIaDialog();
    if (r && r.ok) {
      senseIaBody.classList.add("sense-ia-dialog__body--rich");
      senseIaBody.innerHTML = formatSenseIaRichHtml(r.answer || "—");
      if (senseIaMeta) {
        const bits = [r.model, r.provider, r.readAt].filter(Boolean);
        senseIaMeta.textContent = bits.join(" · ");
      }
    } else {
      senseIaBody.classList.remove("sense-ia-dialog__body--rich");
      senseIaBody.innerHTML = buildSenseIaErrorBodyHtml(r || {});
      if (senseIaMeta) senseIaMeta.textContent = "";
    }
    senseIaFloatingTimer = setTimeout(() => {
      senseIaFloatingTimer = null;
      if (isSenseIaDialogOpen() && senseIaDialog.classList.contains("sense-ia-dialog--floating")) closeSenseIaDialog();
    }, SENSE_IA_FLOATING_MS);
  }

  async function runSenseIaDialog() {
    clearSenseIaFloatingTimer();
    senseIaDialog.classList.add("sense-ia-dialog--floating");
    /* Clique manual no HUD não fica bloqueado por leitura automática em curso (evita “logo morta”). */
    if (senseIaApiLock) senseIaApiLock = false;
    senseIaApiLock = true;
    try {
      if (isSenseIaDialogOpen()) closeSenseIaDialog();
      openSenseIaDialog();
      if (senseIaBody) {
        senseIaBody.classList.remove("sense-ia-dialog__body--rich");
        senseIaBody.textContent =
          "A consultar o modelo…\n\n(Ollama: a primeira resposta ou um contexto grande pode demorar vários minutos no CPU.)";
      }
      if (senseIaMeta) senseIaMeta.textContent = "";
      /* Deixa o modal pintar antes do IPC (tick a 100 ms pode refazer o HUD e “comer” o click). */
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const r = await window.senseAPI.senseIaAsk();
      if (r && r.ok && senseIaBody) {
        senseIaBody.classList.add("sense-ia-dialog__body--rich");
        senseIaBody.innerHTML = formatSenseIaRichHtml(r.answer || "—");
        if (senseIaMeta) {
          const bits = [r.model, r.provider, r.readAt].filter(Boolean);
          senseIaMeta.textContent = bits.join(" · ");
        }
      } else if (senseIaBody) {
        senseIaBody.classList.remove("sense-ia-dialog__body--rich");
        senseIaBody.innerHTML = buildSenseIaErrorBodyHtml(r || {});
        if (senseIaMeta) senseIaMeta.textContent = "";
      }
    } catch (e) {
      if (senseIaBody) {
        senseIaBody.classList.remove("sense-ia-dialog__body--rich");
        const msg = e && e.message ? e.message : String(e);
        senseIaBody.innerHTML = buildSenseIaErrorBodyHtml({ ok: false, error: msg });
      }
      if (senseIaMeta) senseIaMeta.textContent = "";
    } finally {
      senseIaApiLock = false;
    }
  }

  async function runSenseIaAutoTick() {
    if (senseIaApiLock) return;
    if (senseIaDialog && isSenseIaDialogOpen()) return;
    senseIaApiLock = true;
    try {
      const r = await window.senseAPI.senseIaAsk();
      showSenseIaFloatingResult(r);
    } catch (e) {
      showSenseIaFloatingResult({ ok: false, error: e && e.message ? e.message : String(e) });
    } finally {
      if (__SRS.senseIaAutoEveryMs > 0) __SRS.senseIaNextAutoAtMs = Date.now() + __SRS.senseIaAutoEveryMs;
      senseIaApiLock = false;
    }
  }

  /** Logo central: `pointerdown` em captura — o tick refaz o HTML do HUD e o evento `click` perde-se com facilidade. */
  let senseIaHudPointerLastMs = 0;
  if (hudBoxEl) {
    hudBoxEl.addEventListener(
      "pointerdown",
      (e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        const t = e.target;
        const hit =
          (t && t.closest && t.closest("[data-sense-ia-trigger='1']")) ||
          (t && t.closest && t.closest(".gatilho-idle-logo--sense-ia")) ||
          (t && t.closest && t.closest(".hud-makers-preparo__logo--dual"));
        if (!hit) return;
        const now = Date.now();
        if (now - senseIaHudPointerLastMs < 400) return;
        senseIaHudPointerLastMs = now;
        e.preventDefault();
        void runSenseIaDialog();
      },
      { capture: true },
    );
  }

  if (senseIaDialogClose) {
    senseIaDialogClose.addEventListener("click", () => {
      clearSenseIaFloatingTimer();
      closeSenseIaDialog();
    });
  }
  senseIaDialog.addEventListener("click", (e) => {
    if (e.target === senseIaDialog) {
      clearSenseIaFloatingTimer();
      closeSenseIaDialog();
    }
  });

  if (typeof window.senseAPI.getSenseIaSchedule === "function") {
    window.senseAPI
      .getSenseIaSchedule()
      .then(function (sch) {
        const min = sch && Number(sch.autoEveryMinutes);
        if (!Number.isFinite(min) || min <= 0) return;
        const ms = min * 60 * 1000;
        __SRS.senseIaAutoEveryMs = ms;
        __SRS.senseIaNextAutoAtMs = Date.now() + 3000;
        setTimeout(runSenseIaAutoTick, 3000);
        setInterval(runSenseIaAutoTick, ms);
      })
      .catch(function () {});
  }
}
