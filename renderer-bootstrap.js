/**
 * Arranque do painel: leitura do JSON (IPC), erros à volta de `render()`, resize SR,
 * botão «Escolher dashboard.json», primeiro tick, intervalo e watcher do ficheiro.
 * Depende de `render` (renderer.js), `setDataBanner` (renderer-dom-shell.js), motion SR.
 */
(function () {
  "use strict";
  if (typeof window === "undefined") {
    throw new Error("Painel SENSE: ambiente sem window.");
  }
  if (typeof render !== "function") {
    throw new Error("Painel SENSE: falta renderer.js antes de renderer-bootstrap.js (ver index.html).");
  }
  if (typeof setDataBanner !== "function") {
    throw new Error("Painel SENSE: falta renderer-dom-shell.js antes de renderer-bootstrap.js (ver index.html).");
  }
  if (typeof scheduleSrDetectLeadStrongLayout !== "function") {
    throw new Error("Painel SENSE: falta renderer-sr-motion.js antes de renderer-bootstrap.js (ver index.html).");
  }
})();

async function tick() {
  if (!window.senseAPI) {
    const st = document.getElementById("statusLine");
    if (st) {
      st.textContent = "Erro: API do Electron não carregou. Abra o app com npm start.";
    }
    setDataBanner(true, "API do Electron não carregou. Abra o painel com npm start na pasta painel-sense-desktop.");
    return;
  }
  let result;
  try {
    result = await window.senseAPI.readDashboard();
  } catch (e) {
    result = {
      ok: false,
      path: "",
      error: e && e.message ? e.message : String(e),
      data: null,
    };
  }
  try {
    render(result);
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    console.error("Painel SENSE render:", e);
    const st = document.getElementById("statusLine");
    if (st) {
      st.textContent = "Erro ao desenhar o painel: " + msg;
      st.className = "status error";
    }
    setDataBanner(true, "Erro ao desenhar: " + msg);
  }
  try {
    scheduleSrDetectLeadStrongLayout();
  } catch (e) {
    console.warn("scheduleSrDetectLeadStrongLayout:", e);
  }
}

window.addEventListener("resize", () => {
  try {
    scheduleSrDetectLeadStrongLayout();
  } catch (e) {
    console.warn("scheduleSrDetectLeadStrongLayout (resize):", e);
  }
});

const pickJsonBtn = document.getElementById("pickJsonBtn");
if (pickJsonBtn && window.senseAPI && typeof window.senseAPI.pickDashboardFile === "function") {
  pickJsonBtn.addEventListener("click", async () => {
    pickJsonBtn.disabled = true;
    try {
      const r = await window.senseAPI.pickDashboardFile();
      if (r && r.ok) await tick();
    } finally {
      pickJsonBtn.disabled = false;
    }
  });
}

tick();
setInterval(tick, 100);
if (window.senseAPI && typeof window.senseAPI.onDashboardFileChanged === "function") {
  window.senseAPI.onDashboardFileChanged(() => {
    tick();
  });
}
