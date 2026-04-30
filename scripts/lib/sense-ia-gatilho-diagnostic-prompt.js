"use strict";

/**
 * Instruções extra no pedido do utilizador quando o perfil é
 * `gatilho_fa_diagnostic` (relatório além da calibragem B+C / FA).
 * As duas primeiras linhas da resposta ficam definidas em SYSTEM_PT.
 */
const GATILHO_FA_DIAGNOSTIC_USER_PREFIX = `**Modo: diagnóstico do Gatilho operacional (pós-calibragem B+C / FA)**

**REGRA CRÍTICA — cumpre antes de escrever B, C e D:** Nunca escrevas frases do tipo “o gatilho está ativo/inativo” por causa de \`gatilho.diag.faAtivo\` ou \`eaInputsSnapshot.FA_Ativo\`. Esses campos referem-se ao **módulo FA** (inputs ou runtime), **não** ao estado de prontidão COMPRA/VENDA. O “gatilho com lado pronto” só existe quando \`buyReady\` ou \`sellReady\` é **true**; se ambos forem **false**, **não** digas que o lado pronto do gatilho é compra ou venda (evita contradizer a secção A).

Depois das **duas primeiras linhas obrigatórias** (**Viés:** … e **Confiança:** … %), entrega um relatório **completo** com **sete secções A a G**, sem fundir nem renumerar.

**ORDEM E TÍTULOS EXACTOS (obrigatório — um bloco por letra, nesta sequência):**
1. \`**A) Estado do gatilho (JSON)**\`
2. \`**B) Fluxo avançado FA / diag**\`
3. \`**C) Coerência painel vs. gatilho**\`
4. \`**D) Inputs reais da EA**\`
5. \`**E) Riscos e invalidação**\`
6. \`**F) Resumo executivo**\`
7. \`**G) Calibragem do gatilho — bom / fraco / sugestões**\`

**Proibido:** usar “B)” para riscos, “C)” para resumo, ou “D)” para calibragem; **proibido** omitir B, C, D, E, F ou G; **proibido** repetir a mesma secção duas vezes (ex.: dois **E)** ou dois **F)** com texto igual). **Proibido** mudar o texto do título (ex.: não uses “A) Coerência e Estabilidade” nem “G) Calibragem do Gatilho” sem o sufixo exacto “— bom / fraco / sugestões”); os títulos têm de ser **palavra por palavra** como na lista acima.

**Primeira linha do corpo** (logo após Viés + Confiança) tem de ser **exactamente** \`**A) Estado do gatilho (JSON)**\` — **sem** parágrafo introdutório (“Aqui está o relatório…”, “Segue a análise…”).

**A) Estado do gatilho (JSON)** — resume buyReady/sellReady, buyHighConf/sellHighConf; buyBlockReason/sellBlockReason quando existirem; consenso (consensoSegundos, restantes compra/venda); se o contexto é lateral ou com direção clara (flow, ntslZ, ativoLateralLimitePct quando existirem).

**B) Fluxo avançado FA / diag** — se existir o objeto \`gatilho.diag\` no JSON, descreve \`faAtivo\`, spreadAlert, spreadZ, tapeSpeedZ, fpExaust*, reasonsBuy/reasonsSell e liga vetos ao bloqueio. **Formulação:** podes dizer “\`faAtivo\` true = avaliação FA ligada no motor”, **nunca** “o gatilho operacional está ativo” por causa de \`faAtivo\`. Se **não** existir \`gatilho.diag\`, diz só isso (não inventes \`faAtivo\` nem digas "FA desligado" só por ausência de \`diag\`). **Não confundas** \`gatilho.diag.faAtivo\` com \`eaInputsSnapshot.FA_Ativo\` (input MT5): podem divergir; para "o que está no MT5" usa sempre \`eaInputsSnapshot\`. **Proibido:** afirmar que o **gatilho operacional** está "ativo" ou "inativo" **só** com base em \`gatilho.diag.faAtivo\` — o estado operacional descreve-se com \`buyReady\`/\`sellReady\` e bloqueios na secção A.

**C) Coerência painel vs. gatilho** — painelBias, regimeMercado, placar/radar se existirem; conflitos entre tendência NTSL e **\`buyReady\`/\`sellReady\`** (não uses \`painelBias.side\` como “lado pronto do gatilho” se \`buyReady\` e \`sellReady\` forem ambos false).

**D) Inputs reais da EA** — se existir \`eaInputsSnapshot\`, **obrigatório** (quando a chave existir no objeto) citar **valor literal** destes campos, um por linha ou bullet: \`FA_Ativo\`, \`Gatilho_MS_Ativo\`, \`Gatilho_MS_SpreadMaxPts\`. Se alguma chave **não** existir no JSON, escreve explicitamente “ausente no snapshot” para essa chave. Depois podes acrescentar outros inputs relevantes (\`Use_ZFlow\`, outros \`FA_*\`, \`Gatilho_*\`, microestrutura) **sempre com nome e valor** tirados do JSON — **proibido** ficar só com placeholders genéricos (ex.: “ZFlow / FA_* / microestrutura” sem números nem booleans). **Não** listes \`dataAgeSeconds\` nem \`ativoLateralLimitePct\` como se fossem chaves de \`eaInputsSnapshot\` **a menos que** apareçam **dentro** desse objeto no JSON; se estiverem na raiz do contexto, cita-os na **A)** ou **E)**, não na **D)**. **Nunca** digas que “o gatilho está ativo” só porque \`FA_Ativo\` no snapshot é true — isso é só **input** no MT5.

**E) Riscos e invalidação** — o que invalidaria esta leitura; menciona \`dataAgeSeconds\` > 300 como possível defasagem.

**F) Resumo executivo** — até 5 bullets com checklist operacional (só leitura de sinais; não é recomendação de investimento).

**G) Calibragem do gatilho — bom / fraco / sugestões** — ajuda o operador a **afinar** o gatilho com base neste snapshot:
- **O que está bom:** 2–5 bullets com o que está coerente, estável ou a trabalhar a teu favor (ex.: vetos FA alinhados com stress real, consenso coerente com placar, inputs que explicam bem os bloqueios).
- **O que está fraco ou problemático:** 2–5 bullets com tensões (ex.: painel comprador mas \`buyReady\` falso há muito tempo, \`diag\` com vetos frequentes, lateralidade vs placar, \`dataAgeSeconds\` alto, strings de \`buyBlockReason\`/\`sellBlockReason\` que indicam gargalo).
- **Sugestões de melhoria (hipóteses de ajuste):** 3–7 bullets **acionáveis**. Cada sugestão deve **referir evidência no JSON** (campo + valor ou texto de bloqueio) e propor **direção de calibragem** (ex.: “se bloqueio for por consenso, rever \`Gatilho_Placar_Consenso_Pct\` ou segundos em \`eaInputsSnapshot\`”, “se \`spreadAlert\` true com frequência, rever limiar FA SpreadZ / MS spread em inputs”, “se lateralidade bloqueia demais, rever \`ativoLateralLimitePct\` / NTSL no contexto do flow”). **Não inventes** nomes de inputs que não apareçam no \`eaInputsSnapshot\`; se o snapshot não tiver o input necessário para uma ideia, diz que falta dado. Se não houver base no JSON para sugestões concretas, escreve uma linha: **“Sem sugestões de ajuste concretas neste snapshot.”** Isto continua a ser **análise descritiva / hipóteses de calibragem**, não garantia de resultado nem recomendação de investimento.

Podes ser extenso nas secções A–G; a prioridade é **precisão** face ao JSON, não brevidade.`;

const SENSE_IA_PROFILE_GATILHO_FA_DIAGNOSTIC = "gatilho_fa_diagnostic";

const SYSTEM_GATILHO_FA_DIAGNOSTIC_ADDON = `

**Modo relatório Gatilho FA (B+C):** o pedido inclui a estrutura **A)–G)** (inclui **G** calibragem: bom / fraco / sugestões). Mantém as **duas primeiras linhas** exatamente no formato habitual: **Viés:** uma só palavra — **Lateral** ou **Alta** ou **Baixa** (não uses “Lateral | Alta” nem duas opções). **Confiança:** … %
Ignora o limite de “2 a 4 parágrafos” — o relatório A–G tem prioridade sobre a concisão.

**Estrutura rígida:** a resposta tem de ter **sete** cabeçalhos na ordem **A → B → C → D → E → F → G**, com os títulos exactos do pedido do utilizador. **B** é sempre FA/\`diag\`; **E** é sempre riscos; **G** é sempre calibragem. Não permutes letras nem mistures conteúdo de secções.

**NUNCA (repetição para modelos pequenos):** “gatilho operacional ativo/inativo” **≠** \`faAtivo\` **≠** \`FA_Ativo\` no snapshot. Prontidão COMPRA/VENDA = só \`buyReady\`/\`sellReady\`.

**Glossário (obrigatório respeitar):**
- \`eaInputsSnapshot\` = **todos** os inputs reais exportados pelo EA (MT5); é a fonte para “está true/false no painel de inputs”.
- \`gatilho.buyReady\` / \`sellReady\` / \`buyBlockReason\` / \`sellBlockReason\` = estado do **gatilho operacional** (sinais). **Não** digas que “o gatilho está desligado” só porque \`faAtivo\` ou FA esteja inativo; **nem** digas que “o gatilho está ativo” só porque \`gatilho.diag.faAtivo\` seja true — isso é só o bloco FA em runtime, não substitui \`buyReady\`/\`sellReady\`.
- \`gatilho.diag.faAtivo\` (só se a chave existir no JSON) = flag de avaliação FA **na lógica runtime** do EA; se a chave **não** existir em \`diag\`, não afirmes valor de \`faAtivo\`.
- \`eaInputsSnapshot.FA_Ativo\` = input **FA_Ativo** no MT5; cita-o na secção D quando existir — **sem** chamar isso de “gatilho ligado”.
- Secção **D:** com \`eaInputsSnapshot\` presente, tens de mostrar **valores** de \`FA_Ativo\`, \`Gatilho_MS_Ativo\` e \`Gatilho_MS_SpreadMaxPts\` se as chaves existirem; nada de lista vaga só com nomes de famílias de inputs.
- Secção **G:** sugestões de calibragem **só** com base no JSON; cada sugestão liga evidência (bloqueio, \`diag\`, input) a uma **hipótese** de afrouxar/endurecer/rever — sem prometer desempenho.`;

module.exports = {
  GATILHO_FA_DIAGNOSTIC_USER_PREFIX,
  SENSE_IA_PROFILE_GATILHO_FA_DIAGNOSTIC,
  SYSTEM_GATILHO_FA_DIAGNOSTIC_ADDON,
};
