#!/usr/bin/env node
/**
 * SENSE IA — pergunta ao modelo com o contexto do dashboard.
 *
 * Preferências em config.json → senseIa (ver config.example.json):
 *
 * OpenAI (recomendado sem Genspark API):
 *   "provider": "openai",
 *   "openaiApiKey": "sk-...",
 *   "model": "gpt-4o-mini"
 *
 * Ollama no PC:
 *   "provider": "ollama",
 *   "model": "llama3.2",
 *   "ollamaHost": "http://127.0.0.1:11434"
 *
 * Genspark (se tiveres gsk_):
 *   "provider": "genspark", "gskApiKey": "gsk_..."
 *
 * Ou variáveis de ambiente: OPENAI_API_KEY, SENSE_IA_PROVIDER=ollama, GSK_API_KEY, etc.
 *
 * Opcional: SENSE_IA_PROVIDER=genspark | openai | ollama
 * Conta / site (PT): https://www.genspark.ai/pt
 * Genspark URL: SENSE_IA_GENSPARK_BASE (…/v1) se a predefinição não funcionar.
 * Modelo: SENSE_IA_MODEL
 */
"use strict";

const path = require("path");
const { runSenseIaAsk, mergeSenseIaEnvWithConfigFile } = require("./lib/sense-ia-ask-core.js");

async function main() {
  const configFile = path.join(__dirname, "..", "config.json");
  const env = mergeSenseIaEnvWithConfigFile(process.env, configFile);
  const r = await runSenseIaAsk(env);
  if (!r.ok) {
    console.error(JSON.stringify({ senseIa: true, error: r.error, hint: r.hint, dataPath: r.dataPath }));
    process.exit(3);
  }
  console.log(
    JSON.stringify(
      {
        senseIa: true,
        model: r.model,
        provider: r.provider,
        readAt: r.readAt,
        sourcePath: r.sourcePath,
        answer: r.answer,
      },
      null,
      2,
    ),
  );
}

main();
