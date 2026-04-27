# SENSE v2.1 — Integração FA no Gatilho (MVP) — Implementation Plan
> **Para execução:** usar superpowers:executing-plans ou superpowers:subagent-driven-development task a task.

**Goal:** Integrar vetos hard do fluxo avançado (SpreadZ, TapeBlast, Footprint esgotamento) no `gatilhoOperacional` da EA, com export `diag` no JSON e rollback total via `FA_Ativo = false`.
**Arquivos EA:** `SENSE.mq5`, `SENSE_FlowAdvanced.mqh`
**Arquivos Painel:** `scripts/lib/sense-ia-context.js`, `renderer-gatilho.js`
**Rollback:** `FA_Ativo = false` → zero linhas FA avaliadas, comportamento idêntico ao v2.0

---

## Task 1 — Corrigir warmup do SpreadZ em `SENSE_FlowAdvanced.mqh`

**Arquivo:** `SENSE_FlowAdvanced.mqh`
**Problema:** warmup atual é `g_szN < 10` — 10 amostras a cada 250ms = 2.5s. Na abertura o spread é naturalmente alto, gerando alerta falso.
**Fix:** elevar para 30 amostras (7.5s de warmup).

```mql5
// Linha atual (~83):
   if(g_szN < 10)

// Substituir por:
   if(g_szN < 30)
```

**Verificar:** compilar sem erro; em OnInit o g_szAlert nunca é true antes de 30 ciclos de timer.

---

## Task 2 — Adicionar inputs FA em `SENSE.mq5`

**Arquivo:** `SENSE.mq5`
**Onde inserir:** após o bloco `ND_GAT_MS` (linha ~283), antes do bloco `ND_AGR` ou de `Delta_Memoria_Gatilho`.

```mql5
input string ND_FA             = "===||| Fluxo Avançado no Gatilho (FA_Ativo=false = sem efeito) |||===";
input bool   FA_Ativo                 = false;
input bool   FA_SpreadZ_Bloq_Ativo    = true;
input double FA_SpreadZ_Bloq_Limiar   = 2.0;
input bool   FA_TapeBlast_Bloq_Ativo  = true;
input double FA_TapeBlast_Z_Limiar    = 3.5;
input bool   FA_Footprint_Exaust_Bloq = true;
```

**Verificar:** inputs visíveis na aba Propriedades da EA; sem conflito de nomes com inputs existentes.

---

## Task 3 — Inserir vetos FA em `GatilhoBlockReasonBuy()` em `SENSE.mq5`

**Arquivo:** `SENSE.mq5`
**Função:** `GatilhoBlockReasonBuy()` (~linha 6954)
**Onde:** imediatamente após o check `if(!Use_ZFlow) return "ZFLOW OFF";` e ANTES do check de consenso.

```mql5
   // [FA] Vetos de fluxo avançado — falha rápida antes do consenso
   if(FA_Ativo)
     {
      if(FA_SpreadZ_Bloq_Ativo && g_szAlert && g_szZ >= FA_SpreadZ_Bloq_Limiar)
         return "SPREAD STRESS";
      if(FA_TapeBlast_Bloq_Ativo && g_tsSpeedZ >= FA_TapeBlast_Z_Limiar)
         return "TAPE BLAST";
     }
```

Após o check de consenso (`elapsed < needSec`), inserir veto de footprint:

```mql5
   // [FA] Footprint esgotamento — após consenso estabelecido
   if(FA_Ativo && FA_Footprint_Exaust_Bloq && g_fpExaustBuy)
      return "FOOTPRINT EXAUST COMPRA";
```

**Verificar:** com `FA_Ativo = false`, função retorna exatamente o mesmo que antes; com `FA_Ativo = true` e `g_szAlert = true`, retorna `"SPREAD STRESS"`.

---

## Task 4 — Inserir vetos FA em `GatilhoBlockReasonSell()` em `SENSE.mq5`

**Arquivo:** `SENSE.mq5`
**Função:** `GatilhoBlockReasonSell()` (~linha 6984)
**Mesma estrutura que Task 3, lado venda:**

```mql5
   // [FA] Vetos de fluxo avançado — falha rápida antes do consenso
   if(FA_Ativo)
     {
      if(FA_SpreadZ_Bloq_Ativo && g_szAlert && g_szZ >= FA_SpreadZ_Bloq_Limiar)
         return "SPREAD STRESS";
      if(FA_TapeBlast_Bloq_Ativo && g_tsSpeedZ >= FA_TapeBlast_Z_Limiar)
         return "TAPE BLAST";
     }
```

Após consenso:

```mql5
   // [FA] Footprint esgotamento — após consenso
   if(FA_Ativo && FA_Footprint_Exaust_Bloq && g_fpExaustSell)
      return "FOOTPRINT EXAUST VENDA";
```

**Verificar:** espelho exato de Task 3 com lógica de venda.

---

## Task 5 — Exportar `diag` no JSON em `SENSE.mq5`

**Arquivo:** `SENSE.mq5`
**Onde:** na função de export JSON (~linha 3236, bloco `gatilhoOperacional`), após os campos existentes (`buyBlockReason`, `sellBlockReason`, etc.).

Construir o array `reasons[]` antes do bloco JSON:

```mql5
   // Construir reasons[] FA para diag
   string faReasonsBuy  = "";
   string faReasonsSell = "";
   if(FA_Ativo)
     {
      if(FA_SpreadZ_Bloq_Ativo && g_szAlert && g_szZ >= FA_SpreadZ_Bloq_Limiar)
        {
         faReasonsBuy  += (faReasonsBuy  == "" ? "" : ",") + "\"SPREAD STRESS\"";
         faReasonsSell += (faReasonsSell == "" ? "" : ",") + "\"SPREAD STRESS\"";
        }
      if(FA_TapeBlast_Bloq_Ativo && g_tsSpeedZ >= FA_TapeBlast_Z_Limiar)
        {
         faReasonsBuy  += (faReasonsBuy  == "" ? "" : ",") + "\"TAPE BLAST\"";
         faReasonsSell += (faReasonsSell == "" ? "" : ",") + "\"TAPE BLAST\"";
        }
      if(FA_Footprint_Exaust_Bloq && g_fpExaustBuy)
         faReasonsBuy  += (faReasonsBuy  == "" ? "" : ",") + "\"FOOTPRINT EXAUST COMPRA\"";
      if(FA_Footprint_Exaust_Bloq && g_fpExaustSell)
         faReasonsSell += (faReasonsSell == "" ? "" : ",") + "\"FOOTPRINT EXAUST VENDA\"";
     }
```

Depois, adicionar ao JSON dentro de `gatilhoOperacional` (após `consensoVendaAtivo`):

```mql5
   json += ",\"diag\":{";
   json += "\"faAtivo\":"       + (FA_Ativo ? "true" : "false") + ",";
   json += "\"tapeSpeedZ\":"    + DoubleToString(g_tsSpeedZ, 2) + ",";
   json += "\"spreadZ\":"       + DoubleToString(g_szZ, 2) + ",";
   json += "\"spreadAlert\":"   + (g_szAlert ? "true" : "false") + ",";
   json += "\"fpExaustBuy\":"   + (g_fpExaustBuy  ? "true" : "false") + ",";
   json += "\"fpExaustSell\":"  + (g_fpExaustSell ? "true" : "false") + ",";
   json += "\"reasonsBuy\":["   + faReasonsBuy  + "],";
   json += "\"reasonsSell\":["  + faReasonsSell + "]";
   json += "}";
```

**Verificar:** abrir `dashboard.json` após ciclo com FA ligado — campo `diag` presente com valores numéricos válidos e arrays `reasonsBuy`/`reasonsSell` corretos.

---

## Task 6 — Compilar EA e validar

**Ação manual no MetaEditor:**
1. Abrir `SENSE.mq5` → F7
2. Confirmar **0 erros** na aba Toolbox → Errors
3. Recarregar EA no gráfico com `FA_Ativo = false`
4. Abrir `dashboard.json` — confirmar que `diag` aparece com `"faAtivo": false`
5. Mudar `FA_Ativo = true` → confirmar `"faAtivo": true` no JSON

**Check de rollback:** com `FA_Ativo = false`, rodar 5 minutos e confirmar que `buyBlockReason`/`sellBlockReason` são idênticos ao comportamento v2.0 (sem nenhuma string "SPREAD STRESS", "TAPE BLAST", "FOOTPRINT").

---

## Task 7 — Atualizar `sense-ia-context.js` no painel

**Arquivo:** `scripts/lib/sense-ia-context.js`
**Onde:** no `pick` do `gatilhoOperacional` (~linha 248), adicionar leitura do `diag`.

```js
// Linha atual:
out.gatilho = pick(go, [
  "buyReady", "sellReady", "buyHighConf", "sellHighConf",
  "buyBlockReason", "sellBlockReason",
  "consensoSegundos", "consensoSegRestantesCompra", "consensoSegRestantesVenda",
]);

// Substituir por:
const diagRaw = go.diag && typeof go.diag === "object" ? go.diag : null;
out.gatilho = pick(go, [
  "buyReady", "sellReady", "buyHighConf", "sellHighConf",
  "buyBlockReason", "sellBlockReason",
  "consensoSegundos", "consensoSegRestantesCompra", "consensoSegRestantesVenda",
]);
if(diagRaw) {
  out.gatilho.diag = {
    faAtivo:      !!diagRaw.faAtivo,
    spreadAlert:  !!diagRaw.spreadAlert,
    fpExaustBuy:  !!diagRaw.fpExaustBuy,
    fpExaustSell: !!diagRaw.fpExaustSell,
    tapeSpeedZ:   Number.isFinite(Number(diagRaw.tapeSpeedZ))  ? Number(diagRaw.tapeSpeedZ)  : null,
    spreadZ:      Number.isFinite(Number(diagRaw.spreadZ))     ? Number(diagRaw.spreadZ)      : null,
    reasonsBuy:   Array.isArray(diagRaw.reasonsBuy)  ? diagRaw.reasonsBuy  : [],
    reasonsSell:  Array.isArray(diagRaw.reasonsSell) ? diagRaw.reasonsSell : [],
  };
}
```

**Verificar:** SENSE IA receberá `gatilho.diag` no contexto JSON — permite que ela mencione "SPREAD STRESS" ou "FOOTPRINT EXAUST" na análise quando relevante.

---

## Task 8 — Ícones de alerta em `renderer-gatilho.js` no painel

**Arquivo:** `renderer-gatilho.js`
**Escopo mínimo:** exibir badge `⚠ SPREAD` e `⚡ FP` no card do gatilho quando os alertas estão ativos.
**Onde:** na função que monta o HTML do card de gatilho (buscar por `buyBlockReason` ou `buyReady` no arquivo).

```js
function renderGatilhoFABadges(d) {
  const diag = d && d.gatilhoOperacional && d.gatilhoOperacional.diag;
  if (!diag || !diag.faAtivo) return "";
  let badges = "";
  if (diag.spreadAlert) badges += `<span class="gatilho-fa-badge gatilho-fa-badge--spread">⚠ SPREAD</span>`;
  if (diag.fpExaustBuy)  badges += `<span class="gatilho-fa-badge gatilho-fa-badge--fp">⚡ FP COMPRA</span>`;
  if (diag.fpExaustSell) badges += `<span class="gatilho-fa-badge gatilho-fa-badge--fp">⚡ FP VENDA</span>`;
  return badges;
}
```

Chamar `renderGatilhoFABadges(d)` e injetar o HTML retornado no container do gatilho.

CSS mínimo (adicionar em `0132-flow-advanced.css` ou inline no renderer):
```css
.gatilho-fa-badge { font-size: 0.7rem; padding: 1px 5px; border-radius: 3px; margin-left: 4px; }
.gatilho-fa-badge--spread { background: #7c3; color: #000; }  /* amarelo-alerta */
.gatilho-fa-badge--fp     { background: #39f; color: #000; }  /* azul-info */
```

**Verificar:** com `FA_Ativo = true` e `g_szAlert = true` na EA → badge `⚠ SPREAD` aparece no card do gatilho no painel.

---

## Task 9 — Commit e validação final

```bash
# EA
cd "SENSE 2026/FONTE/Santiago EA"
git add SENSE.mq5 SENSE_FlowAdvanced.mqh
git commit -m "feat(ea): v2.1 MVP — vetos FA (SpreadZ, TapeBlast, Footprint) + diag JSON"

# Painel
cd painel-sense-desktop
git add scripts/lib/sense-ia-context.js renderer-gatilho.js styles/semantic/0132-flow-advanced.css
git commit -m "feat(painel): v2.1 MVP — diag FA no contexto IA + badges gatilho"
```

**Checklist de validação final:**
- [ ] EA compila 0 erros
- [ ] `FA_Ativo = false` → JSON sem strings "SPREAD STRESS"/"TAPE BLAST"/"FOOTPRINT" nos blockReasons
- [ ] `FA_Ativo = true` + forçar `g_szAlert = true` (spread alto em horário volátil) → `buyBlockReason = "SPREAD STRESS"` e `diag.reasonsBuy = ["SPREAD STRESS"]`
- [ ] Painel: badge `⚠ SPREAD` visível quando alerta ativo
- [ ] SENSE IA: ao pedir leitura manual com `spreadAlert = true`, IA menciona stress de liquidez na análise

---

## Fora do MVP (Fase 2 — não implementar agora)

- `FA_TapeSpeed_Reduz_Consenso`: redução de `consensoSegundos` quando tape acelera
- `FA_ZNorm_Modula`: Z-norm intraday modula tempo de consenso
- `FA_Footprint_Delta_Conf`: exige delta da vela anterior alinhado ao lado
- OFI nocional com peso DOL/WDO configurável
- `crossConflict` no diag (Z-norm mini vs ref divergentes)
