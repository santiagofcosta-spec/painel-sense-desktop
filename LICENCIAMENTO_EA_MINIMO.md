# Licenciamento EA - Integracao minima (etapa final)

## Objetivo

Definir uma integracao minima e segura do licenciamento no EA (`SENSE.mq5`) sem implementar codigo nesta etapa.

## Contrato de validacao

- Endpoint: `POST /v1/license/validate`
- Payload esperado do EA:
  - `licenseKey`
  - `mt5Account` (login da conta)
  - `machineHash` (hash estavel da maquina)
  - `appId` = `ea`
  - `appVersion` (versao do EA)
- Resposta assinada:
  - `ok`
  - `licenseStatus`
  - `serverTime`
  - `onlineValidUntil`
  - `graceUntil` (24h)
  - `reason`
  - `signature` (HMAC SHA-256)

## Ponto de entrada no EA

Integrar no inicio de `OnInit()`:

1. Ler configuracao local de licenca (key + URL).
2. Calcular `machineHash`.
3. Chamar validacao online com timeout curto.
4. Validar assinatura HMAC da resposta.
5. Persistir cache local assinado.
6. Se falhar rede, aceitar cache somente se `graceUntil` ainda valido.
7. Se invalido e sem grace: registrar erro e retornar `INIT_FAILED`.

## Regras de seguranca no EA

1. Nunca aceitar resposta/caches sem assinatura valida.
2. Nunca aceitar `graceUntil` no passado.
3. Rejeitar resposta com campos faltando.
4. Tratar `licenseStatus != active` como bloqueio imediato.
5. Logar motivo de bloqueio de forma explicita no Experts/Journal.

## Cache local do EA

Arquivo recomendado: `MQL5\\Files\\sense-license-cache.json`

Campos:
- `payload` (objeto assinado)
- `signature`
- `checkedAt`

Ao iniciar offline:
- validar assinatura do cache,
- verificar `graceUntil`,
- permitir apenas se valido.

## Riscos e mitigacao

1. **Timeout no `WebRequest` em `OnInit`**  
   Mitigar com timeout baixo (ex.: 2-4s) e fallback por cache grace.

2. **URL nao autorizada no MT5**  
   Mitigar com mensagem clara orientando cadastrar URL em `Allow WebRequest`.

3. **Instabilidade de rede**  
   Mitigar com `grace 24h` e cache local assinado.

4. **Falso negativo por erro de payload**  
   Mitigar com validacao estrita de campos e logs de diagnostico.

## Sequencia de rollout recomendada

1. Subir servidor e validar endpoint com painel.
2. Integrar painel Electron e estabilizar cache offline.
3. Habilitar revogacao/admin.
4. Integrar EA por ultimo, com testes controlados em conta de homologacao.
