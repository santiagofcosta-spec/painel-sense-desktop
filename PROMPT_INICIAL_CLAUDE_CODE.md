# Prompt inicial para o Claude Code — projeto SENSE

> **Como usar este arquivo:**
> 1. Abra o Claude Code com a pasta raiz `C:\Users\pc\OneDrive\Área de Trabalho\Código Sense\painel-sense-desktop` como diretório de trabalho.
> 2. Copie **apenas o conteúdo dentro do bloco "PROMPT ↓↓↓ / ↑↑↑ PROMPT"** abaixo.
> 3. Cole como primeira mensagem no Claude Code.
> 4. Leia a resposta com calma. Se ele te pedir esclarecimentos, responda. Só avance para o código quando o plano estiver claro.

---

## PROMPT ↓↓↓

Olá! Meu nome é Santiago. Antes de começarmos qualquer coisa, por favor **leia o arquivo `CLAUDE.md` desta pasta** — ele tem o contexto persistente do projeto (arquitetura, arquivos, convenções, regras obrigatórias, roadmap). Depois leia também `FORMATO_DASHBOARD.txt` para entender o contrato JSON entre o EA e o painel. Só continue depois desses dois.

### Quem sou eu

Sou iniciante em programação. Consigo ler código e fazer pequenas edições guiadas, mas dependo da IA para decisões arquiteturais. Em compensação, entendo muito de mercado financeiro: day trade de DOL/WDO, order flow, basis, Z-score, regime de mercado.

### O que é o SENSE e o que eu quero

O SENSE é um sistema em duas partes (descritas no `CLAUDE.md`): um EA MQL5 que roda dentro do MetaTrader 5 e um painel Electron que consome os dados. Hoje funciona para uso interno. **Quero transformar em produto comercial vendável a traders brasileiros de DOL/WDO.** Meu posicionamento pretendido: concorrer com ferramentas como Profit/Tryd na parte de análise de fluxo, mas focado especificamente em dólar, com IA integrada, e a um preço mais acessível.

### Seu papel nesta conversa

Você vai me ajudar em 4 tarefas, **nesta ordem**, sem pular etapas. **Não escreva código ainda em nenhuma delas** — nestas 4 tarefas eu quero apenas **análise e planejamento em texto**. Vamos executar depois, em conversas específicas, uma alteração por vez.

---

### Tarefa 1 — Auditoria técnica do painel Electron

Leia, nesta ordem:

1. `package.json`
2. `main.js` (inteiro)
3. `preload.js`
4. `dashboard-guard.js`
5. `bc-ptax-fetch.js`
6. `config.json` e `config.example.json`
7. `index.html`
8. As **primeiras 500 linhas** de `renderer.js`
9. As **primeiras 300 linhas** de `styles.css`
10. `scripts/lib/sense-ia-ask-core.js` (se existir)

Depois me devolva um **relatório de auditoria** com **exatamente** estas seções:

- **A. Resumo em 5 linhas** do que o painel faz.
- **B. O que está bom** (lista de pontos fortes reais, com referência a arquivo:linha).
- **C. O que está frágil** (lista de pontos frágeis, com referência a arquivo:linha e explicação do porquê).
- **D. Top 5 riscos de produto** — em ordem de gravidade, o que mais vai me morder quando eu começar a vender. Para cada risco, diga: (1) o que acontece se acontecer, (2) como é hoje, (3) como deveria ser.
- **E. Perguntas abertas** que você precisa que eu responda antes de poder planejar as próximas tarefas.

Regras:
- Cada item das listas em frase curta (1 a 3 linhas).
- **Não proponha soluções ainda** — só diagnóstico. Solução vem nas próximas tarefas.
- Se algum arquivo estiver muito grande para ler inteiro, me diga antes e leia um trecho representativo.

---

### Tarefa 2 — Plano de modularização do `renderer.js` e `styles.css`

Depois que eu aprovar a auditoria, me devolva um **plano de modularização** com:

- **Estrutura de pastas proposta** (ex: `panels/`, `charts/`, `store/`, `ipc/`, `utils/`). Mostre a árvore em ASCII.
- **Para cada módulo:** nome, responsabilidade em 1 linha, arquivos-origem no `renderer.js` atual que vão para lá.
- **Estratégia de migração:** vamos refatorar em quantos commits? Qual a ordem que minimiza risco de quebra visual?
- **Como testar a cada passo** (o painel precisa continuar abrindo, lendo o JSON, e renderizando igual).
- **Tempo estimado** por commit (em sessões de Claude Code, não em horas reais).

Regras:
- **Não use frameworks novos** (React, Vue, Svelte) nesta fase. JS puro + módulos CommonJS. Reduzir risco primeiro, migrar de framework é outro projeto.
- **Mantenha compatibilidade com o `dashboard.json` existente** — nada de mudar o contrato com o EA.
- **CSS também precisa plano.** 190 KB num arquivo só é insustentável.

---

### Tarefa 3 — Plano de licenciamento online

Desenhe uma arquitetura simples mas efetiva:

- **Servidor de licença:** Node.js + SQLite (começar barato; escalar depois).
- **Dados por licença:** e-mail do cliente, plano (mensal/anual), conta MT5 permitida, hash de hardware (HWID) do computador, validade, flag de ativo/revogado.
- **Fluxo de ativação:** cliente compra → recebe chave por e-mail → cola no painel → painel ativa (consultando servidor) → amarra na conta MT5 e HWID.
- **Validação no EA MQL5:** no `OnInit`, faz `WebRequest` para o servidor com HWID + conta. Se falhar, permite graça offline de X horas.
- **Validação no Electron:** no startup, consulta servidor; se offline, usa cache criptografado com TTL.
- **Revogação:** endpoint admin para desativar licença (caso de chargeback).
- **Mitigações básicas contra pirataria:** ofuscação mínima do JS, assinatura dos .ex5 (MT5 suporta), rotação periódica de challenge.

Me devolva:
- **Diagrama em ASCII** do fluxo.
- **Schema do SQLite** (CREATE TABLE).
- **Lista de endpoints HTTP** do servidor.
- **Alterações mínimas necessárias** em `SENSE.mq5` (linhas ~20-23 onde hoje está o `allowed_accounts[]`) e no `main.js` do painel.
- **Custos estimados** para hospedar o servidor (Railway, Fly.io, VPS nacional).
- **Riscos** dessa arquitetura e o que NÃO protege.

**Regra especial:** você **não** vai implementar ainda. Só desenhar.

---

### Tarefa 4 — Plano de distribuição para Windows

Checklist prático em ordem cronológica do que precisa para eu mandar um `.exe` pagável e instalável para um cliente:

- electron-builder ou electron-forge — qual e por quê.
- Configuração de ícone (já tenho em `assets/`).
- Auto-updater (squirrel.windows / update servers).
- **Code signing** — custos em BRL e etapas burocráticas para obter certificado EV (obrigatório no Brasil para evitar SmartScreen).
- Hospedagem dos instaladores (S3/R2/Backblaze, custo estimado).
- Testes mínimos antes do primeiro cliente pagar.
- Canal de suporte inicial (WhatsApp, e-mail, Discord?).
- **Estimativa total de custo** para colocar em pé (uma linha por item, em BRL/mês e BRL/único).

---

### Regras gerais desta conversa

1. **Nunca edite código sem minha permissão explícita na mesma mensagem.** Nestas 4 tarefas, é só planejamento.
2. **Nunca toque em `SENSE.mq5`** (fora desta pasta, em `C:\Users\pc\OneDrive\Área de Trabalho\SENSE 2026\FONTE\Santiago EA\SENSE.mq5`) sem autorização explícita minha.
3. **Antes da primeira alteração real de código** (em conversas futuras), você vai me ajudar a inicializar git e fazer um commit de snapshot. Sem rede de segurança não mexemos em nada.
4. **Se tiver qualquer dúvida**, pergunte antes de assumir. Prefiro responder 3 perguntas do que refazer 1 coisa.
5. **Comentários e commits em português.**
6. **Explique decisões técnicas com analogia simples** quando for algo que iniciante pode não entender — mas sem infantilizar.
7. **Sempre termine cada tarefa dizendo o que vem depois** e esperando minha aprovação para avançar.

### Primeira ação

Antes de qualquer coisa: **leia `CLAUDE.md` e `FORMATO_DASHBOARD.txt`**. Depois me confirme que leu, em 3 linhas, e comece a **Tarefa 1** (auditoria).

## ↑↑↑ PROMPT
