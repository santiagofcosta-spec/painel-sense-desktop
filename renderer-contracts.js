/**
 * Contratos de dependência para módulos renderer-*.
 * Objetivo: reduzir repetição de guards e padronizar mensagens de erro.
 */
(function () {
  "use strict";
  if (typeof window === "undefined") {
    throw new Error("Painel SENSE: ambiente sem window.");
  }

  function ensureFns(moduleName, expectedScript, names) {
    if (!Array.isArray(names) || names.length === 0) return;
    for (const name of names) {
      if (typeof window[name] !== "function") {
        throw new Error(
          `Painel SENSE: falta ${expectedScript} antes de ${moduleName} (ver index.html).`
        );
      }
    }
  }

  function ensureState(moduleName) {
    if (!window.SenseRendererState || typeof window.SenseRendererState !== "object") {
      throw new Error(
        `Painel SENSE: falta renderer-state.js antes de ${moduleName} (ver index.html).`
      );
    }
  }

  window.ensureRendererFns = ensureFns;
  window.ensureRendererState = ensureState;
})();
