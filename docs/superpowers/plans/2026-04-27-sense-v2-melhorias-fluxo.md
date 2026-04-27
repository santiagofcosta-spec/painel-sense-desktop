# SENSE v2.0 — Melhorias de Fluxo e Agressão — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir gargalos de performance no EA MQL5 e adicionar 6 novos módulos de análise de fluxo (TapeSpeed, SpreadZ, Z-norm, Footprint, Absorção Real, OFI Nocional), refletindo tudo no painel Electron.

**Architecture:** Fase 1 corrige performance + adiciona Z normalizado → export JSON v9. Fase 2 cria SENSE_FlowAdvanced.mqh com os novos módulos → export JSON v10. O painel lê os novos campos do JSON e renderiza via renderer-flow-advanced.js.

**Tech Stack:** MQL5 (MetaEditor 5), Electron 33, JavaScript CommonJS, CSS3.

---

## Caminhos de referência rápida

- EA: `C:\Users\pc\OneDrive\Área de Trabalho\SENSE 2026\FONTE\Santiago EA\`
- Painel: `C:\Users\pc\OneDrive\Área de Trabalho\Código Sense\painel-sense-desktop\`
- Verificação EA: compilar com F7 no MetaEditor — deve mostrar 0 erros, 0 avisos críticos
- Verificação painel: `npm start` na pasta do painel — sem erros no console

---

## FASE 1 — Performance + ZFlow Híbrido + Z Normalizado

---

### Task 1: Git init + snapshot da pasta EA

**Files:**
- Modify: pasta `Santiago EA\` (init git)

- [ ] **Step 1: Inicializar git e commitar snapshot**

```bash
cd "C:/Users/pc/OneDrive/Área de Trabalho/SENSE 2026/FONTE/Santiago EA"
git init
git add SENSE.mq5 SENSE_PtaxRealtime.mqh SENSE_RegimeTracker.mqh SENSE_DashboardExportGuard.mqh
git commit -m "snapshot: estado original antes das melhorias SENSE v2.0"
```

Saída esperada: `[master (root-commit) XXXXXXX] snapshot: estado original...`

---

### Task 2: Fix loops VWAP em SENSE_PtaxRealtime.mqh

**Files:**
- Modify: `Santiago EA\SENSE_PtaxRealtime.mqh` (linhas 22 e 81)

- [ ] **Step 1: Corrigir o loop em `SensePtaxVwapFromBarTimeForward` (linha ~22)**

Localizar:
```mql5
   for(int i = 0; i < 100000; i++)
     {
      datetime ti = iTime(sym, PERIOD_M1, i);
      if(ti == 0)
         break;
      if(ti < tStart)
         break;
```

Substituir por:
```mql5
   int _maxBars = MathMin(iBars(sym, PERIOD_M1), 600);
   for(int i = 0; i < _maxBars; i++)
     {
      datetime ti = iTime(sym, PERIOD_M1, i);
      if(ti == 0)
         break;
      if(ti < tStart)
         break;
```

- [ ] **Step 2: Corrigir o loop do fallback sem volume na mesma função (linha ~45)**

Logo abaixo, localizar o segundo loop `for(int j = 0; j < 100000; j++)` na mesma função:
```mql5
      for(int j = 0; j < 100000; j++)
        {
         datetime tj = iTime(sym, PERIOD_M1, j);
         if(tj == 0)
            break;
         if(tj < tStart)
            break;
```

Substituir por:
```mql5
      int _maxBarsF = MathMin(iBars(sym, PERIOD_M1), 600);
      for(int j = 0; j < _maxBarsF; j++)
        {
         datetime tj = iTime(sym, PERIOD_M1, j);
         if(tj == 0)
            break;
         if(tj < tStart)
            break;
```

- [ ] **Step 3: Corrigir os dois loops em `SensePtaxVwapPreviousCalendarDay` (linha ~81)**

Localizar os dois `for(int i = 0; i < 100000; i++)` em `SensePtaxVwapPreviousCalendarDay` e substituir ambos exatamente igual ao passo acima — usar `_maxBarsD` e `_maxBarsDf` como nomes de variável para evitar conflito.

```mql5
   int _maxBarsD = MathMin(iBars(sym, PERIOD_M1), 600);
   for(int i = 0; i < _maxBarsD; i++)
```

```mql5
      int _maxBarsDf = MathMin(iBars(sym, PERIOD_M1), 600);
      for(int j = 0; j < _maxBarsDf; j++)
```

- [ ] **Step 4: Compilar SENSE.mq5 no MetaEditor (F7) e confirmar 0 erros**

---

### Task 3: Adicionar cache global de ticks em SENSE.mq5

**Files:**
- Modify: `Santiago EA\SENSE.mq5` (após linha ~5038 e nova função antes de OnTimer)

- [ ] **Step 1: Adicionar globais do cache após `g_makerAskPctRef = 0.0;`**

Localizar este bloco (linha ~5036):
```mql5
double g_makerBidPctRef  = 0.0;
double g_makerAskPctRef  = 0.0;
```

Adicionar logo após:
```mql5
// ── Cache de ticks (preenchido uma vez por ciclo OnTimer) ──────────────────
MqlTick  g_tcMini[];
int      g_tcMiniN = 0;
MqlTick  g_tcRef[];
int      g_tcRefN  = 0;
```

- [ ] **Step 2: Adicionar função `SenseRefreshTickCache` antes de `OnTimer`**

Localizar `void OnTimer()` (linha ~5780) e inserir ANTES dela:

```mql5
void SenseRefreshTickCache(const string symMini, const string symRef)
  {
   int copyN = Delta_Hybrid_Copy_Ticks;
   if(copyN < ZFlow_WindowTicks * 4)
      copyN = ZFlow_WindowTicks * 4;
   if(copyN < 1000)
      copyN = 1000;
   if(copyN > 20000)
      copyN = 20000;

   g_tcMiniN = CopyTicks(symMini, g_tcMini, COPY_TICKS_ALL, 0, (uint)copyN);
   if(g_tcMiniN < 0)
      g_tcMiniN = 0;

   if(symRef != symMini)
     {
      g_tcRefN = CopyTicks(symRef, g_tcRef, COPY_TICKS_ALL, 0, (uint)copyN);
      if(g_tcRefN < 0)
         g_tcRefN = 0;
     }
   else
     {
      g_tcRefN = g_tcMiniN;
      ArrayResize(g_tcRef, g_tcMiniN);
      ArrayCopy(g_tcRef, g_tcMini, 0, 0, g_tcMiniN);
     }
  }
```

- [ ] **Step 3: Compilar (F7) — 0 erros**

---

### Task 4: Adicionar `CFlowZ::UpdateFromCache` e input `ZFlow_WindowSec`

**Files:**
- Modify: `Santiago EA\SENSE.mq5` (dentro da classe `CFlowZ` ~linha 548, e seção de inputs ~linha 173)

- [ ] **Step 1: Adicionar input `ZFlow_WindowSec` próximo ao input `ZFlow_WindowTicks`**

Localizar (linha ~173):
```mql5
input int    ZFlow_WindowTicks = 200;                     // Quantidade de ticks usados no fluxo
```

Adicionar após:
```mql5
input int    ZFlow_WindowSec   = 15;   // Janela temporal mínima do ZFlow (s); complementa WindowTicks
```

- [ ] **Step 2: Adicionar método `UpdateFromCache` na classe `CFlowZ`**

Localizar o final do método `GetMakerAskPct` dentro de `CFlowZ` (linha ~658). Adicionar logo antes do `};` de fechamento da classe:

```mql5
   void UpdateFromCache(const MqlTick &cache[], const int cacheN,
                        const int wTicks, const int wSec)
     {
      Reset();
      if(cacheN <= 0)
         return;

      // Janela híbrida: últimos wTicks OU ticks dentro de wSec (o que for mais abrangente)
      datetime cutoff = TimeCurrent() - (datetime)(wSec > 0 ? wSec : 999999);
      int startByCount = (wTicks > 0 && cacheN > wTicks) ? (cacheN - wTicks) : 0;

      // Encontra o índice mais antigo dentro da janela de tempo
      int startByTime = 0;
      for(int i = cacheN - 1; i >= 0; i--)
        {
         if(cache[i].time < cutoff)
           {
            startByTime = i + 1;
            break;
           }
        }

      // União: começa no índice mais cedo dos dois critérios
      int start = MathMin(startByCount, startByTime);
      if(start < 0)
         start = 0;

      double volBuyTest  = 0.0;
      double volSellTest = 0.0;

      for(int i = start; i < cacheN; i++)
        {
         double price = (cache[i].last > 0.0) ? cache[i].last :
                        (cache[i].ask  > 0.0 ? cache[i].ask  :
                         (cache[i].bid > 0.0 ? cache[i].bid  : 0.0));
         double vol   = cache[i].volume;

         if(price == 0.0 || vol <= 0.0)
           {
            if(price > 0.0)
               m_lastPrice = price;
            continue;
           }

         uint fl       = cache[i].flags;
         bool aggrBuy  = ((fl & TICK_FLAG_BUY)  != 0);
         bool aggrSell = ((fl & TICK_FLAG_SELL) != 0);

         if(aggrBuy && !aggrSell)
            m_volAggrBuy += vol;
         else if(aggrSell && !aggrBuy)
            m_volAggrSell += vol;
         else
           {
            if(m_lastPrice > 0.0)
              {
               if(price > m_lastPrice)  m_volAggrBuy  += vol;
               else if(price < m_lastPrice) m_volAggrSell += vol;
              }
           }

         if(m_lastPrice > 0.0)
           {
            if(price > m_lastPrice)      volBuyTest  += vol;
            else if(price < m_lastPrice) volSellTest += vol;
           }

         m_lastPrice = price;
        }

      m_volBuy  = volBuyTest;
      m_volSell = volSellTest;
     }
```

- [ ] **Step 3: Compilar (F7) — 0 erros**

---

### Task 5: Z normalizado intraday

**Files:**
- Modify: `Santiago EA\SENSE.mq5` (após declarações `g_zMini`, nova função antes de `OnTimer`)

- [ ] **Step 1: Adicionar globais do buffer de normalização**

Localizar (linha ~5025):
```mql5
double g_zMini      = 0.0;
double g_zMiniAsym  = 0.0;
double g_zMiniPrev  = 0.0;
```

Adicionar após `g_zRefPrev = 0.0;`:
```mql5
// ── Z normalizado intraday (buffer rolling 60 amostras) ───────────────────
#define ZNORM_CAP 60
double g_znValsMini[ZNORM_CAP];
double g_znValsRef[ZNORM_CAP];
int    g_znIdxMini = 0, g_znIdxRef  = 0;
int    g_znNMini   = 0, g_znNRef    = 0;
double g_zMiniNorm = 0.0;
double g_zRefNorm  = 0.0;
```

- [ ] **Step 2: Adicionar função `SenseZNormPush` antes de `OnTimer`**

Inserir após `SenseRefreshTickCache` (adicionada na Task 3):

```mql5
void SenseZNormPush(const double z, double &buf[], const int cap,
                    int &idx, int &n, double &outNorm)
  {
   buf[idx] = z;
   idx = (idx + 1) % cap;
   if(n < cap)
      n++;
   if(n < 5)
     {
      outNorm = z;
      return;
     }
   double sumV = 0.0, sumV2 = 0.0;
   for(int i = 0; i < n; i++)
     {
      sumV  += buf[i];
      sumV2 += buf[i] * buf[i];
     }
   double mu  = sumV / (double)n;
   double var = sumV2 / (double)n - mu * mu;
   if(var < 0.0)
      var = 0.0;
   double sg = MathSqrt(var);
   outNorm = (sg < 1e-9) ? 0.0 : (z - mu) / (sg + 1e-9);
  }
```

- [ ] **Step 3: Compilar (F7) — 0 erros**

---

### Task 6: Wiring em OnTimer — usar cache + chamar Z normalizado

**Files:**
- Modify: `Santiago EA\SENSE.mq5` (bloco `if(Use_ZFlow)` em OnTimer, linhas ~5849-5863)

- [ ] **Step 1: Substituir as duas chamadas `Update` por `UpdateFromCache` e adicionar cache + znorm**

Localizar dentro de `OnTimer`, no bloco `if(Use_ZFlow)`:
```mql5
      g_zMiniPrev = g_zMiniAsym;
      g_flowMini.Update(_Symbol, ZFlow_WindowTicks);
      g_zMini     = g_flowMini.GetZFlow();
      g_zMiniAsym = g_flowMini.GetZFlowAsym(g_trendDir);

      if(Use_Ref_Fluxo)
        {
         string refSym = RefFluxoEffective(_Symbol);
         g_zRefPrev = g_zRefAsym;
         g_flowRef.Update(refSym, ZFlow_WindowTicks);
         g_zRef     = g_flowRef.GetZFlow();
         g_zRefAsym = g_flowRef.GetZFlowAsym(g_trendDir);
        }
```

Substituir por:
```mql5
      const string _symRef = RefFluxoEffective(_Symbol);
      // Preenche cache de ticks uma única vez por ciclo
      SenseRefreshTickCache(_Symbol, _symRef);

      g_zMiniPrev = g_zMiniAsym;
      g_flowMini.UpdateFromCache(g_tcMini, g_tcMiniN, ZFlow_WindowTicks, ZFlow_WindowSec);
      g_zMini     = g_flowMini.GetZFlow();
      g_zMiniAsym = g_flowMini.GetZFlowAsym(g_trendDir);
      SenseZNormPush(g_zMini, g_znValsMini, ZNORM_CAP, g_znIdxMini, g_znNMini, g_zMiniNorm);

      if(Use_Ref_Fluxo)
        {
         g_zRefPrev = g_zRefAsym;
         g_flowRef.UpdateFromCache(g_tcRef, g_tcRefN, ZFlow_WindowTicks, ZFlow_WindowSec);
         g_zRef     = g_flowRef.GetZFlow();
         g_zRefAsym = g_flowRef.GetZFlowAsym(g_trendDir);
         SenseZNormPush(g_zRef, g_znValsRef, ZNORM_CAP, g_znIdxRef, g_znNRef, g_zRefNorm);
        }
      else
        {
         g_zRefNorm = 0.0;
        }
```

- [ ] **Step 2: Substituir a chamada de `HybridAggressorDeltaNormalized` em `ShowZFlowOnChart` para usar o cache**

Localizar em `ShowZFlowOnChart` (~linha 4962):
```mql5
      double nrm = HybridAggressorDeltaNormalized(_Symbol, Delta_Hybrid_Window_Sec, Delta_Hybrid_Max_Trades, copyN, bV, sV);
```

Substituir por:
```mql5
      double nrm;
      if(g_tcMiniN > 0)
         nrm = HybridAggressorDeltaNormalizedCached(g_tcMini, g_tcMiniN,
                  Delta_Hybrid_Window_Sec, Delta_Hybrid_Max_Trades, bV, sV);
      else
         nrm = HybridAggressorDeltaNormalized(_Symbol, Delta_Hybrid_Window_Sec,
                  Delta_Hybrid_Max_Trades, copyN, bV, sV);
```

- [ ] **Step 3: Adicionar função `HybridAggressorDeltaNormalizedCached` antes de `ShowZFlowOnChart`**

Inserir antes da declaração `void ShowZFlowOnChart(...)`:

```mql5
// Versão com cache pré-carregado — evita segundo CopyTicks por ciclo
double HybridAggressorDeltaNormalizedCached(const MqlTick &cache[], const int cacheN,
                                             const int windowSec, const int maxTrades,
                                             double &outBuyVol, double &outSellVol)
  {
   outBuyVol  = 0.0;
   outSellVol = 0.0;
   if(cacheN <= 0 || maxTrades <= 0)
      return 0.0;

   datetime cutoff  = TimeCurrent() - (datetime)windowSec;
   int      startK  = cacheN - maxTrades;
   if(startK < 0)
      startK = 0;

   double m_lastPrice = 0.0;
   for(int i = 0; i < cacheN; i++)
     {
      double price = (cache[i].last > 0.0) ? cache[i].last :
                     (cache[i].ask  > 0.0 ? cache[i].ask  :
                      (cache[i].bid > 0.0 ? cache[i].bid  : 0.0));
      double vol   = cache[i].volume;
      bool inTime  = (cache[i].time >= cutoff);
      bool inLastK = (i >= startK);

      if(price == 0.0 || vol <= 0.0)
        {
         if(price > 0.0)
            m_lastPrice = price;
         continue;
        }

      uint fl       = cache[i].flags;
      bool aggrBuy  = ((fl & TICK_FLAG_BUY)  != 0);
      bool aggrSell = ((fl & TICK_FLAG_SELL) != 0);

      if(inTime || inLastK)
        {
         if(aggrBuy && !aggrSell)
            outBuyVol += vol;
         else if(aggrSell && !aggrBuy)
            outSellVol += vol;
         else if(m_lastPrice > 0.0)
           {
            if(price > m_lastPrice)      outBuyVol  += vol;
            else if(price < m_lastPrice) outSellVol += vol;
           }
        }
      m_lastPrice = price;
     }

   double total = outBuyVol + outSellVol;
   if(total <= 0.0)
      return 0.0;
   double n = (outBuyVol - outSellVol) / total;
   if(n >  1.0) n =  1.0;
   if(n < -1.0) n = -1.0;
   return n;
  }
```

- [ ] **Step 4: Compilar (F7) — 0 erros**

---

### Task 7: Export schema v9 com bloco `flowAdvanced` (Fase 1)

**Files:**
- Modify: `Santiago EA\SENSE.mq5` (função `SenseDashboardExportWriteJson`, linhas ~3114-3216)

- [ ] **Step 1: Atualizar `schemaVersion` de 8 para 9**

Localizar (linha ~3115):
```mql5
   json += "\"schemaVersion\":8,";
```

Substituir por:
```mql5
   json += "\"schemaVersion\":9,";
```

- [ ] **Step 2: Construir `flowAdvPart` e inserir no JSON**

Localizar a seção que monta `ptaxPart` e `regimePart` (~linha 3206):
```mql5
   string ptaxPart = "";
   if(Dashboard_Ptax_Enable && StringLen(Dashboard_Ptax_Symbol) >= 2)
     {
```

Inserir ANTES dessa linha:

```mql5
   // ── flowAdvanced v1 (Z normalizado + TapeSpeed stub) ──────────────────
   string flowAdvPart = "";
   if(Use_ZFlow)
     {
      string _fa = "{";
      _fa += "\"schemaFlowAdv\":1";
      _fa += ",\"zMiniNorm\":"  + DoubleToString(g_zMiniNorm, 4);
      _fa += ",\"zRefNorm\":"   + DoubleToString(g_zRefNorm,  4);
      _fa += "}";
      flowAdvPart = ",\"flowAdvanced\":" + _fa;
     }
```

- [ ] **Step 3: Adicionar `flowAdvPart` na linha de montagem final do JSON**

Localizar (linha ~3216):
```mql5
   json += "\"levels\":[" + levelsJson + "]" + regimePart + ptaxPart + ",\"meta\":{";
```

Substituir por:
```mql5
   json += "\"levels\":[" + levelsJson + "]" + regimePart + ptaxPart + flowAdvPart + ",\"meta\":{";
```

- [ ] **Step 4: Compilar (F7) — 0 erros**

---

### Task 8: Compilar e verificar EA Fase 1

**Files:** (nenhum — apenas verificação)

- [ ] **Step 1: Abrir MetaEditor, abrir `SENSE.mq5`, pressionar F7**

Saída esperada: aba "Erros" mostra `0 erros, 0 avisos` (avisos de obsolescência são OK).

- [ ] **Step 2: Verificar no MT5 que o EA carrega sem mensagem de erro no Experts**

No MetaTrader 5: recarregar o EA no gráfico WDO. Verificar aba "Experts" — deve aparecer `SENSE OnInit OK`.

- [ ] **Step 3: Verificar no dashboard.json que o campo `flowAdvanced` aparece**

Abrir `MQL5\Files\dashboard.json` em qualquer editor de texto. Confirmar:
```json
"flowAdvanced":{"schemaFlowAdv":1,"zMiniNorm":...,"zRefNorm":...}
```

---

### Task 9: Commit EA Fase 1

**Files:** `Santiago EA\` (git commit)

- [ ] **Step 1: Commit**

```bash
cd "C:/Users/pc/OneDrive/Área de Trabalho/SENSE 2026/FONTE/Santiago EA"
git add SENSE.mq5 SENSE_PtaxRealtime.mqh
git commit -m "perf: cache de ticks + ZFlow híbrido + Z normalizado (SENSE v2.0 Fase 1)

- Fix loops VWAP de 100k para iBars (máx 600 barras M1)
- Cache global de ticks: elimina CopyTicks duplicado por ciclo
- CFlowZ::UpdateFromCache: janela híbrida (tempo + contagem)
- HybridAggressorDeltaNormalizedCached: usa cache pré-carregado
- Z normalizado intraday (rolling 60 amostras): g_zMiniNorm, g_zRefNorm
- Export JSON schemaVersion 9 com bloco flowAdvanced

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 10: Criar renderer-flow-advanced.js (Fase 1)

**Files:**
- Create: `painel-sense-desktop\renderer-flow-advanced.js`

- [ ] **Step 1: Criar o arquivo**

```javascript
/**
 * renderer-flow-advanced.js
 * Blocos avançados de fluxo: Z normalizado, TapeSpeed, SpreadZ (Fase 1)
 * e Footprint + Absorção Real (Fase 2, adicionados em tasks posteriores).
 * Depende de: renderer-utils.js (escapeHtml, fmtNum).
 * Carregar depois de renderer-hud.js (ver index.html).
 */
(function () {
  "use strict";
  if (typeof escapeHtml !== "function") {
    throw new Error("SENSE: falta renderer-utils.js antes de renderer-flow-advanced.js.");
  }
})();

// ── Helpers de classe CSS ─────────────────────────────────────────────────

function flowAdvZNormClass(v) {
  if (v == null || !Number.isFinite(v)) return "flow-adv--neutro";
  const a = Math.abs(v);
  if (a < 0.5) return "flow-adv--neutro";
  if (a < 1.5)  return v > 0 ? "flow-adv--buy-weak"  : "flow-adv--sell-weak";
  if (a < 2.5)  return v > 0 ? "flow-adv--buy-mid"   : "flow-adv--sell-mid";
  return v > 0 ? "flow-adv--buy-hot" : "flow-adv--sell-hot";
}

function flowAdvTapeClass(z) {
  if (!Number.isFinite(z) || Math.abs(z) < 0.5) return "flow-adv-tape--idle";
  if (Math.abs(z) < 1.0) return "flow-adv-tape--warm";
  if (Math.abs(z) < 2.0) return "flow-adv-tape--hot";
  return "flow-adv-tape--blast";
}

// ── Linhas individuais ────────────────────────────────────────────────────

function renderZNormRow(label, value) {
  const v   = Number.isFinite(Number(value)) ? Number(value) : null;
  const cls = flowAdvZNormClass(v);
  const txt = v != null ? (v > 0 ? "+" : "") + v.toFixed(2) : "—";
  return `<div class="flow-adv-row ${escapeHtml(cls)}">` +
    `<span class="flow-adv-k">${escapeHtml(label)}</span>` +
    `<span class="flow-adv-v">${escapeHtml(txt)}</span>` +
    `</div>`;
}

function renderTapeSpeedRow(fa) {
  const z   = fa.tapeSpeedZ != null ? Number(fa.tapeSpeedZ) : null;
  const tps = fa.tapeTicksPerSec != null ? Number(fa.tapeTicksPerSec) : null;
  const cls = flowAdvTapeClass(z != null && Number.isFinite(z) ? z : 0);
  const zTxt  = (z != null && Number.isFinite(z)) ? (z > 0 ? "+" : "") + z.toFixed(1) : "—";
  const tpsTxt = (tps != null && Number.isFinite(tps)) ? " · " + Math.round(tps) + " tk/s" : "";
  return `<div class="flow-adv-row flow-adv-tape ${escapeHtml(cls)}">` +
    `<span class="flow-adv-k">TAPE VEL</span>` +
    `<span class="flow-adv-v">Z ${escapeHtml(zTxt)}${escapeHtml(tpsTxt)}</span>` +
    `</div>`;
}

function renderSpreadZRow(fa) {
  const z     = fa.spreadZ != null ? Number(fa.spreadZ) : null;
  const alert = !!fa.spreadLiquidityAlert;
  const zTxt  = (z != null && Number.isFinite(z)) ? (z > 0 ? "+" : "") + z.toFixed(1) : "—";
  const cls   = alert ? "flow-adv-row flow-adv-spread--alert" : "flow-adv-row flow-adv-spread--ok";
  return `<div class="${escapeHtml(cls)}">` +
    `<span class="flow-adv-k">SPREAD Z</span>` +
    `<span class="flow-adv-v">${escapeHtml(zTxt)}${alert ? " ⚠ LIQ.REDUZ." : ""}</span>` +
    `</div>`;
}

// ── Bloco principal Fase 1 ────────────────────────────────────────────────

function renderFlowAdvancedBlock(d) {
  const fa = d && d.flowAdvanced;
  if (!fa || typeof fa !== "object") return "";

  let html = '<div class="flow-adv-block">';
  html += '<div class="flow-adv-title">FLUXO AVANÇADO</div>';
  if (fa.zMiniNorm != null) html += renderZNormRow("Z MINI NORM", fa.zMiniNorm);
  if (fa.zRefNorm  != null) html += renderZNormRow("Z REF NORM",  fa.zRefNorm);
  if (fa.tapeSpeedZ != null) html += renderTapeSpeedRow(fa);
  if (fa.spreadZ    != null) html += renderSpreadZRow(fa);
  html += "</div>";
  return html;
}

// ── Bloco Footprint M1 (Fase 2 — função criada vazia, preenchida na Task 23) ──

function renderFootprintBlock(d) {
  const fa = d && d.flowAdvanced;
  const fp = fa && fa.footprint;
  if (!fp || typeof fp !== "object") return "";

  const buy  = Number.isFinite(Number(fp.buyVol))  ? Number(fp.buyVol)  : 0;
  const sell = Number.isFinite(Number(fp.sellVol)) ? Number(fp.sellVol) : 0;
  const tot  = buy + sell;
  const buyPct  = tot > 0 ? Math.round(100 * buy  / tot) : 50;
  const sellPct = tot > 0 ? Math.round(100 * sell / tot) : 50;
  const dn      = Number.isFinite(Number(fp.deltaNorm)) ? Number(fp.deltaNorm) : 0;
  const dnTxt   = (dn >= 0 ? "+" : "") + dn.toFixed(2);
  const exB = !!fp.exaustionBuy;
  const exS = !!fp.exaustionSell;

  let html = '<div class="flow-adv-block">';
  html += '<div class="flow-adv-title">FOOTPRINT M1</div>';
  html += `<div class="flow-adv-row">` +
    `<span class="flow-adv-k">C/V vela ant.</span>` +
    `<span class="flow-adv-v">` +
    `<span class="flow-adv-fp-buy">${buyPct}%</span>` +
    `<span class="flow-adv-fp-sep"> | </span>` +
    `<span class="flow-adv-fp-sell">${sellPct}%</span>` +
    ` <span class="flow-adv-fp-delta">Δ${escapeHtml(dnTxt)}</span>` +
    `</span></div>`;
  if (exB) html += `<div class="flow-adv-row"><span class="flow-adv-exhaust">⚡ ESGOT. COMPRA</span></div>`;
  if (exS) html += `<div class="flow-adv-row"><span class="flow-adv-exhaust">⚡ ESGOT. VENDA</span></div>`;
  html += "</div>";
  return html;
}

// ── Bloco Absorção Real (Fase 2 — criado vazio, preenchido na Task 23) ────

function renderAbsorptionRealBlock(d) {
  const fa = d && d.flowAdvanced;
  const ar = fa && fa.absorptionReal;
  if (!ar || typeof ar !== "object" || (!ar.buy && !ar.sell)) return "";

  const deltaAbs  = Number.isFinite(Number(ar.deltaAbs))  ? Number(ar.deltaAbs).toFixed(2)  : "—";
  const priceMove = Number.isFinite(Number(ar.priceMove)) ? Number(ar.priceMove).toFixed(1) + " pts" : "—";
  const side = ar.buy ? "COMPRA" : "VENDA";
  const cls  = ar.buy ? "flow-adv-absorb--buy" : "flow-adv-absorb--sell";

  return `<div class="flow-adv-block ${escapeHtml(cls)}">` +
    `<div class="flow-adv-title">ABSORÇÃO REAL</div>` +
    `<div class="flow-adv-row">` +
    `<span class="flow-adv-k">ABSORÇÃO ${escapeHtml(side)}</span>` +
    `<span class="flow-adv-v">Δ ${escapeHtml(deltaAbs)} · mv ${escapeHtml(priceMove)}</span>` +
    `</div></div>`;
}
```

---

### Task 11: Criar 0132-flow-advanced.css

**Files:**
- Create: `painel-sense-desktop\styles\semantic\0132-flow-advanced.css`

- [ ] **Step 1: Criar o arquivo CSS**

```css
/* 0132-flow-advanced.css — Blocos de fluxo avançado */

.flow-adv-block {
  margin-top: 6px;
  padding: 5px 8px;
  border-left: 2px solid rgba(255,255,255,0.08);
  background: rgba(0,0,0,0.18);
  border-radius: 3px;
}

.flow-adv-title {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.07em;
  color: rgba(255,255,255,0.30);
  text-transform: uppercase;
  margin-bottom: 3px;
}

.flow-adv-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 11px;
  line-height: 1.55;
}

.flow-adv-k { color: rgba(255,255,255,0.42); flex-shrink: 0; margin-right: 6px; font-size: 10px; }
.flow-adv-v { font-weight: 600; color: rgba(255,255,255,0.70); }

/* Z normalizado */
.flow-adv--neutro    .flow-adv-v { color: rgba(255,255,255,0.50); }
.flow-adv--buy-weak  .flow-adv-v { color: #66ffaa; }
.flow-adv--buy-mid   .flow-adv-v { color: #00ff88; }
.flow-adv--buy-hot   .flow-adv-v { color: #00ffcc; text-shadow: 0 0 6px rgba(0,255,204,0.50); }
.flow-adv--sell-weak .flow-adv-v { color: #ff9988; }
.flow-adv--sell-mid  .flow-adv-v { color: #ff5533; }
.flow-adv--sell-hot  .flow-adv-v { color: #ff2200; text-shadow: 0 0 6px rgba(255,34,0,0.50); }

/* TapeSpeed */
.flow-adv-tape--idle  .flow-adv-v { color: rgba(255,255,255,0.38); }
.flow-adv-tape--warm  .flow-adv-v { color: #ffcc44; }
.flow-adv-tape--hot   .flow-adv-v { color: #ffaa00; text-shadow: 0 0 5px rgba(255,170,0,0.55); }
.flow-adv-tape--blast .flow-adv-v {
  color: #00ff88;
  font-weight: 800;
  text-shadow: 0 0 8px rgba(0,255,136,0.70);
}

/* SpreadZ */
.flow-adv-spread--ok    .flow-adv-v { color: rgba(255,255,255,0.50); }
.flow-adv-spread--alert { border-left-color: #ffb300; background: rgba(255,179,0,0.06); }
.flow-adv-spread--alert .flow-adv-v { color: #ffb300; }

/* Footprint */
.flow-adv-fp-buy   { color: #00cfff; font-weight: 700; }
.flow-adv-fp-sell  { color: #ff4444; font-weight: 700; }
.flow-adv-fp-sep   { color: rgba(255,255,255,0.28); }
.flow-adv-fp-delta { color: rgba(255,255,255,0.48); font-size: 10px; margin-left: 4px; }
.flow-adv-exhaust  { color: #ff4444; font-weight: 700; font-size: 10px; letter-spacing: 0.04em; }

/* Absorção Real */
.flow-adv-absorb--buy  { border-left-color: #00cfff; background: rgba(0,207,255,0.07); }
.flow-adv-absorb--sell { border-left-color: #cc44ff; background: rgba(204,68,255,0.07); }
.flow-adv-absorb--buy  .flow-adv-title { color: rgba(0,207,255,0.65); }
.flow-adv-absorb--sell .flow-adv-title { color: rgba(204,68,255,0.65); }
.flow-adv-absorb--buy  .flow-adv-v { color: #00cfff; }
.flow-adv-absorb--sell .flow-adv-v { color: #cc44ff; }
```

---

### Task 12: Adicionar renderer-flow-advanced.js no index.html

**Files:**
- Modify: `painel-sense-desktop\index.html` (após linha 140)

- [ ] **Step 1: Inserir tag de script após renderer-hud.js**

Localizar (linha ~140):
```html
    <script src="renderer-hud.js?v=20260424debounce"></script>
    <script src="renderer-consensus-signal.js?v=20260424consensus"></script>
```

Substituir por:
```html
    <script src="renderer-hud.js?v=20260424debounce"></script>
    <script src="renderer-flow-advanced.js?v=20260427flowadv"></script>
    <script src="renderer-consensus-signal.js?v=20260424consensus"></script>
```

- [ ] **Step 2: Adicionar import do CSS no `<head>`**

Localizar (linha ~7):
```html
    <link rel="stylesheet" href="styles.css?v=20260424cssfix2" />
```

Adicionar após:
```html
    <link rel="stylesheet" href="styles/semantic/0132-flow-advanced.css?v=20260427flowadv" />
```

---

### Task 13: Integrar blocos em renderer-render-view-panels.js

**Files:**
- Modify: `painel-sense-desktop\renderer-render-view-panels.js` (função `paintDashboardHud`, linha ~143)

- [ ] **Step 1: Modificar `paintDashboardHud` para adicionar os novos blocos**

Localizar (linha ~143):
```javascript
function paintDashboardHud(hudBox, d, v, consensus) {
  if (hudBox) {
    setElementHtmlIfChanged(hudBox, renderHudBlock(d, v, consensus));
    syncSenseIaHudOverlayLayers();
```

Substituir por:
```javascript
function paintDashboardHud(hudBox, d, v, consensus) {
  if (hudBox) {
    let _hudHtml = renderHudBlock(d, v, consensus);
    if (typeof renderFlowAdvancedBlock === "function") {
      _hudHtml += renderFlowAdvancedBlock(d);
      if (d && d.flowAdvanced && d.flowAdvanced.footprint &&
          typeof renderFootprintBlock === "function")
        _hudHtml += renderFootprintBlock(d);
      if (d && d.flowAdvanced && d.flowAdvanced.absorptionReal &&
          (d.flowAdvanced.absorptionReal.buy || d.flowAdvanced.absorptionReal.sell) &&
          typeof renderAbsorptionRealBlock === "function")
        _hudHtml += renderAbsorptionRealBlock(d);
    }
    setElementHtmlIfChanged(hudBox, _hudHtml);
    syncSenseIaHudOverlayLayers();
```

---

### Task 14: Atualizar FORMATO_DASHBOARD.txt

**Files:**
- Modify: `painel-sense-desktop\FORMATO_DASHBOARD.txt` (adicionar seção de schema v9/v10)

- [ ] **Step 1: Adicionar documentação do schema v9 no final do arquivo**

Abrir `FORMATO_DASHBOARD.txt` e adicionar ao final:

```
SCHEMA v9 — flowAdvanced (Fase 1: Z normalizado + TapeSpeed + SpreadZ)
-----------------------------------------------------------------------
  Campo raiz "flowAdvanced" (objeto, opcional):
    schemaFlowAdv  — integer (1 = Fase 1, 2 = Fase 2)
    zMiniNorm      — número, Z normalizado intraday do mini (-∞ a +∞, tipicamente -3 a +3)
    zRefNorm       — número, Z normalizado intraday do cheio
    tapeSpeedZ     — número, Z-score da velocidade do tape (ticks/s)
    tapeTicksPerSec— número, ticks por segundo atual
    spreadZ        — número, Z-score do spread vs. média intraday
    spreadLiquidityAlert — boolean, true quando spreadZ > 2.0

SCHEMA v10 — flowAdvanced ampliado (Fase 2: Footprint + Absorção Real)
------------------------------------------------------------------------
  flowAdvanced.schemaFlowAdv = 2 quando Fase 2 ativa. Adiciona:
    footprint (objeto):
      buyVol, sellVol — volume de agressão comprador/vendedor na vela M1 anterior
      delta           — buyVol - sellVol
      deltaNorm       — delta normalizado [-1, +1]
      exaustionBuy    — boolean: vela de alta com delta negativo
      exaustionSell   — boolean: vela de baixa com delta positivo
    absorptionReal (objeto):
      buy, sell  — boolean (absorção compradora ou vendedora detectada)
      deltaAbs   — |deltaNorm| no momento da detecção
      priceMove  — deslocamento de preço em pontos reais na janela
    ofiNocional (objeto):
      wBid, wAsk — profundidade ponderada por nocional (DOL 5× WDO)
      ema        — OFI EMA atual
      pctBid     — % do livro ponderado no lado comprador
      fatorRef   — peso aplicado ao símbolo de referência (1.0 ou 5.0)
  regimeMercado.basisDirecional — string "compra"|"venda"|"neutro"
    (quando codigo == "curva_tensa": indica qual lado o basis favorece por convergência)
```

---

### Task 15: Testar painel Fase 1

**Files:** (nenhum — apenas verificação)

- [ ] **Step 1: Iniciar o painel**

```bash
cd "C:/Users/pc/OneDrive/Área de Trabalho/Código Sense/painel-sense-desktop"
npm start
```

- [ ] **Step 2: Verificar sem erros no DevTools**

No painel Electron: `Ctrl+Shift+I` → aba Console → confirmar que não há erros JS.

- [ ] **Step 3: Verificar bloco "FLUXO AVANÇADO" aparece no HUD**

Com o MT5 rodando e o EA exportando o JSON: o painel deve exibir um novo bloco "FLUXO AVANÇADO" abaixo dos blocos existentes de agressão/radar, com as linhas "Z MINI NORM" e "Z REF NORM".

- [ ] **Step 4: Confirmar valores numéricos mudam conforme o mercado se move**

Os valores de Z MINI NORM e Z REF NORM devem variar enquanto o mercado está ativo, com cores de acordo com a direção.

---

### Task 16: Commit painel Fase 1

**Files:** `painel-sense-desktop\` (git commit)

- [ ] **Step 1: Commit**

```bash
cd "C:/Users/pc/OneDrive/Área de Trabalho/Código Sense/painel-sense-desktop"
git add renderer-flow-advanced.js styles/semantic/0132-flow-advanced.css index.html renderer-render-view-panels.js FORMATO_DASHBOARD.txt
git commit -m "feat: painel v2.0 Fase 1 — blocos Z normalizado + TapeSpeed + SpreadZ

Novo renderer-flow-advanced.js: blocos FLUXO AVANÇADO no HUD.
CSS 0132-flow-advanced.css: paleta neon alinhada ao design atual.
renderer-render-view-panels.js: paintDashboardHud inclui novos blocos.
FORMATO_DASHBOARD.txt: documenta schema v9/v10.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## FASE 2 — Módulos Avançados (TapeSpeed, SpreadZ, Footprint, Absorção Real, OFI Nocional, Basis)

---

### Task 17: Criar SENSE_FlowAdvanced.mqh

**Files:**
- Create: `Santiago EA\SENSE_FlowAdvanced.mqh`

- [ ] **Step 1: Criar o arquivo completo**

```mql5
//+------------------------------------------------------------------+
//| SENSE_FlowAdvanced.mqh                                           |
//| Módulos avançados de fluxo: TapeSpeed, SpreadZ, Footprint,       |
//| Absorção Real. Incluir em SENSE.mq5 após os outros #include.     |
//+------------------------------------------------------------------+
#ifndef SENSE_FLOW_ADVANCED_MQH
#define SENSE_FLOW_ADVANCED_MQH

// ── TapeSpeed ─────────────────────────────────────────────────────────────
#define TAPESPEED_BUF_CAP 120
double   g_tsBuf[TAPESPEED_BUF_CAP];
int      g_tsIdx         = 0;
int      g_tsN           = 0;
int      g_tsTicksPerSec = 0;
double   g_tsSpeedZ      = 0.0;
datetime g_tsLastT       = 0;
int      g_tsLastCacheN  = 0;

void SenseTapeSpeedUpdate(const int cacheN)
  {
   datetime now = TimeCurrent();
   int dt = (g_tsLastT > 0) ? (int)(now - g_tsLastT) : 0;
   g_tsLastT = now;

   // Conta ticks novos desde o último ciclo
   int newTicks = (cacheN > g_tsLastCacheN) ? (cacheN - g_tsLastCacheN) : 0;
   g_tsLastCacheN = cacheN;
   int tps = (dt > 0) ? (int)MathRound((double)newTicks / (double)dt) : g_tsTicksPerSec;
   if(tps < 0) tps = 0;
   g_tsTicksPerSec = tps;

   g_tsBuf[g_tsIdx] = (double)tps;
   g_tsIdx = (g_tsIdx + 1) % TAPESPEED_BUF_CAP;
   if(g_tsN < TAPESPEED_BUF_CAP) g_tsN++;
   if(g_tsN < 5) { g_tsSpeedZ = 0.0; return; }

   double sumV = 0.0, sumV2 = 0.0;
   for(int i = 0; i < g_tsN; i++) { sumV += g_tsBuf[i]; sumV2 += g_tsBuf[i]*g_tsBuf[i]; }
   double mu  = sumV / (double)g_tsN;
   double var = sumV2 / (double)g_tsN - mu*mu;
   if(var < 0.0) var = 0.0;
   double sg = MathSqrt(var);
   g_tsSpeedZ = (sg < 1e-9) ? 0.0 : ((double)tps - mu) / (sg + 1e-9);
  }

// ── SpreadZ intraday ─────────────────────────────────────────────────────
#define SPREADZ_BUF_CAP 200
double g_szBuf[SPREADZ_BUF_CAP];
int    g_szIdx    = 0;
int    g_szN      = 0;
double g_szZ      = 0.0;
bool   g_szAlert  = false;

void SenseSpreadZUpdate(const double spreadPts)
  {
   if(spreadPts < 0.0) return;
   g_szBuf[g_szIdx] = spreadPts;
   g_szIdx = (g_szIdx + 1) % SPREADZ_BUF_CAP;
   if(g_szN < SPREADZ_BUF_CAP) g_szN++;
   if(g_szN < 10) { g_szZ = 0.0; g_szAlert = false; return; }

   double sumV = 0.0, sumV2 = 0.0;
   for(int i = 0; i < g_szN; i++) { sumV += g_szBuf[i]; sumV2 += g_szBuf[i]*g_szBuf[i]; }
   double mu  = sumV / (double)g_szN;
   double var = sumV2 / (double)g_szN - mu*mu;
   if(var < 0.0) var = 0.0;
   double sg = MathSqrt(var);
   g_szZ    = (sg < 1e-9) ? 0.0 : (spreadPts - mu) / (sg + 1e-9);
   g_szAlert = (g_szZ > 2.0);
  }

// ── Footprint por vela M1 ─────────────────────────────────────────────────
double   g_fpBuyVol       = 0.0;
double   g_fpSellVol      = 0.0;
double   g_fpPrevBuyVol   = 0.0;
double   g_fpPrevSellVol  = 0.0;
double   g_fpPrevDeltaNorm = 0.0;
bool     g_fpExaustBuy    = false;
bool     g_fpExaustSell   = false;
datetime g_fpLastBar      = 0;

void SenseFootprintUpdate(const MqlTick &cache[], const int cacheN,
                           const datetime barOpen, const bool isNewBar)
  {
   if(isNewBar && g_fpLastBar != 0 && barOpen != g_fpLastBar)
     {
      double tot = g_fpBuyVol + g_fpSellVol;
      g_fpPrevBuyVol   = g_fpBuyVol;
      g_fpPrevSellVol  = g_fpSellVol;
      g_fpPrevDeltaNorm = (tot > 0.0) ? (g_fpBuyVol - g_fpSellVol) / tot : 0.0;

      double prevClose = iClose(_Symbol, PERIOD_M1, 1);
      double prevOpen  = iOpen (_Symbol, PERIOD_M1, 1);
      bool velaAlta  = (prevClose > prevOpen + _Point);
      bool velaBaixa = (prevClose < prevOpen - _Point);
      g_fpExaustBuy  = velaAlta  && (g_fpPrevDeltaNorm < -0.15);
      g_fpExaustSell = velaBaixa && (g_fpPrevDeltaNorm >  0.15);

      g_fpBuyVol  = 0.0;
      g_fpSellVol = 0.0;
     }
   g_fpLastBar = barOpen;

   if(cacheN <= 0) return;
   for(int i = cacheN - 1; i >= 0; i--)
     {
      if(cache[i].time < barOpen) break;
      double price = (cache[i].last > 0.0) ? cache[i].last :
                     (cache[i].ask  > 0.0 ? cache[i].ask  :
                      (cache[i].bid > 0.0 ? cache[i].bid  : 0.0));
      double vol = cache[i].volume;
      if(price == 0.0 || vol <= 0.0) continue;
      uint fl       = cache[i].flags;
      bool aggrBuy  = ((fl & TICK_FLAG_BUY)  != 0);
      bool aggrSell = ((fl & TICK_FLAG_SELL) != 0);
      if(aggrBuy  && !aggrSell) g_fpBuyVol  += vol;
      else if(aggrSell && !aggrBuy)  g_fpSellVol += vol;
     }
  }

// ── Absorção Real (Delta × ΔPreço) ────────────────────────────────────────
bool   g_arBuy        = false;
bool   g_arSell       = false;
double g_arDeltaAbs   = 0.0;
double g_arPriceMove  = 0.0;

input double Absorcao_Real_DeltaNorm_Min = 0.55; // |delta| mínimo para absorção
input double Absorcao_Real_MaxMovePts   = 2.0;   // movimento máx de preço em pts reais

void SenseAbsorcaoRealUpdate(const double deltaNorm)
  {
   static double s_pricePrev = 0.0;
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   if(s_pricePrev <= 0.0) { s_pricePrev = bid; g_arBuy = false; g_arSell = false; return; }

   double pt = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
   if(pt <= 0.0) pt = _Point;
   double dp     = MathAbs(bid - s_pricePrev);
   double dpPts  = dp / pt / 1000.0; // WDO: 1 pt real = 1000 points

   g_arDeltaAbs  = MathAbs(deltaNorm);
   g_arPriceMove = dpPts;

   g_arBuy  = (deltaNorm < -Absorcao_Real_DeltaNorm_Min && dpPts < Absorcao_Real_MaxMovePts);
   g_arSell = (deltaNorm >  Absorcao_Real_DeltaNorm_Min && dpPts < Absorcao_Real_MaxMovePts);

   s_pricePrev = bid;
  }

#endif // SENSE_FLOW_ADVANCED_MQH
```

- [ ] **Step 2: Compilar o arquivo isoladamente (abrir no MetaEditor e F7)**

Saída esperada: 0 erros.

---

### Task 18: OFI ponderado por nocional em `UpdateGatilhoMicrostructure`

**Files:**
- Modify: `Santiago EA\SENSE.mq5` (função `UpdateGatilhoMicrostructure`, linhas ~1252-1262)

- [ ] **Step 1: Localizar a combinação de bid/ask mini + ref**

Localizar dentro de `UpdateGatilhoMicrostructure`:
```mql5
      wb = (wbM + wbR) * 0.5;
      wa = (waM + waR) * 0.5;
      ok = true;
```

Substituir por:
```mql5
      // Peso por nocional: DOL = 5× WDO; detecção automática pelo prefixo
      double _nocionFator = 1.0;
      if(StringFind(refSym, "DOL", 0) >= 0) _nocionFator = 5.0;
      double _wTot = 1.0 + _nocionFator;
      wb = (wbM + wbR * _nocionFator) / _wTot;
      wa = (waM + waR * _nocionFator) / _wTot;
      ok = true;
```

- [ ] **Step 2: Exportar `ofiNocional` no JSON (adicionado na Task 20)**

(Apenas registrar — o export será feito junto com o export do flowAdvanced v2 na Task 20.)

---

### Task 19: Basis direcional em SENSE_RegimeTracker.mqh

**Files:**
- Modify: `Santiago EA\SENSE_RegimeTracker.mqh` (função `SenseRegimeMercadoBuildJson`)

- [ ] **Step 1: Declarar variável `basisDirecional` após a detecção de `curva_tensa`**

Localizar dentro de `SenseRegimeMercadoBuildJson`, após o bloco `if(ativoLateralNtsl)`:
```mql5
   else if(basisZOk && MathAbs(basisZ) >= 2.2)
     {
      codigo = "curva_tensa";
      rotulo = "Basis ref−mini fora do padrão da janela (|z| alto) — possível stress de curva / arbitragem.";
      conf = MathMin(1.0, conf + 0.08);
     }
```

Adicionar logo APÓS esse bloco `}`:
```mql5
   // Viés direcional do basis (só válido em curva_tensa)
   string basisDirecional = "neutro";
   if(codigo == "curva_tensa" && basisZOk)
     {
      if(basisZ >  1.5) basisDirecional = "compra"; // DOL acima da média → WDO tende a subir
      else if(basisZ < -1.5) basisDirecional = "venda";
     }
```

- [ ] **Step 2: Adicionar `basisDirecional` no JSON de saída**

Localizar no final de `SenseRegimeMercadoBuildJson`, antes de `outObjectJson = j;`:
```mql5
   j += ",\"notas\":\"" + SenseRegimeJsonEscape(notas) + "\"";
   j += "}";
   outObjectJson = j;
```

Substituir por:
```mql5
   j += ",\"notas\":\"" + SenseRegimeJsonEscape(notas) + "\"";
   j += ",\"basisDirecional\":\"" + SenseRegimeJsonEscape(basisDirecional) + "\"";
   j += "}";
   outObjectJson = j;
```

- [ ] **Step 3: Compilar (F7) — 0 erros**

---

### Task 20: Include + wiring de SENSE_FlowAdvanced.mqh + export schema v10

**Files:**
- Modify: `Santiago EA\SENSE.mq5` (seção de includes ~linha 31, bloco `if(Use_ZFlow)` em OnTimer, e `SenseDashboardExportWriteJson`)

- [ ] **Step 1: Adicionar `#include` após os outros includes**

Localizar (linha ~33):
```mql5
#include "SENSE_RegimeTracker.mqh"
```

Adicionar após:
```mql5
#include "SENSE_FlowAdvanced.mqh"
```

- [ ] **Step 2: Chamar os módulos novos em OnTimer, dentro do bloco `if(Use_ZFlow)`**

Localizar no bloco `if(Use_ZFlow)` em OnTimer, após `SenseZNormPush` para ref (Task 6). Adicionar após o último `SenseZNormPush`:

```mql5
      // ── Módulos avançados (Fase 2) ────────────────────────────────────
      SenseTapeSpeedUpdate(g_tcMiniN);

      // SpreadZ usa o spread calculado em UpdateGatilhoMicrostructure (g_msSpreadPts)
      if(g_msBookDataOk)
         SenseSpreadZUpdate(g_msSpreadPts);

      // Footprint por vela M1 — usa g_fpLastBar (não lastBarTime, que já foi atualizado neste ciclo)
      datetime _barOpen = iTime(_Symbol, PERIOD_M1, 0);
      bool     _isNewBarFP = (_barOpen != g_fpLastBar);
      SenseFootprintUpdate(g_tcMini, g_tcMiniN, _barOpen, _isNewBarFP);

      // Absorção real usando deltaNorm do HybridAgressor (g_dashDeltaNorm calculado antes)
      SenseAbsorcaoRealUpdate(g_dashDeltaNorm);
```

**Atenção:** `UpdateGatilhoMicrostructure()` (linha ~5933) já deve ter sido chamada antes deste bloco (ela popula `g_msSpreadPts`). Confirmar a ordem no arquivo.

- [ ] **Step 3: Atualizar `schemaVersion` de 9 para 10**

Localizar (da Task 7):
```mql5
   json += "\"schemaVersion\":9,";
```

Substituir por:
```mql5
   json += "\"schemaVersion\":10,";
```

- [ ] **Step 4: Ampliar `flowAdvPart` para incluir todos os novos campos**

Localizar o bloco `flowAdvPart` criado na Task 7:
```mql5
   string flowAdvPart = "";
   if(Use_ZFlow)
     {
      string _fa = "{";
      _fa += "\"schemaFlowAdv\":1";
      _fa += ",\"zMiniNorm\":"  + DoubleToString(g_zMiniNorm, 4);
      _fa += ",\"zRefNorm\":"   + DoubleToString(g_zRefNorm,  4);
      _fa += "}";
      flowAdvPart = ",\"flowAdvanced\":" + _fa;
     }
```

Substituir por:
```mql5
   string flowAdvPart = "";
   if(Use_ZFlow)
     {
      string _fa = "{";
      _fa += "\"schemaFlowAdv\":2";
      _fa += ",\"zMiniNorm\":"     + DoubleToString(g_zMiniNorm, 4);
      _fa += ",\"zRefNorm\":"      + DoubleToString(g_zRefNorm,  4);
      _fa += ",\"tapeSpeedZ\":"    + DoubleToString(g_tsSpeedZ,  2);
      _fa += ",\"tapeTicksPerSec\":" + IntegerToString(g_tsTicksPerSec);
      _fa += ",\"spreadZ\":"       + DoubleToString(g_szZ,       2);
      _fa += ",\"spreadLiquidityAlert\":" + (g_szAlert ? "true" : "false");

      // Footprint vela anterior
      double _fpTot = g_fpPrevBuyVol + g_fpPrevSellVol;
      _fa += ",\"footprint\":{";
      _fa += "\"buyVol\":"   + DoubleToString(g_fpPrevBuyVol,  0);
      _fa += ",\"sellVol\":" + DoubleToString(g_fpPrevSellVol, 0);
      _fa += ",\"delta\":"   + DoubleToString(g_fpPrevBuyVol - g_fpPrevSellVol, 0);
      _fa += ",\"deltaNorm\":" + DoubleToString(g_fpPrevDeltaNorm, 4);
      _fa += ",\"exaustionBuy\":"  + (g_fpExaustBuy  ? "true" : "false");
      _fa += ",\"exaustionSell\":" + (g_fpExaustSell ? "true" : "false");
      _fa += "}";

      // Absorção real
      _fa += ",\"absorptionReal\":{";
      _fa += "\"buy\":"        + (g_arBuy  ? "true" : "false");
      _fa += ",\"sell\":"      + (g_arSell ? "true" : "false");
      _fa += ",\"deltaAbs\":"  + DoubleToString(g_arDeltaAbs,  4);
      _fa += ",\"priceMove\":" + DoubleToString(g_arPriceMove, 2);
      _fa += "}";

      // OFI nocional (espelha g_msWBid/g_msWAsk já ponderados pela Task 18)
      double _nocionFatorExport = 1.0;
      string _refSymExport = RefFluxoEffective(_Symbol);
      if(StringFind(_refSymExport, "DOL", 0) >= 0) _nocionFatorExport = 5.0;
      _fa += ",\"ofiNocional\":{";
      _fa += "\"wBid\":"    + DoubleToString(g_msWBid,    2);
      _fa += ",\"wAsk\":"   + DoubleToString(g_msWAsk,    2);
      _fa += ",\"ema\":"    + DoubleToString(g_msOfiEma,  4);
      const double _denom = g_msWBid + g_msWAsk + 1e-12;
      _fa += ",\"pctBid\":" + DoubleToString(100.0 * g_msWBid / _denom, 2);
      _fa += ",\"fatorRef\":" + DoubleToString(_nocionFatorExport, 1);
      _fa += "}";

      _fa += "}";
      flowAdvPart = ",\"flowAdvanced\":" + _fa;
     }
```

- [ ] **Step 5: Compilar (F7) — 0 erros**

---

### Task 21: Compilar e verificar EA Fase 2

**Files:** (nenhum — apenas verificação)

- [ ] **Step 1: Compilar no MetaEditor (F7) — 0 erros**

- [ ] **Step 2: Recarregar EA no MT5 e verificar `dashboard.json`**

O JSON deve conter:
```json
"schemaVersion":10,
"flowAdvanced":{
  "schemaFlowAdv":2,
  "zMiniNorm":..., "zRefNorm":...,
  "tapeSpeedZ":..., "tapeTicksPerSec":...,
  "spreadZ":..., "spreadLiquidityAlert":false,
  "footprint":{"buyVol":..., "sellVol":..., ...},
  "absorptionReal":{"buy":false,"sell":false,...},
  "ofiNocional":{...}
}
```

E `regimeMercado` deve ter `"basisDirecional":"neutro"` ou `"compra"`/`"venda"`.

---

### Task 22: Commit EA Fase 2

**Files:** `Santiago EA\` (git commit)

- [ ] **Step 1: Commit**

```bash
cd "C:/Users/pc/OneDrive/Área de Trabalho/SENSE 2026/FONTE/Santiago EA"
git add SENSE.mq5 SENSE_FlowAdvanced.mqh SENSE_RegimeTracker.mqh
git commit -m "feat: SENSE v2.0 Fase 2 — módulos avançados de fluxo

Novos módulos em SENSE_FlowAdvanced.mqh:
  - TapeSpeed: Z-score da velocidade do tape (ticks/s)
  - SpreadZ: Z-score do spread vs. média intraday (alerta liquidez)
  - Footprint M1: acumuladores por vela + detecção de esgotamento
  - Absorção Real: correlação Delta × ΔPreço (não mais heurística)
OFI ponderado por nocional: DOL 5× WDO em UpdateGatilhoMicrostructure.
Basis direcional: regimeMercado.basisDirecional em SENSE_RegimeTracker.
Export JSON schemaVersion 10 com flowAdvanced schemaFlowAdv 2.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 23: Verificar completude de renderer-flow-advanced.js

**Files:**
- Verify: `painel-sense-desktop\renderer-flow-advanced.js`

- [ ] **Step 1: Confirmar que `renderFootprintBlock` e `renderAbsorptionRealBlock` já estão no arquivo**

As funções foram criadas completas na Task 10 — verificar que estão presentes e corretas.

- [ ] **Step 2: Testar com JSON v10 que os blocos aparecem**

Com o EA exportando schema v10 e `absorptionReal.buy` ou `absorptionReal.sell` = `true` (pode ser forçado temporariamente no JSON de teste), verificar que o bloco "ABSORÇÃO REAL" aparece com a cor correta (azul para compra, roxo para venda).

---

### Task 24: Completar e verificar CSS

**Files:**
- Verify: `painel-sense-desktop\styles\semantic\0132-flow-advanced.css`

- [ ] **Step 1: Confirmar que o CSS criado na Task 11 cobre todos os blocos da Fase 2**

Verificar que as classes `.flow-adv-fp-buy`, `.flow-adv-fp-sell`, `.flow-adv-exhaust`, `.flow-adv-absorb--buy`, `.flow-adv-absorb--sell` estão presentes no arquivo.

- [ ] **Step 2: Confirmar no painel que os blocos renderizam com as cores corretas**

- Bloco Z MINI NORM positivo forte → texto `#00ffcc` (ciano neon)
- Bloco TAPE VEL com Z > 2 → texto `#00ff88` (verde neon)
- Bloco ABSORÇÃO REAL buy → borda `#00cfff` e fundo `rgba(0,207,255,0.07)`

---

### Task 25: Integrar `basisDirecional` no renderer do regime

**Files:**
- Modify: `painel-sense-desktop\renderer-regime-ui.js` (adicionar exibição de `basisDirecional`)

- [ ] **Step 1: Ler `renderer-regime-ui.js` e identificar onde o regime é exibido**

Localizar a função principal de renderização do regime (provavelmente `renderRegimeMercadoHtml`).

- [ ] **Step 2: Adicionar linha de `basisDirecional` quando não for neutro**

Encontrar onde o JSON `regimeMercado` é consumido e adicionar, após a linha de `confianca` ou `vies`:

```javascript
const basisDir = rm.basisDirecional;
if (basisDir && basisDir !== "neutro") {
  const basisCls = basisDir === "compra" ? "regime-basis--buy" : "regime-basis--sell";
  const basisTxt = basisDir === "compra"
    ? "BASIS FAVORECE COMPRA (convergência)"
    : "BASIS FAVORECE VENDA (convergência)";
  html += `<div class="regime-row ${escapeHtml(basisCls)}">${escapeHtml(basisTxt)}</div>`;
}
```

- [ ] **Step 3: Adicionar CSS para `.regime-basis--buy` e `.regime-basis--sell`**

Adicionar ao final de `0132-flow-advanced.css`:

```css
/* Basis direcional no bloco de regime */
.regime-basis--buy  { color: #00cfff; font-size: 10px; font-weight: 700; }
.regime-basis--sell { color: #cc44ff; font-size: 10px; font-weight: 700; }
```

---

### Task 26: Teste final do painel

**Files:** (nenhum — apenas verificação)

- [ ] **Step 1: Iniciar o painel e confirmar sem erros JS**

```bash
cd "C:/Users/pc/OneDrive/Área de Trabalho/Código Sense/painel-sense-desktop"
npm start
```

DevTools → Console: 0 erros.

- [ ] **Step 2: Checklist de blocos visíveis no HUD**

Com o EA rodando no MT5:
- [ ] Bloco "FLUXO AVANÇADO" com Z MINI NORM e Z REF NORM
- [ ] Linha TAPE VEL com Z e ticks/s
- [ ] Linha SPREAD Z (badge ⚠ LIQ.REDUZ. quando spread alto)
- [ ] Bloco "FOOTPRINT M1" com % compra/venda e Δ da vela anterior
- [ ] Bloco "ABSORÇÃO REAL" aparece quando `absorptionReal.buy` ou `.sell` = true
- [ ] Bloco de regime mostra "BASIS FAVORECE..." quando `curva_tensa` e `basisZ > 1.5`

- [ ] **Step 3: Verificar que os blocos existentes não regrediram**

- Placar, Gatilho Operacional, Radar, Makers, Tape×Book → todos funcionando normalmente.

---

### Task 27: Commit painel Fase 2 — final

**Files:** `painel-sense-desktop\` (git commit)

- [ ] **Step 1: Commit**

```bash
cd "C:/Users/pc/OneDrive/Área de Trabalho/Código Sense/painel-sense-desktop"
git add renderer-flow-advanced.js renderer-regime-ui.js styles/semantic/0132-flow-advanced.css index.html renderer-render-view-panels.js FORMATO_DASHBOARD.txt
git commit -m "feat: painel v2.0 Fase 2 completo — Footprint, Absorção Real, OFI Nocional, Basis

renderer-flow-advanced.js: renderFootprintBlock + renderAbsorptionRealBlock completos.
renderer-regime-ui.js: exibe basisDirecional quando curva_tensa.
0132-flow-advanced.css: estilos Fase 2 completos.
Painel reflete exatamente o que o EA lê do mercado (schema v10).

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Resumo das Tasks

| Task | Fase | Arquivo principal | Tempo est. |
|------|------|------------------|------------|
| 1 | Pre | EA git init | 2 min |
| 2 | 1 | SENSE_PtaxRealtime.mqh | 5 min |
| 3 | 1 | SENSE.mq5 (cache) | 8 min |
| 4 | 1 | SENSE.mq5 (CFlowZ) | 10 min |
| 5 | 1 | SENSE.mq5 (Z-norm) | 8 min |
| 6 | 1 | SENSE.mq5 (OnTimer wiring) | 8 min |
| 7 | 1 | SENSE.mq5 (JSON v9) | 5 min |
| 8 | 1 | Verificação EA | 5 min |
| 9 | 1 | EA git commit | 2 min |
| 10 | 1 | renderer-flow-advanced.js | 5 min |
| 11 | 1 | 0132-flow-advanced.css | 3 min |
| 12 | 1 | index.html | 2 min |
| 13 | 1 | renderer-render-view-panels.js | 3 min |
| 14 | 1 | FORMATO_DASHBOARD.txt | 3 min |
| 15 | 1 | Teste painel | 5 min |
| 16 | 1 | Painel git commit | 2 min |
| 17 | 2 | SENSE_FlowAdvanced.mqh (criar) | 5 min |
| 18 | 2 | SENSE.mq5 (OFI nocional) | 5 min |
| 19 | 2 | SENSE_RegimeTracker.mqh | 5 min |
| 20 | 2 | SENSE.mq5 (JSON v10 + wiring) | 10 min |
| 21 | 2 | Verificação EA | 5 min |
| 22 | 2 | EA git commit | 2 min |
| 23 | 2 | renderer-flow-advanced.js (verificar) | 3 min |
| 24 | 2 | CSS verificação | 3 min |
| 25 | 2 | renderer-regime-ui.js | 5 min |
| 26 | 2 | Teste final painel | 5 min |
| 27 | 2 | Painel git commit final | 2 min |

**Total estimado:** ~125 minutos de trabalho de implementação.
