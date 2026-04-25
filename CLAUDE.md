# CLAUDE.md — Contexto persistente do projeto SENSE

> Este arquivo é lido automaticamente pelo Claude Code a cada sessão nesta pasta.
> Mantenha atualizado quando decisões importantes forem tomadas.

---

## 1. Identidade do projeto

**Nome do produto:** SENSE
**Autor:** Santiago (santiagofcosta@gmail.com)
**Objetivo comercial:** transformar o SENSE em produto pago vendido a day traders brasileiros de DOL (Dólar Cheio) e WDO (Mini Dólar) na B3.
**Estado em 2026-04-22:** funcional em uso interno, em construção para virar produto.
**Stack:** MetaTrader 5 (MQL5) + Electron 33 + Node.js ≥18 + Ollama (LLM local).

---

## 2. Perfil do autor (para calibrar explicações)

- Santiago é iniciante em programação.
- Consegue ler código e fazer pequenas edições guiadas, mas depende da IA para decisões arquiteturais.
- Tem conhecimento profundo de mercado (order flow, basis, Z-score, regime de mercado). Isso é visível nos comentários do código MQL5.
- Trabalhou anteriormente com Cursor; agora migrando para Claude Code.
- **Implicação prática:** explique sempre o porquê de decisões técnicas, não só o como. Ofereça analogias. Evite jargão sem definir.

---

## 3. Arquitetura em alto nível

```
┌─────────────────────────┐         ┌──────────────────────────────┐
│  MetaTrader 5 (cliente) │         │   Painel Electron (desktop)  │
│                         │         │                              │
│  SENSE.mq5 (11.800+ l.) │  ────▶  │   main.js                    │
│  + SENSE_*.mqh (3 inc.) │  JSON   │   + preload.js               │
│                         │  disco  │   + renderer.js (190 KB!)    │
│  Escreve:               │         │   + styles.css (190 KB!)     │
│  MQL5\Files\            │         │                              │
│     dashboard.json      │  ────▶  │   Lê dashboard.json com      │
│                         │         │   retry+cache (race condit.) │
│  Timer: 250 ms          │         │                              │
│  Export: 1 s (ou placar)│         │   IA local (Ollama llama3.2) │
└─────────────────────────┘         │   via scripts/lib/...        │
                                    │                              │
                                    │   PTAX oficial do BC via     │
                                    │   bc-ptax-fetch.js           │
                                    └──────────────────────────────┘
```

**Ponte EA ↔ Painel:** arquivo `dashboard.json` em `%MQL5%\Files\`.
**Frequência:** EA atualiza a cada ~1 s (ou imediatamente quando o placar muda).
**Guard:** `SENSE_DashboardExportGuard.mqh` evita múltiplos gráficos sobrescreverem o mesmo JSON (filtro por magic number).

---

## 4. Localização dos arquivos

**Raiz do painel Electron (esta pasta):**
`C:\Users\pc\OneDrive\Área de Trabalho\Código Sense\painel-sense-desktop\`

Arquivos-raiz relevantes:
- `main.js` (13 KB) — processo principal Electron
- `preload.js` (1 KB) — bridge IPC
- `renderer.js` (190 KB) — UI monolítica (**candidato #1 a refatorar**)
- `styles.css` (190 KB) — CSS monolítico (**candidato #2 a refatorar**)
- `index.html` (5 KB)
- `dashboard-guard.js` (3 KB) — validador JSON compartilhado main↔renderer
- `bc-ptax-fetch.js` (4 KB) — busca PTAX do Banco Central
- `config.json` — aponta para `C:\Program Files\MetaTrader 5 Terminal\MQL5\Files\dashboard.json`
- `FORMATO_DASHBOARD.txt` (12 KB) — **documentação do contrato JSON** (leia primeiro!)
- `LEIA-ME-CONFIG.txt`
- `scripts/lib/sense-ia-ask-core.js` — integração com Ollama/OpenAI
- `scripts/build-sentiment-context.js`
- Scripts `.cmd`/`.ps1` para instalar, abrir e configurar no Windows

**Código MQL5 (fora desta pasta):**
`C:\Users\pc\OneDrive\Área de Trabalho\SENSE 2026\FONTE\Santiago EA\`
- `SENSE.mq5` (425 KB, ~11.800 linhas) — **NÃO MEXER sem autorização explícita**
- `SENSE_DashboardExportGuard.mqh`
- `SENSE_PtaxRealtime.mqh`
- `SENSE_RegimeTracker.mqh`
- `SENSE.ex5` — binário compilado

**Presets + docs (também em `FONTE/`):**
- 8 arquivos `.set` (presets P-PAINEL-01..04 e P-FLUXO-01..04)
- `SENSE_PRESETS_INDICE.txt`
- `LEIA-ME_Presets_SENSE.txt`
- `SENSE_INPUTS_PRESETS_Gatilho_Painel_e_Fluxo.txt`
- Calendário de notícias: `Nova pasta/2024..2027.txt`

**Ícones:** `assets/logo-sense-ico.ico` (3 variantes).

---

## 5. O que o SENSE faz, em detalhe

**Do lado MQL5:**
- Captura ticks (`CopyTicks`) e book (`MarketBookGet`) em tempo real.
- Calcula Z-score de fluxo do mini (`zMini`) e da referência (`zRef`).
- Classifica agressão: Entrando / Moderada / Forte / Muito Forte.
- Detecta regime de mercado: tendência_alta, tendência_baixa, lateral_ntsl, divergência_mini_ref, curva_tensa, basis_em_movimento, compressão, misto, neutro.
- Calcula PTAX com VWAP intradiário e D-1 do USDBRL spot.
- Sistema de trading: TP, SL, breakeven dinâmico, trailing stop, filtros de horário/notícias, proteção de drawdown, limite de perdas por dia.
- Desenha linhas: suporte, resistência, alvos projetados, regiões de compra/venda, alvos H4/L4.
- HUD no próprio gráfico do MT5 com placar e sinais.
- Exporta tudo em `dashboard.json`.

**Do lado Electron:**
- Lê `dashboard.json` com retry (até 8 tentativas) e cache por path (lida com race condition de escrita/leitura).
- Renderiza painel visual (renderer.js gigante — precisa modular).
- Integra PTAX oficial do BC (`bc-ptax-fetch.js`).
- Comentários de IA sobre o regime de mercado via Ollama local (llama3.2).
- Scripts de automação para instalação, atalho no desktop, cópia de .mqh para MT5.

---

## 6. Problemas conhecidos (em ordem de gravidade para comercialização)

1. **Licenciamento amador.** EA tem `allowed_accounts[]` hardcoded (linha 23 de `SENSE.mq5`) + `LIC_MAXIMAL_DATE` fixa que já venceu (01.08.2024). Painel não valida nada. Qualquer cliente pirata.
2. **Sem pipeline de distribuição.** `package.json` só tem `electron` como devDep. Falta `electron-builder`, code signing (EV certificate ~R$ 1.500-3.000/ano), auto-updater.
3. **Monólitos gigantes:** `renderer.js` 190 KB, `styles.css` 190 KB, `SENSE.mq5` 425 KB. Manutenção arriscada.
4. **Ponte por arquivo JSON.** Funciona, mas tem latência disco + desgaste SSD a longo prazo. Alternativas: Named Pipes, WebSocket local.
5. **Sem versionamento (git).** Nenhuma pasta tem `.git`. É a primeira coisa a configurar.
6. **Dependência do Ollama no cliente.** Se o cliente não instalar Ollama, feature de IA morre. Precisa de fallback (OpenAI via API, ou mensagem clara).

---

## 7. Pontos fortes (não desperdiçar)

- Código MQL5 tem qualidade: comentários explicativos, modularização por headers, tratamento de fallback (ex: símbolos com volume M1 = 0).
- Painel Electron tem proteções maduras: retry em leitura de JSON, cache, `dashboard-guard.js` compartilhado main↔renderer, `bc-ptax-fetch.js` com fallback.
- Presets prontos (8 arquivos `.set`) e documentação em `.txt` — base de onboarding já existe.
- Identidade visual pronta (3 ícones `.ico`).
- `FORMATO_DASHBOARD.txt` documenta o contrato JSON — reduz risco de quebrar integração.
- Integração com IA local é diferencial no mercado brasileiro.

---

## 8. Convenções do projeto

- **Idioma:** comentários de código e mensagens de commit em português.
- **Estilo MQL5:** funções com prefixo `Sense*`; globais com prefixo `g_sense*` ou `g_sr_*`.
- **Estilo JS:** CommonJS (`require`), não ES modules (por causa do Electron legacy).
- **JSON:** EA escreve sempre com `FILE_ANSI` + `FILE_SHARE_READ | FILE_SHARE_WRITE`. Painel remove BOM UTF-8 antes de parse.
- **Magic numbers do EA:** `Number_Magic = 2024` (default); `Magic_Exporta_Painel` controla quem escreve o JSON.

---

## 9. Regras obrigatórias para o Claude Code neste projeto

1. **Nunca** edite `SENSE.mq5` sem autorização explícita do Santiago na mesma mensagem. Ele é o coração do produto; qualquer quebra perde clientes.
2. **Antes de qualquer mudança de código**, garanta que há git commit de snapshot. Se `.git` não existir, inicialize primeiro.
3. **Passos pequenos:** uma alteração por vez, explicação do que mudou e como testar.
4. **Peça permissão antes de instalar dependências novas.** Cada nova lib é mais superfície de bug.
5. **Se estiver na dúvida, pergunte.** Santiago prefere 3 perguntas extras a 1 refatoração errada.
6. **Não crie "versões melhoradas" do zero.** Sempre prefira evoluir o código existente.
7. **Sempre mencione impacto em licenciamento** quando mexer em código crítico (inicialização do EA, startup do Electron).
8. **Ao terminar uma alteração**, diga exatamente como testar manualmente no MT5 + painel.

---

## 10. Roadmap atual (revisar quando concluir cada fase)

- [ ] **Fase 0 — Fundação.** Git init + primeiro commit + CLAUDE.md (este arquivo).
- [ ] **Fase 1 — Auditoria.** Relatório completo de estado atual do painel Electron.
- [ ] **Fase 2 — Modularização do renderer.js.** Quebrar em módulos por responsabilidade.
- [ ] **Fase 3 — Licenciamento online.** Servidor Node.js + SQLite, validação no EA e no Electron.
- [ ] **Fase 4 — Pipeline de build.** electron-builder, code signing, auto-updater.
- [ ] **Fase 5 — Landing + checkout.** Site de vendas com pagamento e onboarding automático.
- [ ] **Fase 6 — Documentação do cliente.** Manual, vídeos, FAQ.

---

## 11. Glossário rápido

- **DOL:** Dólar Futuro Cheio (B3), contrato de 50.000 USD.
- **WDO:** Mini Dólar Futuro (B3), contrato de 10.000 USD.
- **PTAX:** taxa média de câmbio apurada pelo Banco Central (4 janelas diárias).
- **Order flow / Fluxo de agressão:** análise de quem agrediu o book (comprou no ask ou vendeu no bid) para medir intenção comprador/vendedor.
- **Basis:** diferença entre dois contratos correlatos (ex: DOL vs WDO, ou futuro vs spot).
- **Z-score:** número de desvios-padrão acima/abaixo da média.
- **NTSL:** No Trade Setup Lines — conceito de setup de trade por zona do Luís Buxton (trader brasileiro).
- **HUD:** Heads-Up Display — painel sobreposto ao gráfico.
