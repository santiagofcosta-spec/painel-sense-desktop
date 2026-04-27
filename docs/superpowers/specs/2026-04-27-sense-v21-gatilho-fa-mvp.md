# SENSE v2.1 — Integração FA no Gatilho (MVP) — Spec

**Data:** 2026-04-27
**Escopo:** MVP — apenas vetos hard. Sem modulação de consenso.

---

## Objetivo

Integrar os sinais de fluxo avançado (B+C) no `gatilhoOperacional` como **filtros protetores** (vetos), reduzindo falsos positivos sem alterar o mecanismo de geração de sinal. Rollback total via `FA_Ativo = false`.

---

## Em escopo (MVP)

| Filtro | Variável | Papel |
|--------|----------|-------|
| SpreadZ stress | `g_szAlert`, `g_szZ` | Bloqueia disparo quando spread > 2σ intraday |
| TapeSpeed blast | `g_tsSpeedZ` | Bloqueia quando tape explode (spike/news) |
| Footprint esgotamento | `g_fpExaustBuy`, `g_fpExaustSell` | Bloqueia o lado esgotado após vela M1 contra-direcional |
| Diag JSON | `diag{}` em `gatilhoOperacional` | Exporta motivos estruturados + valores raw dos sinais FA |

## Fora de escopo (Fase 2)

- Modulação de `consensoSegundos` por TapeSpeed ou Z-norm
- Confirmação de delta do footprint (`FA_Footprint_Delta_Conf`)
- OFI com peso nocional parametrizável
- Qualquer modificação no placar ou nos critérios de consenso

---

## Inputs (todos em bloco separado no EA)

```mql5
input string ND_FA            = "===||| Fluxo Avançado no Gatilho (FA_Ativo=false = sem efeito) |||===";
input bool   FA_Ativo                = false;  // false = comportamento idêntico ao atual
input bool   FA_SpreadZ_Bloq_Ativo   = true;   // SpreadZ bloqueia disparo
input double FA_SpreadZ_Bloq_Limiar  = 2.0;    // z acima disto → bloqueio
input bool   FA_TapeBlast_Bloq_Ativo = true;   // TapeSpeed blast bloqueia
input double FA_TapeBlast_Z_Limiar   = 3.5;    // z acima disto → bloqueia
input bool   FA_Footprint_Exaust_Bloq = true;  // esgotamento M1 bloqueia lado
```

---

## Ordem da cadeia de veto (GatilhoBlockReasonBuy/Sell)

```
1. ZFlow OFF                         ← já existe
2. [FA] SpreadZ veto                 ← NOVO — antes do consenso
3. [FA] TapeSpeed blast veto         ← NOVO — antes do consenso
4. Consenso placar (tempo)           ← já existe, sem alteração
5. [FA] Footprint esgotamento        ← NOVO — após consenso
6. Microestrutura (OFI + livro)      ← já existe
7. Absorção Real                     ← já existe
8. SR Detect                         ← já existe
9. Regime                            ← já existe
```

SpreadZ e TapeSpeed blast vêm antes do consenso por **falha rápida** — não há sentido acumular N segundos de consenso quando o mercado está em stress de liquidez ou em spike.

---

## Formato `diag` no JSON (schema v10)

Adicionado dentro de `gatilhoOperacional`:

```json
"diag": {
  "faAtivo": true,
  "tapeSpeedZ": 1.3,
  "spreadZ": 2.4,
  "spreadAlert": true,
  "fpExaustBuy": false,
  "fpExaustSell": false,
  "reasons": ["SPREAD STRESS"]
}
```

`reasons[]`: lista dos motivos FA que bloquearam (pode ser vazia `[]` quando nada bloqueou).

---

## Critérios de aceite

1. **Compilação:** 0 erros, 0 warnings relevantes no MetaEditor
2. **Rollback:** com `FA_Ativo = false`, nenhuma linha FA é avaliada — comportamento idêntico ao v2.0
3. **SpreadZ:** quando `g_szAlert = true`, `buyBlockReason` ou `sellBlockReason` = `"SPREAD STRESS"` e `diag.reasons` contém `"SPREAD STRESS"`
4. **TapeBlast:** quando `g_tsSpeedZ >= 3.5`, block reason = `"TAPE BLAST"`
5. **Footprint:** quando `g_fpExaustBuy = true` + placar compra OK, block reason = `"FOOTPRINT EXAUST COMPRA"`
6. **Sem interferência:** com FA desligado, replay de 1 dia deve produzir exatamente os mesmos sinais que v2.0
7. **JSON:** `dashboard.json` contém `gatilhoOperacional.diag` a cada ciclo quando `FA_Ativo = true`
