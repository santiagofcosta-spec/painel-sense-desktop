/**
 * Utilitários partilhados do painel (formato, escape, leitura de campos do JSON).
 * Carregado antes de `renderer.js` — funções globais com os mesmos nomes.
 */
/* global window */
"use strict";

function fmtNum(v, dec) {
  const d = dec === undefined ? 3 : dec;
  if (v === undefined || v === null || Number.isNaN(Number(v))) return "—";
  const n = Number(v);
  if (d === 0) return String(Math.round(n));
  return n.toFixed(d);
}

function fmtDeltaVol(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  if (n !== 0 && Math.abs(n) < 0.05) return n.toFixed(3);
  return fmtNum(n, 2);
}

function dashBoolTruthy(v) {
  if (v === true || v === 1) return true;
  const s = String(v == null ? "" : v)
    .trim()
    .toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "sim";
}

function dashNum(v) {
  if (v === undefined || v === null || v === "") return NaN;
  const t = String(v).trim().replace(/\s/g, "").replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

function repairMojibakeUtf8(s) {
  let cur = String(s ?? "");
  if (!/[ÃÂâ\uFFFD]/.test(cur)) return cur;
  const scoreBad = (x) => (String(x).match(/[ÃÂâ\uFFFD]/g) || []).length;
  for (let i = 0; i < 3; i++) {
    try {
      const dec = decodeURIComponent(escape(cur));
      if (scoreBad(dec) <= scoreBad(cur)) {
        if (dec === cur) break;
        cur = dec;
        continue;
      }
      break;
    } catch (_e) {
      break;
    }
  }
  return cur;
}

function repairPortugueseDisplayText(s) {
  let t = repairMojibakeUtf8(String(s ?? ""));
  const fixes = [
    [/\bn\?\bo/gi, "não"],
    [/\bna\?o\b/gi, "não"],
    [/\bs\?\bo\b/gi, "são"],
    [/\bopera\?+\bo\b/gi, "operação"],
    [/\bcondi\?+\bes\b/gi, "condições"],
    [/\bconfigura\?+\bes\b/gi, "configurações"],
    [/\binforma\?+\bes\b/gi, "informações"],
    [/\bref\?+\bncia\b/gi, "referência"],
    [/\brefer\?+\bncia\b/gi, "referência"],
    [/\bvaria\?+\bo\b/gi, "variação"],
    [/\bmedi\?+\bo\b/gi, "medição"],
    [/\bdire\?+\bo\b/gi, "direção"],
    [/\baten\?+\bo\b/gi, "atenção"],
    [/\bagress\?+\bo\b/gi, "agressão"],
    [/\babsor\?+\bo\b/gi, "absorção"],
    [/\bcompres\?+\bo\b/gi, "compressão"],
    [/\bconfi\?+\bvel\b/gi, "confiável"],
    [/\bconfi\?+\bncia\b/gi, "confiança"],
    [/\btend\?+\bncia\b/gi, "tendência"],
    [/\bl\?+\bgica\b/gi, "lógica"],
    [/\bper\?+\bodo\b/gi, "período"],
    [/\bjanela\?+\b/gi, "janela"],
  ];
  for (const [rx, val] of fixes) t = t.replace(rx, val);
  t = t.replace(/mini\s*\?\s*ref\./gi, "Mini e Cheio");
  t = t.replace(/\?\?+/g, "");
  return t;
}

function escapeHtml(s) {
  return repairPortugueseDisplayText(String(s))
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
