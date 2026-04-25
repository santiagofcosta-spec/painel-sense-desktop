const express = require("express");
const { get, run, all } = require("../db");
const { signPayload } = require("../signature");

function parseIsoDate(s) {
  if (!s) return null;
  const d = new Date(String(s));
  return Number.isNaN(d.getTime()) ? null : d;
}

function toIsoNow() {
  return new Date().toISOString();
}

function buildDeniedResponse(reason, nowIso, onlineMs, graceMs) {
  const now = new Date(nowIso);
  return {
    ok: false,
    licenseStatus: "denied",
    serverTime: nowIso,
    onlineValidUntil: new Date(now.getTime() + onlineMs).toISOString(),
    graceUntil: new Date(now.getTime() + graceMs).toISOString(),
    reason,
  };
}

module.exports = function createValidateRouter(ctx) {
  const { db, licenseSecret, onlineValidMs, graceMs } = ctx;
  const router = express.Router();

  router.post("/validate", async (req, res) => {
    const { licenseKey, mt5Account, machineHash, appId, appVersion } = req.body || {};
    if (!licenseKey || !mt5Account || !machineHash || !appId) {
      return res.status(400).json({ ok: false, error: "Campos obrigatórios: licenseKey, mt5Account, machineHash, appId" });
    }

    const nowIso = toIsoNow();
    let license = null;
    try {
      license = await get(
        db,
        `SELECT
           id,
           licenseKey AS "licenseKey",
           customerName AS "customerName",
           status,
           plan,
           expiresAt AS "expiresAt",
           maxMachines AS "maxMachines"
         FROM licenses WHERE licenseKey = $1`,
        [String(licenseKey).trim()]
      );
      if (!license) {
        const payload = buildDeniedResponse("license_not_found", nowIso, onlineValidMs, graceMs);
        const { signature } = signPayload(payload, licenseSecret);
        return res.status(200).json({ ...payload, signature });
      }

      const exp = parseIsoDate(license.expiresAt);
      if (exp && exp.getTime() < Date.now()) {
        license.status = "expired";
      }

      if (license.status !== "active") {
        const payload = buildDeniedResponse(`license_${license.status}`, nowIso, onlineValidMs, graceMs);
        const { signature } = signPayload(payload, licenseSecret);
        await run(
          db,
          `INSERT INTO license_events (licenseId, eventType, payloadJson)
           VALUES ($1, 'validate_denied', $2)`,
          [license.id, JSON.stringify({ reason: payload.reason, appId, appVersion, mt5Account })]
        );
        return res.status(200).json({ ...payload, signature });
      }

      const bindings = await all(
        db,
        `SELECT
           id,
           mt5Account AS "mt5Account",
           machineHash AS "machineHash"
         FROM license_bindings WHERE licenseId = $1`,
        [license.id]
      );
      const exact = bindings.find((b) => b.mt5Account === String(mt5Account) && b.machineHash === String(machineHash));
      if (!exact && bindings.length >= Math.max(1, Number(license.maxMachines) || 1)) {
        const payload = buildDeniedResponse("max_machines_exceeded", nowIso, onlineValidMs, graceMs);
        const { signature } = signPayload(payload, licenseSecret);
        await run(
          db,
          `INSERT INTO license_events (licenseId, eventType, payloadJson)
           VALUES ($1, 'validate_denied', $2)`,
          [license.id, JSON.stringify({ reason: payload.reason, appId, appVersion, mt5Account, machineHash })]
        );
        return res.status(200).json({ ...payload, signature });
      }

      if (!exact) {
        await run(
          db,
          `INSERT INTO license_bindings (licenseId, mt5Account, machineHash, lastIp)
           VALUES ($1, $2, $3, $4)`,
          [license.id, String(mt5Account), String(machineHash), String(req.ip || "")]
        );
        await run(
          db,
          `INSERT INTO license_events (licenseId, eventType, payloadJson)
           VALUES ($1, 'bind_created', $2)`,
          [license.id, JSON.stringify({ appId, appVersion, mt5Account, machineHash })]
        );
      } else {
        await run(
          db,
          `UPDATE license_bindings
           SET lastSeenAt = now(), lastIp = $1
           WHERE id = $2`,
          [String(req.ip || ""), exact.id]
        );
      }

      const now = new Date(nowIso);
      const payload = {
        ok: true,
        licenseStatus: "active",
        serverTime: nowIso,
        onlineValidUntil: new Date(now.getTime() + onlineValidMs).toISOString(),
        graceUntil: new Date(now.getTime() + graceMs).toISOString(),
        reason: "",
      };
      const { signature } = signPayload(payload, licenseSecret);
      await run(
        db,
        `INSERT INTO license_events (licenseId, eventType, payloadJson)
         VALUES ($1, 'validate_ok', $2)`,
        [license.id, JSON.stringify({ appId, appVersion, mt5Account, machineHash })]
      );
      return res.status(200).json({ ...payload, signature });
    } catch (e) {
      console.error("[license-server] validate:", e);
      return res.status(500).json({ ok: false, error: "internal_error" });
    }
  });

  return router;
};
