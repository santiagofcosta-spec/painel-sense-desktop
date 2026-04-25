# License Server (Tarefa 3)

## Variaveis de ambiente

- `PORT` (default `8787`)
- `DATABASE_URL` (PostgreSQL, obrigatoria)
- `LICENSE_HMAC_SECRET` (obrigatoria)
- `ADMIN_TOKEN` (obrigatoria)
- `ONLINE_VALID_MS` (default 15 min)
- `GRACE_MS` (default 24h)

## Execucao

```bash
cd license-server
npm install
npm start
```

## Deploy em Hostinger + Easypanel

1. Criar banco PostgreSQL no Easypanel e obter `DATABASE_URL`.
2. Criar app a partir da pasta `license-server/` (Dockerfile incluso).
3. Configurar envs:
   - `DATABASE_URL`
   - `LICENSE_HMAC_SECRET`
   - `ADMIN_TOKEN`
   - `PORT=8787`
4. Expor via dominio/subdominio com HTTPS.

## Endpoints

- `GET /health`
- `POST /v1/license/validate`
- `POST /v1/admin/licenses` (header `x-admin-token`)
- `POST /v1/admin/licenses/revoke` (header `x-admin-token`)
- `GET /v1/admin/licenses/:licenseKey` (header `x-admin-token`)
