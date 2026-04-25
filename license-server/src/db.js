const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();
const MIGRATION_PATH = path.join(__dirname, "migrations", "001_init.sql");

function resolveSslConfig() {
  const legacyPgssl = String(process.env.PGSSL || "").trim().toLowerCase();
  if (legacyPgssl === "disable") return false;

  const mode = String(process.env.PGSSL_MODE || "").trim().toLowerCase();
  if (!mode || mode === "insecure") {
    return { rejectUnauthorized: false };
  }
  if (mode === "disable") return false;
  if (mode === "strict") {
    const ca = String(process.env.PGSSL_CA || "").trim();
    if (!ca) {
      throw new Error("PGSSL_MODE=strict exige PGSSL_CA com o certificado da CA.");
    }
    return { rejectUnauthorized: true, ca };
  }
  throw new Error("PGSSL_MODE invalido. Use: disable | insecure | strict.");
}

function openDb() {
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL ausente. Configure o Postgres no ambiente.");
  }
  return new Pool({
    connectionString: DATABASE_URL,
    ssl: resolveSslConfig(),
  });
}

async function run(db, sql, params = []) {
  const r = await db.query(sql, params);
  return { changes: r.rowCount || 0 };
}

async function get(db, sql, params = []) {
  const r = await db.query(sql, params);
  return r.rows && r.rows.length > 0 ? r.rows[0] : null;
}

async function all(db, sql, params = []) {
  const r = await db.query(sql, params);
  return r.rows || [];
}

async function migrate(db) {
  const sql = fs.readFileSync(MIGRATION_PATH, "utf8");
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  await run(db, "BEGIN");
  try {
    for (const stmt of statements) {
      await run(db, stmt);
    }
    await run(db, "COMMIT");
  } catch (e) {
    await run(db, "ROLLBACK");
    throw e;
  }
}

module.exports = {
  DATABASE_URL,
  openDb,
  run,
  get,
  all,
  migrate,
};
