# Tarefa 2 - Plano de Modularizacao

Status: CONCLUIDA (2.1 a 2.5)

## Objetivo

Consolidar a modularizacao ja iniciada no renderer e no CSS, reduzindo acoplamento por ordem de scripts, side-effects duplicados e hotspots de manutencao.

## Estado Atual (resumo)

- Renderer dividido em varios arquivos `renderer-*.js`, ainda com carga por ordem de `<script>`.
- Estado central em `window.SenseRendererState`.
- CSS semantico em `styles/semantic/*` gerado por `scripts/split-css-semantic.js`.
- `styles.css` atua como agregador via `@import`.

## Fase 1 (baixo risco, executar agora)

1. Eliminar side-effects duplicados no ciclo de render.
2. Definir ponto unico para atualizacao de memoria transitoria (gatilho/regime).
3. Ajustar assinaturas de funcoes para refletir responsabilidades reais.
4. Validar funcionamento com smoke test do painel.

### Entregas da Fase 1

- Atualizacao de memoria do triangulo de preparo de gatilho centralizada no nucleo (`renderer-render-view.js`).
- Remocao da chamada duplicada em `renderer-render-view-panels.js`.
- Assinaturas e chamadas ajustadas (`paintDashboardFlowAndRegime`).

## Fase 2 (baixo-medio risco)

1. Quebrar `renderer-gatilho.js` em submodulos internos:
   - calculo/heuristica,
   - memoria/timers,
   - render HTML.
2. Quebrar `renderer-hud.js` com a mesma abordagem.
3. Manter API global de fachada para compatibilidade com a ordem atual de scripts.

## Fase 3 (medio risco controlado)

1. Migrar para entrypoint unico de renderer (ESM/bundler), removendo dependencia de ordem manual.
2. Transformar contratos implicitos em contratos explicitos (imports/export).
3. Reagrupar CSS semantico por dominio estavel (`hud.css`, `gatilho.css`, etc.) mantendo validacao automatica.

## Execucao concluida (2.1 -> 2.5)

### 2.1 - Gatilho memoria extraido

- Criado `renderer-gatilho-memory.js`.
- Movidos timers/memoria/contexto:
  - `gatilhoReadyBool`
  - `updateGatilhoHoldTimers`
  - `updateRegimeConfiavelMemory`
  - `updateGatilhoPrepTriangleMemory`
  - `updateContextoPctFromFlowBox`
- `renderer-gatilho.js` mantido como modulo de render/regras com contrato explicito.

### 2.2 - HUD metricas extraidas

- Criado `renderer-hud-metrics.js`.
- Movidos gauges e helpers de forca/medidor/direcao usados pelo HUD.
- `renderer-hud.js` agora depende de contrato explicito de metricas.

### 2.3 - Contratos comuns de dependencia

- Criado `renderer-contracts.js` com:
  - `ensureRendererFns(...)`
  - `ensureRendererState(...)`
- Aplicado em modulos centrais para reduzir repeticao de guards e padronizar erros.

### 2.4 - Desacoplamento adicional no nucleo

- `renderer-render-view.js` recebeu:
  - `getDashboardRenderBoxes()`
  - `runDashboardPanelsAndPersist(...)`
- `renderer.js` ficou mais enxuto, delegando pipeline final ao nucleo de view.
- Reducao de acoplamento direto com etapas internas de consenso/debounce/pintura.

### 2.5 - Fecho operacional e manutencao

- Plano consolidado neste documento.
- Checklist de manutencao definido abaixo.
- Criterios de pronto confirmados.

## Prioridades Tecnicas

1. `renderer-gatilho.js`
2. `renderer-hud.js`
3. `renderer-render-view.js`
4. `renderer-render-view-panels.js`
5. pipeline CSS semantico (`scripts/split-css-semantic.js` + `styles/semantic/*`)

## Criterio de Pronto da Tarefa 2

- Sem side-effects duplicados no caminho principal de render.
- Responsabilidades de cada modulo documentadas.
- Backlog faseado definido para execucao incremental sem regressao visual.

## Checklist de manutencao (pos-Tarefa 2)

1. Ao criar modulo novo `renderer-*`, adicionar o script no `index.html` na ordem correta de dependencia.
2. Declarar dependencias com `ensureRendererFns/ensureRendererState` no topo do modulo.
3. Evitar duplicar side-effects de memoria/timer em mais de um ponto do ciclo de render.
4. Manter `renderer.js` como orquestrador enxuto; mover regra de detalhe para modulos de dominio.
5. Em mudancas CSS estruturais, regenerar e validar:
   - `npm run css:semantic`
   - `npm run css:verify`
