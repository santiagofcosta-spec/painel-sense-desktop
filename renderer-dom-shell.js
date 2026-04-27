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
 * @param {"error"|"soft"} [tone]
 */
function setDataBanner(show, err, tone) {
  const el = document.getElementById("dataBanner");
  if (!el) return;
  // Banner em overlay: não ocupa linha da grelha nem desloca o layout.
  el.hidden = false;
  if (show) {
    const soft = String(tone || "").toLowerCase() === "soft";
    el.className = soft ? "data-banner data-banner--show data-banner--soft" : "data-banner data-banner--show";
    const msg = err && String(err).trim() ? String(err).trim() : "Sem dados do JSON.";
    const msgUp = msg.toUpperCase();
    const isPathIssue =
      msgUp.includes("ARQUIVO NÃO ENCONTRADO") ||
      msgUp.includes("SEM DADOS DO JSON") ||
      msgUp.includes("CRIE O JSON") ||
      msgUp.includes("AJUSTE CONFIG.JSON") ||
      msgUp.includes("CAMINHO");
    const pathHint =
      " — Use «Escolher dashboard.json…» e aponte para MQL5\\Files\\dashboard.json (no MT5: Ficheiro → Abrir pasta de dados).";
    el.textContent = isPathIssue ? msg + pathHint : msg;
  } else {
    el.className = "data-banner";
    el.textContent = "";
  }
}
