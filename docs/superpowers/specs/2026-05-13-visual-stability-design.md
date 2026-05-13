# Design: Estabilidade de layout + coesão visual neon

**Data:** 2026-05-13  
**Projeto:** Painel SENSE Desktop (Electron)  
**Escopo:** Corrigir layout que salta durante atualizações + uniformizar visual neon em 4 áreas  
**Abordagem escolhida:** B — Estabilidade + coesão neon completa (sem animações extras)

---

## Problemas a resolver

### 1. Layout instável (tela salta a cada 0,5 s)

A tela inteira desloca-se verticalmente a cada ciclo de atualização do JSON. Causa: três propriedades CSS combinadas.

| Arquivo | Seletor | Propriedade problemática | Efeito |
|---|---|---|---|
| `0021-shell.css` | `.grid` | `grid-template-rows: minmax(100px, auto)` na linha 1 | A linha cresce quando o conteúdo cresce, empurrando as linhas abaixo |
| `0021-shell.css` | `.grid` | `overflow-y: auto` | Quando a altura total muda, o scroll reposiciona |
| `0021-shell.css` | `.panel` | `overflow-y: visible` | Conteúdo transborda o painel e participa do layout externo |
| `0022-shell.css` | `.panel-tl` | `overflow-y: visible` | Idem para painel superior esquerdo |
| `0023-shell.css` | `.panel-tr` | `overflow-y: visible` | Idem para painel superior direito |

### 2. Áreas visuais inconsistentes com o padrão neon

Quatro zonas do painel usam estilos genéricos (texto cinza simples, botões sem glow) enquanto o conteúdo interno dos painéis (valores, barras, gauges) já tem tratamento neon completo:

- **Barra superior (topbar):** hint text, botão "Escolher JSON", caminho do arquivo
- **Títulos dos painéis (h2.panel-title):** fonte simples sem glow, sem âncora visual
- **Rodapé de status (.footer / .status):** texto plano sem hierarquia visual
- **Dialog da SENSE IA:** fundo, título, botões e tags kbd sem identidade neon

---

## Design da solução

### Parte 1 — Estabilidade de layout

**Estratégia:** tornar os painéis contêineres fechados. O conteúdo se adapta internamente sem deslocar o layout externo.

**Mudanças em `styles/semantic/0021-shell.css`:**

```css
/* ANTES */
grid-template-rows:
  minmax(100px, auto)      /* linha 1 cresce com conteúdo */
  minmax(255px, 1.58fr)
  minmax(200px, 1.12fr);
overflow-y: auto;          /* scroll reposiciona ao mudar altura */

/* DEPOIS */
grid-template-rows:
  minmax(100px, 1fr)       /* linha 1 proporcional — não cresce */
  minmax(255px, 1.58fr)
  minmax(200px, 1.12fr);
overflow-y: hidden;        /* sem reposicionamento de scroll */
```

```css
/* ANTES — .panel */
overflow-y: visible;

/* DEPOIS */
overflow-y: clip;          /* corta conteúdo sem criar scroll nem afetar layout */
```

**Mudanças em `styles/semantic/0022-shell.css` (`.panel-tl`) e `0023-shell.css` (`.panel-tr`):**

```css
/* ANTES */
overflow-y: visible;

/* DEPOIS */
overflow-y: clip;
```

> `overflow: clip` foi escolhido sobre `hidden` porque não cria um novo contexto de formatação, evitando efeitos colaterais em `position: absolute` internos aos painéis.

**Parte 1 não requer mudanças em JavaScript.** O ciclo de atualização de 0,5 s continua igual.

---

### Parte 2 — Coesão visual neon

**Estratégia:** um único arquivo CSS novo (`styles/extras/visual-coherence.css`) com seletores de especificidade ligeiramente maior que sobrepõem os estilos actuais. Os arquivos semânticos existentes não são editados.

Uma linha nova em `index.html` carrega o arquivo após os demais:

```html
<link rel="stylesheet" href="styles/extras/visual-coherence.css?v=20260513neon1" />
```

**Tokens CSS usados (já existem em `0001-tokens.css`):**

| Token | Valor | Uso |
|---|---|---|
| `--speed-pos` | `#38bdf8` | Ciano primário |
| `--speed-pos-soft` | `#7dd3fc` | Ciano suave (textos secundários) |
| `--ui-text-muted` | `#99abc9` | Texto muted |

#### 2a. Barra superior

```css
/* topbar — borda neon sutil */
.topbar {
  border-bottom-color: rgba(56, 189, 248, 0.12);
  background: linear-gradient(90deg, #0a0f1c 0%, #080c16 100%);
}

/* hint text — ciano suave */
.hint {
  color: var(--speed-pos-soft);
  text-shadow: 0 0 8px rgba(56, 189, 248, 0.25);
  letter-spacing: 0.02em;
}

/* botão escolher JSON */
.btn-pick-json {
  color: var(--speed-pos-soft);
  border-color: rgba(56, 189, 248, 0.4);
  box-shadow: 0 0 6px rgba(56, 189, 248, 0.1);
}
.btn-pick-json:hover {
  color: var(--speed-pos);
  border-color: rgba(56, 189, 248, 0.6);
  box-shadow: 0 0 10px rgba(56, 189, 248, 0.2);
}
```

#### 2b. Títulos dos painéis

```css
/* todos os h2 de painel */
.panel-title {
  color: var(--speed-pos-soft);
  text-shadow: 0 0 8px rgba(56, 189, 248, 0.3);
  border-left: 2px solid rgba(56, 189, 248, 0.5);
  padding-left: 6px;
}

/* borda do painel levemente azulada */
.panel {
  border-color: rgba(56, 189, 248, 0.14);
}
```

#### 2c. Rodapé de status

O `.footer` ganha hierarquia visual com um dot animado de "ao vivo" e separação entre dado principal (timestamp, ciano) e metadados (caminho/tamanho, cinza escuro).

```css
.footer {
  background: linear-gradient(90deg, #080c16 0%, #070b12 100%);
  border-top-color: rgba(56, 189, 248, 0.1);
  display: flex;
  align-items: center;
  gap: 7px;
}

/* dot "ao vivo" — aparece quando status NÃO tem classe error nem warning
   (o renderer já usa className="status" para o estado normal — sem JS extra) */
.status:not(.error):not(.warning)::before {
  content: "";
  display: inline-block;
  width: 5px; height: 5px;
  border-radius: 50%;
  background: #22c55e;
  box-shadow: 0 0 6px #22c55e;
  margin-right: 6px;
  animation: sense-dot-pulse 2.2s ease-in-out infinite;
  vertical-align: middle;
}

@keyframes sense-dot-pulse {
  0%, 100% { opacity: 0.5; box-shadow: 0 0 4px #22c55e; }
  50%       { opacity: 1;   box-shadow: 0 0 8px #22c55e, 0 0 14px rgba(34,197,94,0.3); }
}

.status { color: var(--speed-pos-soft); }
```

> O seletor `:not(.error):not(.warning)` usa as classes já aplicadas pelo `renderer-render-view.js` — nenhuma mudança de JavaScript necessária.

#### 2d. Dialog da SENSE IA

```css
/* painel do dialog */
.sense-ia-dialog__panel {
  background: linear-gradient(135deg, #080d1c 0%, #060a16 100%);
  border: 1px solid rgba(56, 189, 248, 0.22);
  box-shadow: 0 0 24px rgba(0, 80, 200, 0.08),
              inset 0 0 16px rgba(0, 40, 100, 0.05);
}

/* título SENSE IA */
.sense-ia-dialog__title {
  color: var(--speed-pos);
  text-shadow: 0 0 12px rgba(56, 189, 248, 0.5);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

/* metadados (data, modelo) */
#senseIaMeta {
  color: #334155;
  letter-spacing: 0.03em;
}

/* separadores internos */
.sense-ia-dialog__body {
  border-top-color: rgba(56, 189, 248, 0.1);
  border-bottom-color: rgba(56, 189, 248, 0.1);
}

/* tags kbd */
.sense-ia-dialog__kbd {
  border: 1px solid rgba(56, 189, 248, 0.2);
  color: var(--speed-pos-soft);
  background: rgba(0, 0, 0, 0.4);
}

/* botões de ação primários (Gatilho FA, ⚙ Inputs) */
.sense-ia-dialog__action-btn {
  color: var(--speed-pos);
  border-color: rgba(56, 189, 248, 0.45);
  background: linear-gradient(135deg, rgba(8,18,44,0.9), rgba(6,13,32,0.95));
  box-shadow: 0 0 7px rgba(56, 189, 248, 0.12);
  letter-spacing: 0.04em;
}
.sense-ia-dialog__action-btn:hover {
  border-color: rgba(56, 189, 248, 0.65);
  box-shadow: 0 0 12px rgba(56, 189, 248, 0.2);
}

/* botões secundários (guardar .md, exportar, copiar) */
.sense-ia-dialog__save-md-btn,
.sense-ia-dialog__copy-context-btn {
  color: #475569;
  border-color: rgba(56, 189, 248, 0.15);
  background: rgba(7, 12, 30, 0.7);
}
```

---

## Arquivos modificados

| Arquivo | Tipo | Mudança |
|---|---|---|
| `styles/semantic/0021-shell.css` | CSS existente | 3 propriedades: grid row 1, overflow grid, overflow panel |
| `styles/semantic/0022-shell.css` | CSS existente | 1 propriedade: overflow panel-tl |
| `styles/semantic/0023-shell.css` | CSS existente | 1 propriedade: overflow panel-tr |
| `styles/extras/visual-coherence.css` | **CSS novo** | Todas as mudanças de identidade visual |
| `index.html` | HTML existente | 1 linha: `<link>` para o novo CSS |
**Total: 5 arquivos, nenhuma refatoração, zero mudanças em JavaScript.**

---

## Critérios de sucesso

- [ ] Tela não desloca verticalmente durante atualizações de 0,5 s
- [ ] Topbar, títulos, rodapé e dialog da IA têm aparência visualmente consistente com os painéis internos
- [ ] Animações existentes (radar, gauges, barras) não são afetadas
- [ ] Modo `realtime-optimized` continua funcionando (desativa animações)
- [ ] Nenhum painel perde conteúdo de forma inesperada com `overflow: clip`

---

## Riscos e mitigações

| Risco | Probabilidade | Mitigação |
|---|---|---|
| `overflow: clip` cortar elementos com `position: absolute` que precisam aparecer fora do painel | Baixa | Verificar visualmente cada painel; se necessário, usar `overflow: hidden` apenas no eixo Y (`overflow-x: clip; overflow-y: clip`) |
| `1fr` na linha 1 da grid deixar pouco espaço para Fluxo/Níveis em janelas pequenas | Baixa | O `minmax(100px, 1fr)` garante mínimo de 100px; testar com janela em ~800px de altura |
| CSS novo sobrepor estilos que não deveria | Baixa | Todo seletor no `visual-coherence.css` usa especificidade idêntica ou +1 classe; revisar no DevTools |
