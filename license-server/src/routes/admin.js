const express = require("express");
const { get, run, all } = require("../db");

function requireAdminToken(adminToken) {
  return function auth(req, res, next) {
    const token = String(req.headers["x-admin-token"] || "");
    if (!adminToken || token !== adminToken) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    return next();
  };
}

module.exports = function createAdminRouter(ctx) {
  const { db, adminToken } = ctx;
  const router = express.Router();
  router.use(requireAdminToken(adminToken));

  router.post("/licenses", async (req, res) => {
    const { licenseKey, customerName = "", plan = "default", expiresAt = null, maxMachines = 1 } = req.body || {};
    if (!licenseKey) return res.status(400).json({ ok: false, error: "licenseKey obrigatório" });
    try {
      await run(
        db,
        `INSERT INTO licenses (licenseKey, customerName, status, plan, expiresAt, maxMachines)
         VALUES ($1, $2, 'active', $3, $4, $5)`,
        [String(licenseKey).trim(), String(customerName), String(plan), expiresAt, Math.max(1, Number(maxMachines) || 1)]
      );
      return res.status(201).json({ ok: true });
    } catch (e) {
      return res.status(400).json({ ok: false, error: e.message || "insert_failed" });
    }
  });

  router.post("/licenses/revoke", async (req, res) => {
    const { licenseKey, reason = "manual_revoke" } = req.body || {};
    if (!licenseKey) return res.status(400).json({ ok: false, error: "licenseKey obrigatório" });
    try {
      const license = await get(db, `SELECT id FROM licenses WHERE licenseKey = $1`, [String(licenseKey).trim()]);
      if (!license) return res.status(404).json({ ok: false, error: "license_not_found" });
      await run(
        db,
        `UPDATE licenses SET status = 'revoked', updatedAt = now() WHERE id = $1`,
        [license.id]
      );
      await run(
        db,
        `INSERT INTO license_events (licenseId, eventType, payloadJson)
         VALUES ($1, 'revoked', $2)`,
        [license.id, JSON.stringify({ reason })]
      );
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message || "revoke_failed" });
    }
  });

  router.get("/licenses/:licenseKey", async (req, res) => {
    const key = String(req.params.licenseKey || "").trim();
    if (!key) return res.status(400).json({ ok: false, error: "licenseKey inválido" });
    try {
      const license = await get(
        db,
        `SELECT id, licenseKey, customerName, status, plan, expiresAt, maxMachines, createdAt, updatedAt
         FROM licenses WHERE licenseKey = $1`,
        [key]
      );
      if (!license) return res.status(404).json({ ok: false, error: "license_not_found" });
      const bindings = await all(
        db,
        `SELECT mt5Account, machineHash, firstSeenAt, lastSeenAt, lastIp
         FROM license_bindings WHERE licenseId = $1 ORDER BY lastSeenAt DESC`,
        [license.id]
      );
      return res.status(200).json({ ok: true, license, bindings });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message || "query_failed" });
    }
  });

  return router;
};
