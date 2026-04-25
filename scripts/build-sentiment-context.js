#!/usr/bin/env node
/**
 * SENSE IA — contexto a partir do painel
 * Lê config.json (dataFile) + dashboard.json como o painel.
 * Imprime JSON compacto para prompts / logs (não envia rede).
 *
 * Uso: node scripts/build-sentiment-context.js   ou   npm run sentiment:context
 * Saída: uma linha JSON em stdout.
 */
"use strict";

const { loadCompactContext } = require("./lib/sense-ia-context.js");

function main() {
  const loaded = loadCompactContext();
  if (loaded.error) {
    console.log(
      JSON.stringify({
        error: loaded.error,
        path: loaded.dataPath,
        hint: loaded.hint,
      }),
    );
    process.exit(loaded.hint ? 2 : 4);
  }
  console.log(JSON.stringify(loaded.compact));
}

main();
