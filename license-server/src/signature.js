const crypto = require("crypto");

function stableStringify(value) {
  if (Array.isArray(value)) return "[" + value.map((x) => stableStringify(x)).join(",") + "]";
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort((a, b) => a.localeCompare(b));
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(value[k])).join(",") + "}";
  }
  return JSON.stringify(value);
}

function signPayload(payload, secret) {
  const canonical = stableStringify(payload);
  const signature = crypto.createHmac("sha256", String(secret)).update(canonical, "utf8").digest("hex");
  return { signature, canonical };
}

module.exports = {
  stableStringify,
  signPayload,
};
