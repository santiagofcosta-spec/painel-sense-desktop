/**
 * Validação única do snapshot dashboard.json — usada em main.js (Node) e no renderer (browser).
 * Não alterar só num dos lados: editar sempre este ficheiro.
 */
"use strict";

function isProbablyCompleteDashboard(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const k = Object.keys(data);
  if (k.length === 0) return false;
  if (k.length >= 8) return true;
  return (
    "buy" in data ||
    "sell" in data ||
    "placarLine" in data ||
    "flow" in data ||
    "levels" in data ||
    "delta" in data ||
    "aggression" in data ||
    "radar" in data ||
    "makers" in data ||
    "alert" in data
  );
}

function hudSnapshotLooksStable(data) {
  if (!data || typeof data !== "object") return false;
  const rad = data.radar;
  if (!rad || typeof rad !== "object") return false;
  const radarKeys = ["dir", "peaks", "persist", "saldoPicos", "saldoPersist", "flip"];
  for (const key of radarKeys) {
    if (typeof rad[key] !== "string" || rad[key].trim().length === 0) return false;
  }
  const mk = data.makers;
  if (!mk || typeof mk !== "object") return false;
  if (typeof mk.mini !== "string" || mk.mini.trim().length === 0) return false;
  if (typeof mk.ref !== "string" || mk.ref.trim().length === 0) return false;
  if (typeof data.aggression !== "string" || data.aggression.trim().length === 0) return false;
  return true;
}

function flowBlockStable(f) {
  if (!f || typeof f !== "object") return false;
  const z1 = Number(f.zMini);
  const z2 = Number(f.zRef);
  const n = Number(f.ntslZ);
  const t = Number(f.trendDir);
  return Number.isFinite(z1) && Number.isFinite(z2) && Number.isFinite(n) && Number.isFinite(t);
}

function deltaBlockStable(d) {
  if (!d || typeof d !== "object") return false;
  const required = ["streak", "buyPct", "sellPct", "deltaPct", "buyVol", "sellVol"];
  for (const k of required) {
    if (!(k in d)) return false;
    if (d[k] === undefined || d[k] === null) return false;
  }
  /* hammer pode faltar em builds antigos do EA; null é aceite. */
  if ("hammer" in d && d.hammer === undefined) return false;
  return true;
}

function fullDashboardSnapshotStable(data) {
  if (!hudSnapshotLooksStable(data)) return false;
  const sv = Number(data.schemaVersion || 1);
  if (sv >= 2 && "flow" in data && data.flow != null) {
    if (!flowBlockStable(data.flow)) return false;
  }
  if (sv >= 3 && "delta" in data && data.delta != null) {
    if (!deltaBlockStable(data.delta)) return false;
  }
  return true;
}

const api = {
  isProbablyCompleteDashboard,
  dashboardPayloadLooksComplete: isProbablyCompleteDashboard,
  hudSnapshotLooksStable,
  flowBlockStable,
  deltaBlockStable,
  fullDashboardSnapshotStable,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = api;
}
if (typeof window !== "undefined") {
  window.DashboardGuard = api;
}
