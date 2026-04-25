#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

function sha256Hex(text) {
  return crypto.createHash("sha256").update(String(text), "utf8").digest("hex");
}

function hmacSha256Hex(secret, text) {
  return crypto
    .createHmac("sha256", String(secret))
    .update(String(text), "utf8")
    .digest("hex");
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return "[" + value.map((x) => stableStringify(x)).join(",") + "]";
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort((a, b) => a.localeCompare(b));
    return (
      "{" +
      keys
        .map((k) => JSON.stringify(k) + ":" + stableStringify(value[k]))
        .join(",") +
      "}"
    );
  }
  return JSON.stringify(value);
}

function getArg(name, fallback = "") {
  const pref = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(pref));
  if (!hit) return fallback;
  return hit.slice(pref.length);
}

function machineFingerprint() {
  const host = String(os.hostname() || "").trim().toLowerCase();
  let user = "";
  try {
    user = String(os.userInfo().username || "").trim().toLowerCase();
  } catch (e) {
    user = String(process.env.USERNAME || process.env.USER || "").trim().toLowerCase();
  }
  const salt = String(getArg("salt", process.env.SENSE_MACHINE_SALT || "")).trim();
  const platform = `${process.platform}|${process.arch}`;
  return sha256Hex(`${host}|${user}|${platform}|${salt}`);
}

function signDashboardJson() {
  const input = process.argv[3];
  const field = String(getArg("field", "_sig") || "_sig").trim();
  const secret = String(process.env.SENSE_DASH_SIG_SECRET || getArg("secret", "")).trim();
  if (!secret) {
    throw new Error("Defina SENSE_DASH_SIG_SECRET ou --secret=...");
  }
  if (!input) {
    throw new Error("Uso: npm run security:sign -- <caminho_dashboard_json> [--field=_sig]");
  }
  const p = path.resolve(process.cwd(), input);
  if (!fs.existsSync(p)) throw new Error(`Arquivo não encontrado: ${p}`);
  const raw = fs.readFileSync(p, "utf8");
  const data = JSON.parse(raw);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("O dashboard.json precisa ser um objeto JSON.");
  }
  const payload = { ...data };
  delete payload[field];
  const sig = hmacSha256Hex(secret, stableStringify(payload));
  data[field] = sig;
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + "\n", "utf8");
  console.log(`Assinado com sucesso: ${p}`);
  console.log(`Campo: ${field}`);
  console.log(`Assinatura: ${sig}`);
}

function main() {
  const cmd = String(process.argv[2] || "").trim().toLowerCase();
  if (cmd === "fingerprint") {
    console.log(machineFingerprint());
    return;
  }
  if (cmd === "sign") {
    signDashboardJson();
    return;
  }
  console.log("Comandos:");
  console.log("  fingerprint           -> imprime fingerprint desta máquina");
  console.log("  sign <arquivo.json>   -> assina dashboard.json com HMAC-SHA256");
  process.exitCode = 1;
}

try {
  main();
} catch (e) {
  console.error("[security-tools] erro:", e.message || String(e));
  process.exitCode = 1;
}
