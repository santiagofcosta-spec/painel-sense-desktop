/**
 * Shell DOM mínimo do painel (banner de dados / erros).
 * Carregar cedo (após renderer-utils.js); antes de renderer.js.
 */
(function () {
  "use strict";
  if (typeof window === "undefined") {
    throw new Error("Painel SENSE: ambiente sem window.");
  }
})();

/**
 * @param {boolean} show
 * @param {unknown} [err]
 */
function setDataBanner(show, err) {
  const el = document.getElementById("dataBanner");
  if (!el) return;
  if (show) {
    el.hidden = false;
    el.className = "data-banner data-banner--show";
    const msg = err && String(err).trim() ? String(err).trim() : "Sem dados do JSON.";
    el.textContent =
      msg +
      " — Use «Escolher dashboard.json…» e aponte para MQL5\\Files\\dashboard.json (no MT5: Ficheiro → Abrir pasta de dados).";
  } else {
    el.hidden = true;
    el.className = "data-banner";
    el.textContent = "";
  }
}
