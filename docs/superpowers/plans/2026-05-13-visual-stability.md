# Visual Stability + Neon Coherence — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir o layout que salta a cada 0,5 s e uniformizar o visual neon no topbar, títulos, rodapé e dialog da IA.

**Architecture:** Parte 1 altera 2 arquivos CSS existentes para tornar os painéis contêineres fechados (sem crescimento de layout por conteúdo). Parte 2 cria um arquivo CSS novo (`styles/extras/visual-coherence.css`) carregado no final do `index.html` — substitui estilos sem tocar nos arquivos semânticos existentes.

**Tech Stack:** CSS puro, Electron 33 (Chromium). Sem JavaScript, sem dependências novas.

---

## Mapa de arquivos

| Arquivo | Ação | O que muda |
|---|---|---|
| `styles/semantic/0021-shell.css` | Modificar | `.grid`: row 1 `auto→1fr`, `overflow-y: auto→hidden` · `.panel`: `overflow-y: visible→clip` · `.panel-tl`: `overflow-y: visible→clip` |
| `styles/semantic/0023-shell.css` | Modificar | `.panel-tr`: `overflow-y: visible→clip` |
| `styles/extras/visual-coherence.css` | Criar | Todos os estilos neon de topbar, títulos, rodapé e dialog IA |
| `index.html` | Modificar | Adicionar `<link>` para `visual-coherence.css` |

---

## Task 1: Estabilidade de layout — `0021-shell.css`

**Files:**
- Modify: `styles/semantic/0021-shell.css`

- [ ] **Step 1: Abrir o painel em modo demo para ter linha de base visual**

  Execute `start-painel-demo.cmd` no Explorer (duplo clique) ou pelo terminal:
  ```
  cd "D:\Código Sense\painel-sense-desktop"
  start-painel-demo.cmd
  ```
  Observe que a tela salta verticalmente enquanto os valores animam. Memorize o comportamento para comparar após a mudança.

- [ ] **Step 2: Editar `.grid` — trocar row 1 e overflow**

  Em `styles/semantic/0021-shell.css`, localize o bloco `.grid` (começa na linha 8):

  Substituir:
  ```css
  .grid {
    /* Linha 1 = fluxo/níveis; linha 2 = HUD; linha 3 = Δ/placar — equilibrado para não esmagar placar + barra de força */
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows:
      minmax(100px, auto)
      minmax(255px, 1.58fr)
      minmax(200px, 1.12fr);
    gap: var(--grid-gap);
    padding: 5px 6px;
    width: 100%;
    box-sizing: border-box;
    overflow-x: hidden;
    overflow-y: auto;
  ```

  Por:
  ```css
  .grid {
    /* Linha 1 = fluxo/níveis; linha 2 = HUD; linha 3 = Δ/placar — equilibrado para não esmagar placar + barra de força */
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows:
      minmax(100px, 1fr)
      minmax(255px, 1.58fr)
      minmax(200px, 1.12fr);
    gap: var(--grid-gap);
    padding: 5px 6px;
    width: 100%;
    box-sizing: border-box;
    overflow-x: hidden;
    overflow-y: hidden;
  ```

  As duas mudanças neste bloco: `auto` → `1fr` na linha 1 da grid; `overflow-y: auto` → `overflow-y: hidden`.

- [ ] **Step 3: Editar `.panel` — overflow-y**

  Ainda em `0021-shell.css`, localizar o bloco `.panel`:

  Substituir:
  ```css
  .panel {
    border: 1px solid #1f2a44;
    border-radius: var(--ui-panel-radius);
    background: linear-gradient(180deg, #0d1422 0%, #0a0f18 100%);
    padding: var(--ui-panel-padding);
    box-shadow: 0 0 24px rgba(0, 80, 255, 0.06);
    min-height: 0;
    overflow-x: hidden;
    /* Conteúdo visível; scroll global no body se a janela for baixa */
    overflow-y: visible;
  }
  ```

  Por:
  ```css
  .panel {
    border: 1px solid #1f2a44;
    border-radius: var(--ui-panel-radius);
    background: linear-gradient(180deg, #0d1422 0%, #0a0f18 100%);
    padding: var(--ui-panel-padding);
    box-shadow: 0 0 24px rgba(0, 80, 255, 0.06);
    min-height: 0;
    overflow-x: hidden;
    overflow-y: clip;
  }
  ```

  Nota: `overflow: clip` corta o conteúdo sem criar scroll e sem estabelecer novo BFC — melhor que `hidden` para não afetar `position: absolute` internos.

- [ ] **Step 4: Editar `.panel-tl` — overflow-y**

  Ainda em `0021-shell.css`, localizar o bloco `.panel-tl`:

  Substituir:
  ```css
  .panel-tl {
    grid-column: 1;
    grid-row: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    align-self: stretch;
    overflow-x: hidden;
    overflow-y: visible;
  }
  ```

  Por:
  ```css
  .panel-tl {
    grid-column: 1;
    grid-row: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    align-self: stretch;
    overflow-x: hidden;
    overflow-y: clip;
  }
  ```

- [ ] **Step 5: Verificar visualmente o painel em modo demo**

  Com o painel aberto (do Step 1), salve o arquivo CSS — o Electron recarrega automaticamente se `nodeIntegration` detectar mudança; caso contrário, feche e reabra `start-painel-demo.cmd`.

  Critérios de aprovação:
  - Tela **não salta** verticalmente enquanto os valores animam
  - Painel Fluxo/Regime e Alvos/Níveis mostram conteúdo normalmente (nada cortado inesperadamente)
  - HUD, Δ e Placar continuam visíveis e funcionando

  Se algum painel cortar conteúdo que não devia: troque `overflow-y: clip` por `overflow-x: clip` + `overflow-y: clip` separadamente naquele seletor específico.

- [ ] **Step 6: Commit**

  ```bash
  cd "D:\Código Sense\painel-sense-desktop"
  git add styles/semantic/0021-shell.css
  git commit -m "fix: estabiliza layout — grid row 1fr e overflow clip nos painéis TL"
  ```

---

## Task 2: Estabilidade de layout — `0023-shell.css`

**Files:**
- Modify: `styles/semantic/0023-shell.css`

- [ ] **Step 1: Editar `.panel-tr` — overflow-y**

  Em `styles/semantic/0023-shell.css`, o arquivo inteiro é:
  ```css
  /**
   * [shell] — parte 0023 (ordem global preservada).
   * Gerado: scripts/split-css-semantic.js
   */


  .panel-tr {
    grid-column: 2;
    grid-row: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: visible;
  }
  ```

  Substituir `overflow-y: visible` por `overflow-y: clip`:
  ```css
  /**
   * [shell] — parte 0023 (ordem global preservada).
   * Gerado: scripts/split-css-semantic.js
   */


  .panel-tr {
    grid-column: 2;
    grid-row: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: clip;
  }
  ```

- [ ] **Step 2: Verificar o painel em modo demo**

  Critérios de aprovação:
  - Painel Alvos/Níveis (canto superior direito) mostra conteúdo normalmente
  - Tela continua sem saltar

- [ ] **Step 3: Commit**

  ```bash
  cd "D:\Código Sense\painel-sense-desktop"
  git add styles/semantic/0023-shell.css
  git commit -m "fix: overflow clip no panel-tr (Alvos/Níveis)"
  ```

---

## Task 3: Criar `styles/extras/visual-coherence.css`

**Files:**
- Create: `styles/extras/visual-coherence.css`

Este arquivo sobrepõe estilos dos arquivos semânticos existentes sem modificá-los. É carregado por último — especificidade idêntica à do original é suficiente para a maioria dos seletores porque vem depois na cascata.

- [ ] **Step 1: Criar o arquivo com todo o conteúdo**

  Criar `styles/extras/visual-coherence.css` com o seguinte conteúdo:

  ```css
  /**
   * visual-coherence.css — coesão visual neon para áreas genéricas do painel.
   * Carregado após todos os blocos semânticos (index.html).
   * NÃO é gerado por scripts/split-css-semantic.js — sobrevive à regeneração.
   *
   * Áreas cobertas:
   *   1. Topbar (.topbar, .hint, .btn-pick-json)
   *   2. Títulos dos painéis (.panel-title, .panel)
   *   3. Rodapé (.footer, .status)
   *   4. Dialog SENSE IA (.sense-ia-dialog__*)
   */

  /* ═══════════════════════════════════════════════════════════
     1. TOPBAR
  ═══════════════════════════════════════════════════════════ */

  .topbar {
    background: linear-gradient(90deg, #0a0f1c 0%, #080c16 100%);
    border-bottom-color: rgba(56, 189, 248, 0.12);
  }

  .hint {
    color: var(--speed-pos-soft);
    text-shadow: 0 0 8px rgba(56, 189, 248, 0.25);
    letter-spacing: 0.02em;
  }

  .btn-pick-json {
    color: var(--speed-pos-soft);
    border-color: rgba(56, 189, 248, 0.4);
    box-shadow: 0 0 6px rgba(56, 189, 248, 0.1);
  }

  .btn-pick-json:hover {
    color: var(--speed-pos);
    background: rgba(14, 23, 50, 0.7);
    border-color: rgba(56, 189, 248, 0.6);
    box-shadow: 0 0 10px rgba(56, 189, 248, 0.2);
  }

  /* ═══════════════════════════════════════════════════════════
     2. TÍTULOS DOS PAINÉIS
  ═══════════════════════════════════════════════════════════ */

  .panel-title {
    color: var(--speed-pos-soft);
    text-shadow: 0 0 8px rgba(56, 189, 248, 0.3);
    border-left: 2px solid rgba(56, 189, 248, 0.5);
    padding-left: 6px;
  }

  /* borda do painel levemente azulada para unificar com os títulos */
  .panel {
    border-color: rgba(56, 189, 248, 0.14);
  }

  /* ═══════════════════════════════════════════════════════════
     3. RODAPÉ DE STATUS
  ═══════════════════════════════════════════════════════════ */

  .footer {
    background: linear-gradient(90deg, #080c16 0%, #070b12 100%);
    border-top-color: rgba(56, 189, 248, 0.1);
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .status {
    color: var(--speed-pos-soft);
  }

  .status.error {
    color: #ff8b8b;
  }

  .status.warning {
    color: #fbbf24;
  }

  /* dot "ao vivo" — usa as classes já aplicadas pelo renderer:
     className="status"         → ao vivo (dot verde)
     className="status warning" → stale (sem dot)
     className="status error"   → erro (sem dot) */
  .status:not(.error):not(.warning)::before {
    content: "";
    display: inline-block;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #22c55e;
    box-shadow: 0 0 6px #22c55e;
    margin-right: 6px;
    animation: sense-dot-pulse 2.2s ease-in-out infinite;
    vertical-align: middle;
  }

  @keyframes sense-dot-pulse {
    0%, 100% {
      opacity: 0.5;
      box-shadow: 0 0 4px #22c55e;
    }
    50% {
      opacity: 1;
      box-shadow: 0 0 8px #22c55e, 0 0 14px rgba(34, 197, 94, 0.3);
    }
  }

  /* desativar dot em modo realtime-optimized (mesmo padrão dos outros keyframes) */
  html.realtime-optimized .status:not(.error):not(.warning)::before {
    animation: none;
    opacity: 0.8;
  }

  /* ═══════════════════════════════════════════════════════════
     4. DIALOG SENSE IA
  ═══════════════════════════════════════════════════════════ */

  .sense-ia-dialog__panel {
    background: linear-gradient(135deg, #080d1c 0%, #060a16 100%);
    border: 1px solid rgba(56, 189, 248, 0.22);
    box-shadow:
      0 0 24px rgba(0, 80, 200, 0.08),
      inset 0 0 16px rgba(0, 40, 100, 0.05);
  }

  .sense-ia-dialog__title {
    color: var(--speed-pos);
    text-shadow: 0 0 12px rgba(56, 189, 248, 0.5);
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  #senseIaMeta {
    color: #334155;
    letter-spacing: 0.03em;
  }

  .sense-ia-dialog__body {
    border-top-color: rgba(56, 189, 248, 0.1);
    border-bottom-color: rgba(56, 189, 248, 0.1);
  }

  .sense-ia-dialog__kbd {
    border: 1px solid rgba(56, 189, 248, 0.2);
    color: var(--speed-pos-soft);
    background: rgba(0, 0, 0, 0.4);
  }

  /* botões de ação primários: Gatilho FA, ⚙ Inputs */
  .sense-ia-dialog__action-btn {
    color: var(--speed-pos);
    border-color: rgba(56, 189, 248, 0.45);
    background: linear-gradient(135deg, rgba(8, 18, 44, 0.9), rgba(6, 13, 32, 0.95));
    box-shadow: 0 0 7px rgba(56, 189, 248, 0.12);
    letter-spacing: 0.04em;
  }

  .sense-ia-dialog__action-btn:hover {
    border-color: rgba(56, 189, 248, 0.65);
    box-shadow: 0 0 12px rgba(56, 189, 248, 0.2);
  }

  /* botões secundários: guardar .md, exportar inputs, copiar JSON */
  .sense-ia-dialog__save-md-btn,
  .sense-ia-dialog__copy-context-btn {
    color: #475569;
    border-color: rgba(56, 189, 248, 0.15);
    background: rgba(7, 12, 30, 0.7);
  }

  .sense-ia-dialog__save-md-btn:hover,
  .sense-ia-dialog__copy-context-btn:hover {
    color: var(--speed-pos-soft);
    border-color: rgba(56, 189, 248, 0.3);
  }
  ```

- [ ] **Step 2: Verificar que o arquivo foi criado**

  ```bash
  ls "D:/Código Sense/painel-sense-desktop/styles/extras/visual-coherence.css"
  ```
  Esperado: arquivo listado sem erro.

- [ ] **Step 3: Commit**

  ```bash
  cd "D:\Código Sense\painel-sense-desktop"
  git add styles/extras/visual-coherence.css
  git commit -m "feat: visual-coherence.css — neon para topbar, títulos, rodapé e dialog IA"
  ```

---

## Task 4: Conectar CSS no `index.html`

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Adicionar `<link>` no final da seção `<head>`**

  Em `index.html`, localizar a linha (atualmente última linha de CSS no `<head>`):
  ```html
      <link rel="stylesheet" href="styles/extras/0132-flow-advanced.css?v=20260512cssrestore" />
  ```

  Adicionar imediatamente após:
  ```html
      <link rel="stylesheet" href="styles/extras/visual-coherence.css?v=20260513neon1" />
  ```

  O bloco `<head>` final deve ficar:
  ```html
      <link rel="stylesheet" href="styles.css?v=20260512cssrestore" />
      <link rel="stylesheet" href="styles/extras/0132-flow-advanced.css?v=20260512cssrestore" />
      <link rel="stylesheet" href="styles/extras/visual-coherence.css?v=20260513neon1" />
    </head>
  ```

- [ ] **Step 2: Verificar visualmente todas as 4 áreas**

  Feche e reabra `start-painel-demo.cmd`. Verificar:

  **Topbar:**
  - Texto "Atualiza a cada 0,5 s · JSON do EA" aparece em azul-ciano (não cinza)
  - Botão "Escolher dashboard.json…" tem borda levemente azulada
  - Hover no botão acende o brilho neon

  **Títulos dos painéis:**
  - Cada `h2` (Fluxo por ativo, Alvos/Níveis, Agressão·Radar·Makers, etc.) aparece em azul-ciano com borda esquerda fina
  - Borda dos painéis ligeiramente azulada (em vez de cinza)

  **Rodapé:**
  - Texto do status aparece em azul-ciano
  - Ponto verde pulsante à esquerda do timestamp quando há leitura ativa
  - Em caso de erro: texto em vermelho, sem ponto verde
  - Em caso de stale: texto em amarelo, sem ponto verde

  **Dialog SENSE IA** (se disponível — abrir clicando na logo central do HUD):
  - Fundo com gradiente escuro profundo
  - Título "SENSE IA" em uppercase ciano brilhante
  - Borda azul sutil em volta do dialog
  - Botões primários (Gatilho FA, ⚙ Inputs) em ciano
  - Botões secundários (Guardar .md) discretos

- [ ] **Step 3: Verificar modo `realtime-optimized`**

  Abrir DevTools (F12 no painel Electron), executar no console:
  ```js
  document.documentElement.classList.add('realtime-optimized')
  ```
  Verificar que o ponto verde do rodapé para de piscar (fica fixo) e que as demais animações existentes (radar, gauges) também param — comportamento esperado.

  Remover depois:
  ```js
  document.documentElement.classList.remove('realtime-optimized')
  ```

- [ ] **Step 4: Commit final**

  ```bash
  cd "D:\Código Sense\painel-sense-desktop"
  git add index.html
  git commit -m "feat: carrega visual-coherence.css no index.html"
  ```

---

## Checklist final (spec vs plano)

- [x] Tela não salta → Tasks 1 e 2 (grid row `1fr`, `overflow: clip`)
- [x] Topbar neon → Task 3 + 4 (`.topbar`, `.hint`, `.btn-pick-json`)
- [x] Títulos neon → Task 3 + 4 (`.panel-title`, `.panel` border)
- [x] Rodapé neon → Task 3 + 4 (`.footer`, `.status`, dot animado)
- [x] Dialog IA neon → Task 3 + 4 (`.sense-ia-dialog__*`)
- [x] Animações existentes não afetadas → novo CSS só adiciona, não altera gauges/barras
- [x] Modo `realtime-optimized` → Step 3 da Task 4 verifica; dot desativa com `animation: none`
- [x] Zero JavaScript → confirmado, toda a lógica é CSS
