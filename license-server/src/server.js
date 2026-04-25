const express = require("express");
const { openDb, migrate, DATABASE_URL } = require("./db");
const createValidateRouter = require("./routes/validate");
const createAdminRouter = require("./routes/admin");

const PORT = Number(process.env.PORT || 8787);
const LICENSE_HMAC_SECRET = String(process.env.LICENSE_HMAC_SECRET || "").trim();
const ADMIN_TOKEN = String(process.env.ADMIN_TOKEN || "").trim();
const ONLINE_VALID_MS = Math.max(60_000, Number(process.env.ONLINE_VALID_MS || 15 * 60 * 1000));
const GRACE_MS = Math.max(60_000, Number(process.env.GRACE_MS || 24 * 60 * 60 * 1000));

if (!LICENSE_HMAC_SECRET) {
  console.error("[license-server] LICENSE_HMAC_SECRET ausente.");
  process.exit(1);
}
if (!ADMIN_TOKEN) {
  console.error("[license-server] ADMIN_TOKEN ausente.");
  process.exit(1);
}

async function bootstrap() {
  const db = openDb();
  await migrate(db);

  const app = express();
  app.use(express.json({ limit: "256kb" }));

  app.get("/health", (_req, res) => {
    res.status(200).json({ ok: true, db: "postgres", hasDatabaseUrl: Boolean(DATABASE_URL) });
  });

  app.use(
    "/v1/license",
    createValidateRouter({
      db,
      licenseSecret: LICENSE_HMAC_SECRET,
      onlineValidMs: ONLINE_VALID_MS,
      graceMs: GRACE_MS,
    })
  );
  app.use(
    "/v1/admin",
    createAdminRouter({
      db,
      adminToken: ADMIN_TOKEN,
    })
  );

  app.listen(PORT, () => {
    console.log(`[license-server] listening on :${PORT}`);
    console.log("[license-server] db: postgres");
  });
}

bootstrap().catch((e) => {
  console.error("[license-server] bootstrap:", e);
  process.exit(1);
});
