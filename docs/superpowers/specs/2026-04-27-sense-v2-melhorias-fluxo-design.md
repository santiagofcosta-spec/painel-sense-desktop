# SENSE v2.0 — Design de Melhorias de Fluxo e Agressão
**Data:** 2026-04-27
**Autor:** Santiago (santiagofcosta@gmail.com)
**Status:** Aprovado pelo autor

---

## 1. Contexto e Objetivo

O SENSE é um Expert Advisor (EA) em MQL5 para day trading de DOL/WDO na B3, integrado a um painel desktop Electron. Este documento especifica a evolução do sistema para o que chamamos internamente de **SENSE v2.0**, dividida em duas fases:

- **Fase 1 (Plano B):** corrige gargalos de performance e melhora a janela ZFlow
- **Fase 2 (Plano B + C):** adiciona novos módulos de análise de fluxo (TapeSpeed, SpreadZ, Footprint, Absorção Real, OFI por Nocional)

O painel Electron deve **refletir exatamente** o que a EA está lendo do mercado — qualquer nova métrica calculada no EA deve ter representação visual no painel.

---

## 2. Escopo

### Fora do escopo
- Lógica de ordens (TP, SL, breakeven, trailing) — não será tocada
- Sistema de licenciamento — fase 3 separada
- Pipeline de build/distribuição — fase 4 separada
- Refatoração do renderer.js monolítico — fase 2 do roadmap original

### Dentro do escopo
Apenas o pipeline de leitura de mercado → cálculo → exportação JSON → visualização no painel.

---

## 3. Pré-condições (antes de qualquer código)

1. `git init` na pasta `C:\Users\pc\OneDrive\Área de Trabalho\SENSE 2026\FONTE\Santiago EA\`
2. Commit de snapshot de todos os arquivos atuais (`SENSE.mq5`, `.mqh`, `.ex5`)
3. Verificar que painel-sense-desktop tem commit limpo (já tem git)

---

## 4. Arquivos Afetados

### Novos arquivos
| Arquivo | Localização | Responsabilidade |
|---------|-------------|------------------|
| `SENSE_FlowAdvanced.mqh` | `Santiago EA\` | Módulos: TapeSpeed, SpreadZ, CVol, Footprint, Absorção Real |
| `renderer-flow-advanced.js` | `painel-sense-desktop\` | Renderiza blocos de métricas avançadas no painel |
| `styles/semantic/0132-flow-advanced.css` | `painel-sense-desktop\` | Estilos neon dos novos blocos |

### Arquivos modificados
| Arquivo | Natureza da mudança |
|---------|---------------------|
| `SENSE_PtaxRealtime.mqh` | Fix loop 100k → `iBars` real (performance crítica) |
| `SENSE_RegimeTracker.mqh` | Basis como filtro direcional quando `curva_tensa` |
| `SENSE.mq5` | Cache de ticks, ZFlow híbrido, Z normalizado, OFI nocional, inclusão do novo .mqh, export JSON v7/v8 |
| `renderer-hud.js` | Consome novos campos `flowAdvanced` do JSON |
| `index.html` | Inclui `renderer-flow-advanced.js` após `renderer-hud.js` |
| `FORMATO_DASHBOARD.txt` | Documenta schema v7 e v8 |

---

## 5. Fase 1 — Performance e ZFlow Híbrido

### 5.1 Fix Loop VWAP (SENSE_PtaxRealtime.mqh)

**Problema:** loops `for(int i = 0; i < 100000; i++)` iterados 2× a cada ciclo de 250ms.

**Solução:** substituir o limite fixo pelo número real de barras disponíveis:
```mql5
int maxBars = MathMin(iBars(sym, PERIOD_M1), 600); // máx 10h de M1
for(int i = 0; i < maxBars; i++)
```
Aplicar nas funções `SensePtaxVwapFromBarTimeForward` e `SensePtaxVwapPreviousCalendarDay`.

**Impacto esperado:** redução de latência do OnTimer de ~30-50ms em horários de alta atividade.

### 5.2 Cache Global de Ticks (SENSE.mq5)

**Problema:** `CFlowZ::Update` e `HybridAggressorDeltaNormalized` chamam `CopyTicks` separadamente a cada timer — são dois pedidos ao servidor de dados por ciclo.

**Solução:** variáveis globais de cache preenchidas UMA vez por ciclo:
```mql5
MqlTick  g_tickCacheMini[];
int      g_tickCacheMiniSize = 0;
MqlTick  g_tickCacheRef[];
int      g_tickCacheRefSize  = 0;
datetime g_tickCacheLastT    = 0;
```

Função `SenseRefreshTickCache()` chamada no início do `OnTimer`. `CFlowZ::Update` e `HybridAggressorDeltaNormalized` recebem o array por referência.

**Impacto:** elimina uma chamada `CopyTicks` redundante a cada 250ms.

### 5.3 Janela ZFlow Híbrida (SENSE.mq5)

**Problema:** `ZFlow_WindowTicks = 200` é uma janela em quantidade de ticks. Às 09h30 pós-FOMC = ~3 segundos; às 14h lateral = ~2 minutos. O Z não é comparável entre períodos.

**Solução:** `CFlowZ::Update` aceita novo parâmetro `windowSec`. Usa a mesma lógica de união temporal já implementada em `HybridAggressorDeltaNormalized`: inclui ticks dentro da janela de tempo OU os últimos N ticks, o que for maior.

Novos inputs:
```mql5
input int ZFlow_WindowSec  = 15;  // janela temporal mínima (segundos)
// ZFlow_WindowTicks mantido como fallback mínimo de quantidade
```

### 5.4 Z Normalizado Intraday (SENSE.mq5)

**Problema:** o Z atual é um ratio simples `(volBuy - volSell) / total`. Não normaliza pelo comportamento histórico do dia.

**Solução:** buffer rolling de 60 amostras do ratio:
```mql5
double g_zRatioBufMini[60];
double g_zRatioBufRef[60];
int    g_zRatioBufIdx = 0;
int    g_zRatioBufN   = 0;
```

A cada timer, após calcular o ratio bruto, calcular μ e σ dos últimos N valores e expor:
```mql5
double g_zMiniNorm = 0.0; // (ratio - mu) / sigma
double g_zRefNorm  = 0.0;
```

Os limiares e lógica de gatilho existentes continuam usando o ratio original. O `g_zMiniNorm` é campo adicional exportado no JSON e exibido no painel.

---

## 6. Fase 2 — Módulos Avançados (SENSE_FlowAdvanced.mqh)

Todos os novos módulos vivem neste arquivo, incluído no final de `SENSE.mq5`:
```mql5
#include "SENSE_FlowAdvanced.mqh"
```

### 6.1 TapeSpeed

Mede velocidade do tape em ticks/s, comparada à média intraday.

```mql5
// Estado global (no .mqh)
int    g_tapeTickCount    = 0;
int    g_tapeTicksPerSec  = 0;
double g_tapeSpeedEma     = 0.0;
double g_tapeSpeedZ       = 0.0;
double g_tapeSpeedBuf[120]; // 2 min de amostras 1/s
```

**Cálculo:** a cada timer, contar novos ticks desde última leitura → ticks/s → atualizar buffer → calcular Z-score.

**Uso no gatilho:** quando `g_tapeSpeedZ > 2.0`, multiplicar peso da agressão no placar por 1.2 (acelaração = convicção).

**Export JSON:** `flowAdvanced.tapeSpeedZ`, `flowAdvanced.tapeTicksPerSec`.

### 6.2 SpreadZ Intraday

Mede o Z-score do spread atual vs. spread médio do dia.

```mql5
double g_spreadBuf[200];
int    g_spreadBufIdx = 0;
int    g_spreadBufN   = 0;
double g_spreadZ      = 0.0;
bool   g_spreadLiqAlert = false; // true quando spreadZ > 2.0
```

**Uso:** quando `g_spreadLiqAlert = true`, o painel exibe badge "LIQUIDEZ REDUZIDA" âmbar.

**Export JSON:** `flowAdvanced.spreadZ`, `flowAdvanced.spreadLiquidityAlert`.

### 6.3 Footprint por Vela M1

Acumuladores resetados a cada nova vela M1.

```mql5
double g_fpBuyVol   = 0.0;
double g_fpSellVol  = 0.0;
double g_fpDelta    = 0.0;
double g_fpDeltaNorm = 0.0;
// Vela anterior (para exibição)
double g_fpPrevBuyVol   = 0.0;
double g_fpPrevSellVol  = 0.0;
double g_fpPrevDelta    = 0.0;
double g_fpPrevDeltaNorm = 0.0;
```

**Detecção de esgotamento:** vela de alta com `g_fpPrevDeltaNorm < -0.15` → compradores enfraquecendo dentro da vela → flag `g_fpExaustionBuy = true`.

**Export JSON:** `flowAdvanced.footprint` com campos `buyVol`, `sellVol`, `delta`, `deltaNorm`, `exaustionBuy`, `exaustionSell`.

### 6.4 Absorção Real (Delta × ΔPreço)

**Condição de absorção real:**
- Alto volume agressivo de um lado: `|deltaNorm| > 0.55`
- Baixo deslocamento de preço: `|deltaPreco| < limiar_pts` (configurável via input)
- Book do lado contrário sustentado

```mql5
input double Absorcao_Real_DeltaNorm_Min = 0.55; // volume mínimo para considerar
input double Absorcao_Real_MaxMovePts   = 2.0;   // movimento máximo de preço

bool g_absorpRealBuy  = false; // alta venda + baixo movimento = buyers absorbing
bool g_absorpRealSell = false;
double g_absorpRealDeltaAbs  = 0.0;
double g_absorpRealPriceMove = 0.0;
```

**Export JSON:** `flowAdvanced.absorptionReal.buy`, `.sell`, `.deltaAbs`, `.priceMove`.

### 6.5 OFI Ponderado por Nocional (SENSE.mq5)

**Problema atual:** `UpdateGatilhoMicrostructure` combina mini e ref com média simples `(wbM + wbR) * 0.5`. DOL tem nocional 5× WDO.

**Solução:** detectar automaticamente qual é mini e qual é ref pelo nome do símbolo, aplicar peso 5:1:
```mql5
double nocionFatorRef = 1.0;
if(StringFind(refSym, "DOL", 0) == 0) nocionFatorRef = 5.0;
if(StringFind(refSym, "WDO", 0) == 0) nocionFatorRef = 1.0;

double wTotal = 1.0 + nocionFatorRef;
wb = (wbM + wbR * nocionFatorRef) / wTotal;
wa = (waM + waR * nocionFatorRef) / wTotal;
```

**Export JSON:** `flowAdvanced.ofiNocional.wBid`, `.wAsk`, `.ema`, `.pctBid`, `.fatorRef`.

### 6.6 Basis como Filtro Direcional (SENSE_RegimeTracker.mqh)

**Quando `codigo == "curva_tensa"` e `basisZ > 1.5`:**
- `basisZ > 0` (DOL acima da média): WDO tende a convergir subindo → reforça lado comprador
- `basisZ < 0` (DOL abaixo da média): WDO tende a cair → reforça lado vendedor

**Novo campo no JSON de regime:**
```json
"basisDirecional": "compra" | "venda" | "neutro"
```

O painel exibe badge "BASIS FAVORECE COMPRA/VENDA" quando ativo.

---

## 7. Schema JSON — Novos Campos

### Schema v7 (Fase 1)

Adicionado ao objeto raiz:
```json
"flowAdvanced": {
  "schemaFlowAdv": 1,
  "zMiniNorm": 0.72,
  "zRefNorm": 0.61,
  "tapeSpeedZ": 1.3,
  "tapeTicksPerSec": 8,
  "spreadZ": 0.4,
  "spreadLiquidityAlert": false
}
```

### Schema v8 (Fase 2)

Amplia `flowAdvanced`:
```json
"flowAdvanced": {
  "schemaFlowAdv": 2,
  "zMiniNorm": 0.72,
  "zRefNorm": 0.61,
  "tapeSpeedZ": 1.3,
  "tapeTicksPerSec": 8,
  "spreadZ": 0.4,
  "spreadLiquidityAlert": false,
  "footprint": {
    "buyVol": 142,
    "sellVol": 98,
    "delta": 44,
    "deltaNorm": 0.18,
    "exaustionBuy": false,
    "exaustionSell": false
  },
  "absorptionReal": {
    "buy": false,
    "sell": true,
    "deltaAbs": 0.72,
    "priceMove": 0.8
  },
  "ofiNocional": {
    "wBid": 1840.0,
    "wAsk": 1220.0,
    "ema": 0.14,
    "pctBid": 60.1,
    "fatorRef": 5.0
  }
}
```

O campo `regimeMercado.basisDirecional` é adicionado ao objeto de regime existente.

---

## 8. Painel Electron — Mudanças de UI

### 8.1 renderer-flow-advanced.js

Três funções exportadas para `window`:

**`renderFlowAdvancedBlock(d)`**
- Exibe Z mini/ref normalizado com barra de progresso
- Exibe TapeSpeed com cor neon (verde se Z > 2.0, âmbar se 1-2, cinza abaixo)
- Exibe SpreadZ com badge "LIQUIDEZ REDUZIDA" âmbar quando alerta ativo

**`renderFootprintBlock(d)`**
- Barras horizontais: volume compra (verde) vs. venda (vermelho) da vela anterior
- Delta normalizado com seta direcionada
- Badge "ESGOTAMENTO COMPRA/VENDA" quando flag ativa

**`renderAbsorptionRealBlock(d)`**
- Substitui a heurística atual por dados diretos do EA
- Mostra `|Delta| vs. ΔPreço` quando absorção detectada
- Cor âmbar para absorção compradora, roxo para vendedora (diferente do resto)

### 8.2 styles/semantic/0132-flow-advanced.css

Paleta alinhada ao design atual:
```css
--flow-adv-tape-hot:     #00ff88;  /* verde neon: tape acelerado */
--flow-adv-tape-warm:    #ffb300;  /* âmbar: tape moderado */
--flow-adv-spread-alert: #ffb300;  /* âmbar: liquidez reduzida */
--flow-adv-absorb-buy:   #00cfff;  /* azul neon: absorção compradora */
--flow-adv-absorb-sell:  #cc44ff;  /* roxo: absorção vendedora */
--flow-adv-exhaust:      #ff4444;  /* vermelho: esgotamento */
```

### 8.3 Integração em renderer-hud.js

Chamadas adicionadas ao bloco que já monta o HUD:
```javascript
// No final da função renderHudPanel(d):
if (d.flowAdvanced) {
  html += renderFlowAdvancedBlock(d);
  if (d.flowAdvanced.footprint) html += renderFootprintBlock(d);
  if (d.flowAdvanced.absorptionReal) html += renderAbsorptionRealBlock(d);
}
```

---

## 9. Compatibilidade e Retrocompatibilidade

- `flowAdvanced` é opcional no JSON: se ausente, o painel não renderiza os novos blocos (sem erro)
- `schemaFlowAdv` dentro de `flowAdvanced` permite versionamento interno do bloco
- Todos os campos novos têm fallback de exibição `—` quando ausentes
- `schemaVersion` do JSON raiz sobe de 6 → 7 (Fase 1) → 8 (Fase 2)

---

## 10. Ordem de Implementação

### Fase 1
1. `git init` + snapshot EA
2. Fix `SENSE_PtaxRealtime.mqh` (loop)
3. Cache de ticks em `SENSE.mq5`
4. ZFlow híbrido em `CFlowZ::Update`
5. Z normalizado (buffer rolling 60 amostras)
6. Export JSON v7 (`flowAdvanced.schemaFlowAdv = 1`)
7. `renderer-flow-advanced.js` (bloco Z-norm + TapeSpeed + SpreadZ)
8. CSS `0132-flow-advanced.css`
9. Integração em `index.html` + `renderer-hud.js`
10. Atualizar `FORMATO_DASHBOARD.txt`
11. Commit painel + EA

### Fase 2
12. `SENSE_FlowAdvanced.mqh` completo (TapeSpeed, SpreadZ, Footprint, Absorção Real)
13. Fix OFI nocional em `UpdateGatilhoMicrostructure`
14. Fix basis direcional em `SENSE_RegimeTracker.mqh`
15. Export JSON v8 (todos os novos campos)
16. Completar `renderer-flow-advanced.js` (Footprint + Absorção Real)
17. Completar CSS
18. Commit final

---

## 11. Critérios de Sucesso

- SENSE.mq5 compila sem erros no MetaEditor
- Timer de 250ms não ultrapassa 50ms de processamento em condições normais
- Painel Electron carrega sem erros no console
- Todos os novos campos do JSON têm representação visual no painel
- Lógica de gatilho existente funciona idêntica ao estado anterior (nenhuma regressão)
