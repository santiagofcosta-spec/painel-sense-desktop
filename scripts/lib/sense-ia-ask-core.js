/**
 * SENSE IA — chamada ao modelo: OpenAI, Genspark (OpenAI-compat) ou Ollama.
 * Usado pelo CLI e pelo processo principal (Electron).
 */
"use strict";

const fs = require("fs");
const { loadCompactContext } = require("./sense-ia-context.js");
const {
  GATILHO_FA_DIAGNOSTIC_USER_PREFIX,
  SENSE_IA_PROFILE_GATILHO_FA_DIAGNOSTIC,
  SYSTEM_GATILHO_FA_DIAGNOSTIC_ADDON,
} = require("./sense-ia-gatilho-diagnostic-prompt.js");
const {
  SENSE_IA_PROFILE_INPUTS_DIAGNOSTIC,
  SYSTEM_INPUTS_DIAGNOSTIC_PT,
} = require("./sense-ia-inputs-diagnostic-prompt.js");

const SYSTEM_PT = `És a SENSE IA. Recebes um JSON com dados agregados do painel SENSE (mercado, delta, fluxo, regime, radar, agressão, etc.).
Responde em português europeu (Brasil aceitável se preferires tom neutro).

**Obrigatório — primeiras duas linhas da resposta (só essas, nessa ordem):**
**Viés:** Lateral | Alta | Baixa
**Confiança:** XX%
— Viés: escolhe **um** termo: **Alta** = viés comprador / pressão de alta; **Baixa** = viés vendedor / pressão de baixa; **Lateral** = gama / sem direção clara (inclui regime lateral NTSL se aplicável).
— Confiança: inteiro de 0 a 100 refletindo a **coerência entre os sinais** (100 = todos alinhados numa direção; 0 = sinais completamente contraditórios ou ausentes).

Se o JSON trouxer \`painelBias\` (com \`label\`, \`scoreBuy\`, \`scoreSell\`), usa-o como sinal auxiliar (não obrigatório).
Dá prioridade aos sinais estruturados do próprio JSON (flow, delta, gatilhoOperacional, regimeMercado, placar). Se houver conflito, segue o conjunto mais consistente e explica em 1 frase curta.
Se o JSON incluir \`dataAgeSeconds\`, considera dados com mais de 300 s potencialmente defasados e menciona isso na análise.
Se incluir \`ativoLateralLimitePct\`, usa-o como limiar para classificar ntslZ como lateral.
Se incluir \`flow.trendWeakPct\` e \`flow.trendStrongPct\`, usa-os para graduar a intensidade da tendência (fraca vs. forte).
Se existir \`eaInputsSnapshot\`, são os **inputs reais** da EA no MT5 nesse momento (objeto completo exportado pelo EA); **não** assumas defaults do código — usa estes valores para flags/limiares (ex.: \`FA_Ativo\`, \`Use_ZFlow\`) e **não** os confundas com \`gatilho.diag.faAtivo\` (estado interno do \`diag\`, só se existir).

Depois dessas linhas, dá uma leitura **objetiva** do *sentimento* e dos **riscos** perceptíveis (ex.: divergências, incerteza).
Usa **título curto** (opcional) + **2 a 4 parágrafos** ou bullets; não inventes números que não estejam no JSON.
Aviso: isto é **apenas análise descritiva** de sinais; não é recomendação de investimento nem previsão garantida.`;

const SENSE_IA_PROFILE_AUTO_CYCLE = "auto_cycle";

const SYSTEM_AUTO_CYCLE_PT = `Você é um analista de fluxo de ordens intraday.
Responda EXATAMENTE neste formato, sem nenhum texto adicional:
Viés: Alta|Baixa|Lateral
Confiança: XX%
Razão: [máximo 12 palavras]`;

function envGet(env, key, def) {
  const v = env && env[key];
  if (v === undefined || v === null || String(v).trim() === "") return def;
  return String(v).trim();
}

function isGatilhoFaDiagnosticProfile(env) {
  return envGet(env, "SENSE_IA_PROMPT_PROFILE", "").toLowerCase() === SENSE_IA_PROFILE_GATILHO_FA_DIAGNOSTIC;
}

function isInputsDiagnosticProfile(env) {
  return envGet(env, "SENSE_IA_PROMPT_PROFILE", "").toLowerCase() === SENSE_IA_PROFILE_INPUTS_DIAGNOSTIC;
}

/** max_tokens OpenAI-compat: env SENSE_IA_MAX_TOKENS ou limite por defeito. */
function resolveMaxTokens(env, fallback) {
  const n = Number(envGet(env, "SENSE_IA_MAX_TOKENS", ""));
  if (Number.isFinite(n) && n >= 256 && n <= 16384) return Math.floor(n);
  return fallback;
}

/** num_predict Ollama: env SENSE_IA_OLLAMA_NUM_PREDICT ou limite por defeito. */
function resolveOllamaNumPredict(env, fallback) {
  const n = Number(envGet(env, "SENSE_IA_OLLAMA_NUM_PREDICT", ""));
  if (Number.isFinite(n) && n >= 200 && n <= 8192) return Math.floor(n);
  return fallback;
}

/**
 * Variáveis de ambiente + bloco opcional `senseIa` em config.json (ficheiro local, não commitado).
 * Prioridade: env do sistema sobrepõe valores do JSON se ambos definidos (caso raro — não misturar por defeito).
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} baseEnv
 * @param {string} [configJsonPath] — ex.: …/painel-sense-desktop/config.json
 */
function mergeSenseIaEnvWithConfigFile(baseEnv, configJsonPath) {
  const out = { ...baseEnv };
  if (!configJsonPath) return out;
  try {
    if (!fs.existsSync(configJsonPath)) return out;
    const raw = JSON.parse(fs.readFileSync(configJsonPath, "utf8"));
    if (!raw || typeof raw !== "object") return out;
    const si = raw.senseIa || raw.senseIA;
    if (!si || typeof si !== "object") return out;
    const setIf = (envKey, val) => {
      if (val === undefined || val === null || String(val).trim() === "") return;
      const t = String(val).trim();
      if (out[envKey] !== undefined && String(out[envKey]).trim() !== "") return;
      out[envKey] = t;
    };
    setIf("GSK_API_KEY", si.gskApiKey ?? si.GSK_API_KEY);
    setIf("GENSPARK_API_KEY", si.genSparkApiKey ?? si.GENSPARK_API_KEY);
    setIf("SENSE_IA_PROVIDER", si.provider ?? si.SENSE_IA_PROVIDER);
    setIf("SENSE_IA_GENSPARK_BASE", si.gensparkBase ?? si.SENSE_IA_GENSPARK_BASE);
    setIf("SENSE_IA_MODEL", si.model ?? si.SENSE_IA_MODEL);
    setIf("OPENAI_API_KEY", si.openaiApiKey ?? si.OPENAI_API_KEY);
    setIf("SENSE_IA_OPENAI_BASE", si.openAiBase ?? si.SENSE_IA_OPENAI_BASE);
    setIf("OLLAMA_HOST", si.ollamaHost ?? si.OLLAMA_HOST);
  } catch (e) {
    /* config inválido ou ficheiro em uso — ignora */
  }
  return out;
}

/** openai | ollama | genspark — se SENSE_IA_PROVIDER vazio: só GSK → genspark; só OpenAI → openai; ambos → openai. */
function resolveProvider(env) {
  const raw = envGet(env, "SENSE_IA_PROVIDER", "");
  if (raw) return raw.toLowerCase();
  const hasGsk = !!(envGet(env, "GSK_API_KEY", "") || envGet(env, "GENSPARK_API_KEY", ""));
  const hasOpenai = !!envGet(env, "OPENAI_API_KEY", "");
  if (hasGsk && !hasOpenai) return "genspark";
  return "openai";
}

/** POST .../chat/completions (formato OpenAI). */
async function openAiCompatibleChat(messages, env, label, key, base, defaultModel) {
  const model = envGet(env, "SENSE_IA_MODEL", defaultModel);
  const url = `${base.replace(/\/$/, "")}/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.35,
      max_tokens: resolveMaxTokens(env, 1200),
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${label} HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
  const json = JSON.parse(text);
  const out = json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
  if (!out) throw new Error(`Resposta ${label} inesperada: ${text.slice(0, 400)}`);
  return { text: String(out).trim(), model };
}

async function openAiChat(messages, env) {
  const key = envGet(env, "OPENAI_API_KEY", "");
  if (!key) {
    throw new Error("Define OPENAI_API_KEY (chave da API OpenAI).");
  }
  const base = envGet(env, "SENSE_IA_OPENAI_BASE", "") || "https://api.openai.com/v1";
  return openAiCompatibleChat(messages, env, "OpenAI", key, base, "gpt-4o-mini");
}

function gensparkBaseUrl(env) {
  const explicit = envGet(env, "SENSE_IA_GENSPARK_BASE", "");
  if (explicit) return explicit.replace(/\/$/, "");
  const gsk = envGet(env, "GSK_BASE_URL", "");
  if (gsk) {
    const u = gsk.replace(/\/$/, "");
    return u.endsWith("/v1") ? u : `${u}/v1`;
  }
  return "https://api.genspark.ai/v1";
}

/**
 * Genspark — API compatível com OpenAI (Tool API / proxy LLM da Genspark).
 * Chave: GSK_API_KEY ou GENSPARK_API_KEY. URL base: SENSE_IA_GENSPARK_BASE se o teu painel Genspark indicar outra.
 */
async function gensparkChat(messages, env) {
  const key = envGet(env, "GSK_API_KEY", "") || envGet(env, "GENSPARK_API_KEY", "");
  if (!key) {
    throw new Error("Define GSK_API_KEY (ou GENSPARK_API_KEY) — chave da API Genspark.");
  }
  return openAiCompatibleChat(messages, env, "Genspark", key, gensparkBaseUrl(env), "claude-sonnet-4-6");
}

async function ollamaChat(messages, env) {
  const timeoutMs = Number(envGet(env, "SENSE_IA_OLLAMA_TIMEOUT_MS", "")) || 300000;
  const host = envGet(env, "OLLAMA_HOST", "http://127.0.0.1:11434");
  const model = envGet(env, "SENSE_IA_MODEL", "llama3.2");
  const url = `${host.replace(/\/$/, "")}/api/chat`;
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        stream: false,
        options: {
          num_predict: resolveOllamaNumPredict(env, 1400),
          temperature: 0.35,
        },
      }),
      signal:
        typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
          ? AbortSignal.timeout(timeoutMs)
          : undefined,
    });
  } catch (e) {
    const name = e && e.name;
    if (name === "AbortError" || name === "TimeoutError") {
      throw new Error(
        `Ollama não respondeu em ${Math.round(timeoutMs / 1000)} s — servidor parado, modelo a carregar na RAM, ou CPU muito lenta. Confirma que o Ollama está a correr e tenta de novo.`,
      );
    }
    if (e && (e.code === "ECONNREFUSED" || e.cause?.code === "ECONNREFUSED")) {
      throw new Error(
        "Não há conexão ao Ollama em " + host + " — abre a app Ollama ou verifica ollamaHost em config.json → senseIa.",
      );
    }
    throw e;
  }
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Ollama HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new Error(`Resposta Ollama não é JSON: ${text.slice(0, 300)}`);
  }
  const out =
    (json.message && json.message.content) ||
    (typeof json.response === "string" ? json.response : null);
  if (!out) throw new Error(`Resposta Ollama inesperada: ${text.slice(0, 400)}`);
  return { text: String(out).trim(), model: json.model || model };
}

/**
 * @param {Record<string, string>} [customEnv] — por omissão usa process.env (Electron / CLI).
 * @returns {Promise<{ ok: true, answer, model, provider, readAt, sourcePath, senseIa?: true } | { ok: false, error, hint?, dataPath?, senseIa?: true }>}
 */
async function runSenseIaAsk(customEnv) {
  const env = customEnv ? { ...customEnv } : { ...process.env };
  const gatilhoDiagnostic = isGatilhoFaDiagnosticProfile(env);
  const inputsDiagnostic = isInputsDiagnosticProfile(env);
  if (gatilhoDiagnostic) {
    if (!String(env.SENSE_IA_MAX_TOKENS || "").trim()) env.SENSE_IA_MAX_TOKENS = "4096";
    if (!String(env.SENSE_IA_OLLAMA_NUM_PREDICT || "").trim()) env.SENSE_IA_OLLAMA_NUM_PREDICT = "3200";
  }
  if (inputsDiagnostic) {
    if (!String(env.SENSE_IA_MAX_TOKENS || "").trim()) env.SENSE_IA_MAX_TOKENS = "800";
    if (!String(env.SENSE_IA_OLLAMA_NUM_PREDICT || "").trim()) env.SENSE_IA_OLLAMA_NUM_PREDICT = "900";
  }
  const autoCycleProfile = envGet(env, "SENSE_IA_PROMPT_PROFILE", "").toLowerCase() === SENSE_IA_PROFILE_AUTO_CYCLE;
  if (autoCycleProfile) {
    if (!String(env.SENSE_IA_MAX_TOKENS || "").trim()) env.SENSE_IA_MAX_TOKENS = "80";
    if (!String(env.SENSE_IA_OLLAMA_NUM_PREDICT || "").trim()) env.SENSE_IA_OLLAMA_NUM_PREDICT = "80";
  }

  if (typeof fetch !== "function") {
    return {
      ok: false,
      senseIa: true,
      error: "Ambiente sem fetch global. Usa Node 18+ ou Electron recente.",
    };
  }

  const loaded = loadCompactContext(env);
  if (loaded.error) {
    return {
      ok: false,
      senseIa: true,
      error: loaded.error,
      dataPath: loaded.dataPath,
      hint: loaded.hint,
    };
  }

  const { compact } = loaded;
  const userLines = [];
  if (gatilhoDiagnostic) {
    userLines.push(GATILHO_FA_DIAGNOSTIC_USER_PREFIX);
    userLines.push("");
    userLines.push("---");
    userLines.push("");
  }
  userLines.push("Segue o contexto JSON do painel (uma leitura de mercado agregada).");
  userLines.push("");
  userLines.push(JSON.stringify(compact, null, 2));
  const userPayload = userLines.join("\n");

  const systemContent = gatilhoDiagnostic
    ? SYSTEM_PT + SYSTEM_GATILHO_FA_DIAGNOSTIC_ADDON
    : inputsDiagnostic
      ? SYSTEM_INPUTS_DIAGNOSTIC_PT
    : autoCycleProfile
      ? SYSTEM_AUTO_CYCLE_PT
      : SYSTEM_PT;
  const messages = [
    { role: "system", content: systemContent },
    { role: "user", content: userPayload },
  ];

  const provider = resolveProvider(env);

  try {
    let result;
    if (provider === "ollama") result = await ollamaChat(messages, env);
    else if (provider === "genspark") result = await gensparkChat(messages, env);
    else result = await openAiChat(messages, env);
    return {
      ok: true,
      senseIa: true,
      answer: result.text,
      model: result.model,
      provider,
      readAt: compact._readAt,
      sourcePath: compact._sourcePath,
      ...(gatilhoDiagnostic ? { senseIaProfile: SENSE_IA_PROFILE_GATILHO_FA_DIAGNOSTIC } : {}),
      ...(inputsDiagnostic ? { senseIaProfile: SENSE_IA_PROFILE_INPUTS_DIAGNOSTIC } : {}),
    };
  } catch (e) {
    const msg = e.message || String(e);
    let hint =
      "Confirma que o Ollama está a correr e que SENSE_IA_MODEL existe (ollama list).";
    if (provider === "openai") {
      hint =
        "Verifica OPENAI_API_KEY e rede. Opcional: SENSE_IA_OPENAI_BASE — ou em config.json em senseIa (openaiApiKey) se preferires ficheiro local.";
    } else if (provider === "genspark") {
      hint =
        "Verifica GSK_API_KEY (ou GENSPARK_API_KEY), ou cola a chave em config.json → senseIa.gskApiKey. Se der 404, define SENSE_IA_GENSPARK_BASE (URL …/v1 da conta Genspark). Modelo: SENSE_IA_MODEL.";
    }
    return {
      ok: false,
      senseIa: true,
      error: msg,
      hint,
      provider,
    };
  }
}

module.exports = {
  runSenseIaAsk,
  SYSTEM_PT,
  mergeSenseIaEnvWithConfigFile,
  isGatilhoFaDiagnosticProfile,
  isInputsDiagnosticProfile,
  SENSE_IA_PROFILE_GATILHO_FA_DIAGNOSTIC,
  SENSE_IA_PROFILE_INPUTS_DIAGNOSTIC,
  SENSE_IA_PROFILE_AUTO_CYCLE,
};
