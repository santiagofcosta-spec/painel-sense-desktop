/**
 * HUD (metricas/medidores): gauges de Delta%, barras de fluxo e helpers de direcao.
 * Carregar antes de renderer-hud.js.
 */
(function () {
  "use strict";
  if (typeof window === "undefined") {
    throw new Error("Painel SENSE: ambiente sem window.");
  }
  if (typeof escapeHtml !== "function") {
    throw new Error("Painel SENSE: falta renderer-utils.js antes de renderer-hud-metrics.js (ver index.html).");
  }
  if (!window.SenseRendererState || typeof window.SenseRendererState !== "object") {
    throw new Error("Painel SENSE: falta renderer-state.js antes de renderer-hud-metrics.js (ver index.html).");
  }
})();

const RADAR_DELTA_PCT_GAUGE_CAP = 100;

function radarDeltaPctGaugePct(value, cap) {
  if (!Number.isFinite(value) || cap <= 0) return 50;
  const t = Math.max(-1, Math.min(1, value / cap));
  return 50 + t * 50;
}

function radarDeltaPctGaugeClass(v) {
  if (v == null || !Number.isFinite(v)) return "radar-delta-gauge--empty";
  if (Math.abs(v) < 1e-6) return "radar-delta-gauge--neut";
  return v > 0 ? "radar-delta-gauge--pos" : "radar-delta-gauge--neg";
}

function radarDeltaPctMotionModifier(kind, v, ok) {
  const prev =
    kind === "persist"
      ? window.SenseRendererState.lastDeltaPctPersist
      : kind === "pico"
        ? window.SenseRendererState.lastDeltaPctPico
        : null;
  if (kind !== "pico" && kind !== "persist") return "";
  if (!ok || !Number.isFinite(v)) {
    window.SenseRendererState.deltaDotRecedeLatched[kind] = false;
    return "";
  }
  if (prev == null || !Number.isFinite(prev)) return " radar-delta-motion--steady";
  const eps = 0.012;
  const dv = v - prev;
  const absCur = Math.abs(v);
  const absPrev = Math.abs(prev);
  const signFlip = Math.abs(v) > eps && Math.abs(prev) > eps && (v > eps) !== (prev > eps);
  const hot = Math.abs(dv) >= 0.28;
  let mode = "steady";
  if (signFlip) mode = "recede";
  else if (absCur + eps < absPrev) mode = "recede";
  else if (absCur > absPrev + eps) mode = "advance";
  if (mode === "recede") window.SenseRendererState.deltaDotRecedeLatched[kind] = true;
  else if (mode === "advance") window.SenseRendererState.deltaDotRecedeLatched[kind] = false;
  const parts = [`radar-delta-motion--${mode}`];
  if (hot && mode !== "steady") parts.push("radar-delta-motion--hot");
  if (window.SenseRendererState.deltaDotRecedeLatched[kind]) parts.push("radar-delta-dot--recede-latched");
  return ` ${parts.join(" ")}`;
}

function formatDeltaPctCenter(v) {
  if (v == null || !Number.isFinite(v)) return "—";
  const s = v.toFixed(2);
  return (v > 0 ? "+" : "") + s + "%";
}

function radarDeltaPctNeedleEnd(pct) {
  const cx = 50;
  const cy = 50;
  const len = 36;
  const theta = Math.PI * (1 - pct / 100);
  const x2 = cx + len * Math.cos(theta);
  const y2 = cy - len * Math.sin(theta);
  return { x2, y2 };
}

function spdGaugeGradientDefs(kind, tone) {
  const t = String(tone || "neut").replace(/[^a-z]/g, "") || "neut";
  const stopsMap = {
    pos: '<stop offset="0%" stop-color="#0369a1"/><stop offset="55%" stop-color="#38bdf8"/><stop offset="100%" stop-color="#7dd3fc"/>',
    neg: '<stop offset="0%" stop-color="#a21caf"/><stop offset="55%" stop-color="#e879f9"/><stop offset="100%" stop-color="#f0abfc"/>',
    neut: '<stop offset="0%" stop-color="#64748b"/><stop offset="100%" stop-color="#cbd5e1"/>',
    empty: '<stop offset="0%" stop-color="#475569"/><stop offset="100%" stop-color="#64748b"/>',
  };
  const stops = stopsMap[t] || stopsMap.neut;
  return `<defs><linearGradient id="spdgrad-${kind}-${t}" x1="0%" y1="0%" x2="100%" y2="0%">${stops}</linearGradient></defs>`;
}

function hudRadarDeltaPctGauge(shortLabel, vRaw, kind) {
  const v = Number(vRaw);
  const ok = Number.isFinite(v);
  const pct = ok ? radarDeltaPctGaugePct(v, RADAR_DELTA_PCT_GAUGE_CAP) : 50;
  const cls = radarDeltaPctGaugeClass(ok ? v : null);
  const display = formatDeltaPctCenter(ok ? v : null);
  const titlePrefix = kind === "pico" ? "% PICO: " : "% PERSIST: ";
  const title = ok ? titlePrefix + display : "Recompile o EA (export deltaPctPicos / deltaPctPersist no radar)";
  const { x2, y2 } = radarDeltaPctNeedleEnd(pct);
  const xf = Number.isFinite(x2) ? x2.toFixed(2) : "50";
  const yf = Number.isFinite(y2) ? y2.toFixed(2) : "14";
  const fillDash = ok ? Math.max(0, Math.min(100, pct)) : 0;
  const arcD = "M 10 50 A 40 40 0 0 1 90 50";
  const tone = /radar-delta-gauge--(pos|neg|neut|empty)/.exec(cls)?.[1] || "neut";
  const gradId = `spdgrad-${kind}-${tone}`;
  const defs = spdGaugeGradientDefs(kind, tone);
  const motionCls = radarDeltaPctMotionModifier(kind, v, ok);
  if (kind === "persist") window.SenseRendererState.lastDeltaPctPersist = ok ? v : null;
  if (kind === "pico") window.SenseRendererState.lastDeltaPctPico = ok ? v : null;
  return `
    <div class="radar-delta-gauge radar-delta-gauge--kind-${kind} ${cls}${motionCls}" title="${escapeHtml(title)}">
      <div class="radar-delta-gauge__viz">
        <svg class="radar-delta-gauge__svg" viewBox="0 0 100 56" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          ${defs}
          <path class="radar-delta-gauge__track" pathLength="100" d="${arcD}" fill="none" stroke-linecap="round"/>
          <path class="radar-delta-gauge__fill radar-delta-gauge__fill--grad" pathLength="100" d="${arcD}" fill="none" stroke-linecap="round" stroke-dasharray="${fillDash} 100" style="stroke:url(#${gradId})"/>
          <circle class="radar-delta-gauge__dot" cx="${xf}" cy="${yf}" r="5" />
        </svg>
      </div>
      <span class="radar-delta-gauge__num">${escapeHtml(display)}</span>
      <div class="radar-delta-gauge__label">${escapeHtml(shortLabel)}</div>
    </div>
  `;
}

function readFirstFiniteNumber(obj, keys) {
  if (!obj || typeof obj !== "object") return NaN;
  for (const key of keys) {
    const n = Number(obj[key]);
    if (Number.isFinite(n)) return n;
  }
  return NaN;
}

function readFirstTruthyBool(obj, keys) {
  if (!obj || typeof obj !== "object") return false;
  for (const key of keys) {
    const v = obj[key];
    if (v === true || v === "true" || v === 1 || v === "1") return true;
  }
  return false;
}

function picoPersistCountdownMeta(go) {
  if (!go || typeof go !== "object") return { active: false, remainingSec: 0, totalSec: 10, progress01: 0 };
  const remainingRaw = readFirstFiniteNumber(go, [
    "picoPersistSegundosRestantes",
    "picoPersistRestantes",
    "picoPersistRemainingSec",
    "picoPersistRemaining",
    "picoPersistCountdownSec",
    "picoPersistCountdown",
    "ppSegundosRestantes",
    "ppRemainingSec",
  ]);
  const totalRaw = readFirstFiniteNumber(go, [
    "gatilhoPicoPersistSegundos",
    "picoPersistTotalSegundos",
    "picoPersistTotalSec",
    "picoPersistSegundos",
    "ppTotalSec",
  ]);
  const activeFlag = readFirstTruthyBool(go, [
    "picoPersistContando",
    "picoPersistCountdownAtivo",
    "picoPersistActive",
    "ppContando",
  ]);
  const hasRemaining = Number.isFinite(remainingRaw);
  const rem = hasRemaining ? Math.max(0, Math.ceil(remainingRaw)) : 0;
  const totalBase = Number.isFinite(totalRaw) && totalRaw > 0 ? Math.ceil(totalRaw) : 10;
  const total = Math.max(rem || 0, totalBase);
  const active = hasRemaining ? rem > 0 : activeFlag;
  const progress01 = total > 0 ? Math.max(0, Math.min(1, rem / total)) : 0;
  return { active, remainingSec: rem, totalSec: total, progress01 };
}

function renderPicoPersistCountdownClock(go) {
  const meta = picoPersistCountdownMeta(go);
  if (!meta.active) return "";
  const remaining = meta.remainingSec;
  const total = meta.totalSec;
  const dash = (Math.max(0, Math.min(1, meta.progress01)) * 100).toFixed(2);
  const title = `Pico + Persist em contagem: ${remaining}s de ${total}s`;
  return `
    <div class="pp-clock" role="status" aria-live="polite" title="${escapeHtml(title)}" style="--pp-progress:${dash};">
      <svg class="pp-clock__svg" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle class="pp-clock__track" cx="60" cy="60" r="49" pathLength="100" />
        <circle class="pp-clock__ring" cx="60" cy="60" r="49" pathLength="100" stroke-dasharray="${dash} 100" />
      </svg>
      <div class="pp-clock__core">
        <span class="pp-clock__time">${remaining}s</span>
        <span class="pp-clock__label">P+P</span>
      </div>
    </div>
  `;
}

function hudRadarDeltaPctGaugesRow(rad, go) {
  const dp = rad && rad.deltaPctPicos;
  const ds = rad && rad.deltaPctPersist;
  return `
    <div class="radar-delta-gauges-wrap">
      <div class="radar-delta-gauges radar-delta-gauges--minimal">
      ${hudRadarDeltaPctGauge("% Pico", dp, "pico")}
      ${hudRadarDeltaPctGauge("% Persist", ds, "persist")}
      </div>
      ${renderPicoPersistCountdownClock(go)}
    </div>
  `;
}

function computeFlowStrengthFromDashboard(d) {
  const flowObj = d.flow && typeof d.flow === "object" ? d.flow : null;
  const deltaObj = d.delta && typeof d.delta === "object" ? d.delta : null;
  const strengthPct = Number(d.strengthPct);
  const zMiniAbs = flowObj ? Math.abs(Number(flowObj.zMini)) : 0;
  const zRefAbs = flowObj ? Math.abs(Number(flowObj.zRef)) : 0;
  const deltaNormAbs = deltaObj ? Math.abs(Number(deltaObj.norm)) : 0;
  const scoreNorm = Number.isFinite(strengthPct) ? Math.max(0, Math.min(1, strengthPct / 100)) : 0;
  return Math.max(
    Number.isFinite(zMiniAbs) ? Math.min(1, zMiniAbs) : 0,
    Number.isFinite(zRefAbs) ? Math.min(1, zRefAbs) : 0,
    Number.isFinite(deltaNormAbs) ? Math.min(1, deltaNormAbs) : 0,
    scoreNorm
  );
}

function computeAggressionMeterStrengthFromText(aggText) {
  const s = stripAccentsForDisplay(String(aggText || "")).toUpperCase();
  if (s.includes("USE_ZFLOW OFF")) return 0;
  if (/AGRESSAO:\s*[—\-–]/.test(s) || /Z\s*MEDIO\s*0\.00/i.test(s)) return 0;
  if (!s.includes("COMPRA") && !s.includes("VENDA")) return 0;
  if (s.includes("MUITO FORTE")) return 0.92;
  if (s.includes("FORTE") && !s.includes("MUITO FORTE")) return 0.67;
  if (s.includes("MODERADA")) return 0.44;
  if (s.includes("ENTRANDO")) return 0.16;
  if (s.includes("FRACA")) return 0.09;
  return 0.14;
}

function flowMeterHtml(flowStrength, mode, title, topLabel) {
  if (mode === "off") return "";
  const n = 12;
  const fs = Number.isFinite(Number(flowStrength)) ? Number(flowStrength) : 0;
  const filled = Math.max(0, Math.min(n, Math.round(fs * n)));
  const segs = [];
  for (let i = 0; i < n; i++) segs.push(`<span class="hud-flow-meter__seg${i < filled ? " hud-flow-meter__seg--on" : ""}"></span>`);
  const t = title || "Intensidade do fluxo (Z / Δ / placar)";
  const meter = `<div class="hud-flow-meter hud-flow-meter--${mode}" title="${escapeHtml(t)}" aria-hidden="true">${segs.join("")}</div>`;
  const z = typeof topLabel === "string" && topLabel.trim() !== "" ? topLabel.trim() : "";
  if (!z) return meter;
  return `<div class="hud-flow-meter-stack hud-flow-meter-stack--agr"><div class="hud-flow-meter__top" title="${escapeHtml(t)}">${escapeHtml(z)}</div>${meter}</div>`;
}

function radarDirMeterMode(dirText) {
  const t = String(dirText || "").toUpperCase();
  if (t.includes("VENDA")) return "sell";
  if (t.includes("COMPRA")) return "buy";
  return "neutral";
}

function sideFromDirectionText(text) {
  const t = String(text || "").toUpperCase();
  if (t.includes("COMPRA")) return "buy";
  if (t.includes("VENDA")) return "sell";
  return "";
}

function sideFromMakersText(text) {
  const t = String(text || "").toUpperCase();
  if (t.includes("COMPRA+")) return "buy";
  if (t.includes("VENDA+")) return "sell";
  return "";
}

function sideFromAggressionText(text) {
  const t = String(text || "").toUpperCase();
  if (t.includes("AGRESS") && t.includes("COMPRA")) return "buy";
  if (t.includes("AGRESS") && t.includes("VENDA")) return "sell";
  return "";
}

function aggressionMeterMode(aggrCls) {
  if (aggrCls.includes("hud-aggr--buy")) return "buy";
  if (aggrCls.includes("hud-aggr--sell")) return "sell";
  if (aggrCls.includes("hud-aggr--off")) return "off";
  return "neutral";
}

function hudRadarLine(k, v, kind, flowStrength, meterMode, forcedExtraClass) {
  const t = v !== undefined && v !== null && String(v).length > 0 ? String(v) : "—";
  let extra = "";
  if (kind === "dir") extra = radarDirClass(t);
  else if (kind === "flip") extra = radarFlipClass(t);
  else if (kind === "picos") extra = "hud-line--radar-picos";
  else if (kind === "persist") extra = "hud-line--radar-persist";
  else if (kind === "saldoPicos" || kind === "saldoPersist") extra = radarSaldoSignClass(t);
  if (forcedExtraClass) extra = `${extra} ${forcedExtraClass}`.trim();
  const cls = extra ? `hud-line ${extra}` : "hud-line";
  const showMeter = kind === "dir" && flowStrength !== undefined && flowStrength !== null;
  const meter = showMeter ? flowMeterHtml(flowStrength, meterMode || radarDirMeterMode(t)) : "";
  return `<div class="${cls}"><span class="hud-k">${escapeHtml(k)}</span><span class="hud-v-wrap"><span class="hud-v">${escapeHtml(t)}</span>${meter}</span></div>`;
}
