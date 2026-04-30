import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAutoCycleResponse,
  isPregao,
  isDashboardFresh,
  detectChange,
} from '../scripts/lib/sense-ia-auto-cycle.js';

// ─── parseAutoCycleResponse ───────────────────────────────────────────────────

test('parseAutoCycleResponse: parses Alta', () => {
  const r = parseAutoCycleResponse('Viés: Alta\nConfiança: 78%\nRazão: Radar compra forte');
  assert.equal(r.vies, 'Alta');
  assert.equal(r.confianca, 78);
  assert.equal(r.razao, 'Radar compra forte');
});

test('parseAutoCycleResponse: parses Baixa', () => {
  const r = parseAutoCycleResponse('Viés: Baixa\nConfiança: 55%\nRazão: Vendedores dominando');
  assert.equal(r.vies, 'Baixa');
  assert.equal(r.confianca, 55);
});

test('parseAutoCycleResponse: parses Lateral', () => {
  const r = parseAutoCycleResponse('Viés: Lateral\nConfiança: 40%\nRazão: Sem direção');
  assert.equal(r.vies, 'Lateral');
  assert.equal(r.confianca, 40);
});

test('parseAutoCycleResponse: returns nulls on invalid input', () => {
  const r = parseAutoCycleResponse('resposta inválida');
  assert.equal(r.vies, null);
  assert.equal(r.confianca, null);
  assert.equal(r.razao, null);
});

test('parseAutoCycleResponse: strips bold markdown from model output', () => {
  const r = parseAutoCycleResponse('**Viés:** Alta\n**Confiança:** 70%\n**Razão:** Fluxo comprador');
  assert.equal(r.vies, 'Alta');
  assert.equal(r.confianca, 70);
});

// ─── isPregao ─────────────────────────────────────────────────────────────────

test('isPregao: 10h BRT is inside 09:00-17:30', () => {
  // 10:00 BRT = 13:00 UTC (UTC-3)
  const d = new Date('2026-04-30T13:00:00.000Z');
  assert.equal(isPregao({ start: '09:00', end: '17:30', timezone: 'America/Sao_Paulo' }, d), true);
});

test('isPregao: 08:00 BRT is before window', () => {
  // 08:00 BRT = 11:00 UTC
  const d = new Date('2026-04-30T11:00:00.000Z');
  assert.equal(isPregao({ start: '09:00', end: '17:30', timezone: 'America/Sao_Paulo' }, d), false);
});

test('isPregao: 18:00 BRT is after window', () => {
  // 18:00 BRT = 21:00 UTC
  const d = new Date('2026-04-30T21:00:00.000Z');
  assert.equal(isPregao({ start: '09:00', end: '17:30', timezone: 'America/Sao_Paulo' }, d), false);
});

// ─── isDashboardFresh ─────────────────────────────────────────────────────────

function toMt5Time(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth()+1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

test('isDashboardFresh: 1 min ago returns true', () => {
  const ts = toMt5Time(new Date(Date.now() - 60_000));
  assert.equal(isDashboardFresh(ts, 300), true);
});

test('isDashboardFresh: 6 min ago returns false', () => {
  const ts = toMt5Time(new Date(Date.now() - 360_000));
  assert.equal(isDashboardFresh(ts, 300), false);
});

test('isDashboardFresh: null returns false', () => {
  assert.equal(isDashboardFresh(null, 300), false);
});

test('isDashboardFresh: empty string returns false', () => {
  assert.equal(isDashboardFresh('', 300), false);
});

// ─── detectChange ─────────────────────────────────────────────────────────────

const CFG = { notifyOnViesChange: true, notifyOnConfiancaRiseThreshold: 30 };

test('detectChange: first cycle (lastVies null) always notifies with type baseline', () => {
  const r = detectChange('Alta', 65, { lastVies: null, lastConfianca: null }, CFG);
  assert.equal(r.shouldNotify, true);
  assert.equal(r.type, 'baseline');
});

test('detectChange: same viés and confiança — no notify', () => {
  const r = detectChange('Alta', 65, { lastVies: 'Alta', lastConfianca: 65 }, CFG);
  assert.equal(r.shouldNotify, false);
  assert.equal(r.type, 'none');
});

test('detectChange: viés changed — notify with type vies', () => {
  const r = detectChange('Baixa', 60, { lastVies: 'Alta', lastConfianca: 60 }, CFG);
  assert.equal(r.shouldNotify, true);
  assert.equal(r.type, 'vies');
});

test('detectChange: confiança rose exactly 30pp — notify with type confianca', () => {
  const r = detectChange('Alta', 70, { lastVies: 'Alta', lastConfianca: 40 }, CFG);
  assert.equal(r.shouldNotify, true);
  assert.equal(r.type, 'confianca');
});

test('detectChange: confiança rose 29pp — no notify', () => {
  const r = detectChange('Alta', 69, { lastVies: 'Alta', lastConfianca: 40 }, CFG);
  assert.equal(r.shouldNotify, false);
});

test('detectChange: confiança dropped 40pp — no notify', () => {
  const r = detectChange('Alta', 40, { lastVies: 'Alta', lastConfianca: 80 }, CFG);
  assert.equal(r.shouldNotify, false);
});

test('detectChange: both viés changed AND confiança rose — type is vies (viés wins)', () => {
  const r = detectChange('Alta', 80, { lastVies: 'Baixa', lastConfianca: 40 }, CFG);
  assert.equal(r.shouldNotify, true);
  assert.equal(r.type, 'vies');
});

test('detectChange: prevVies and prevConfianca preserved in result', () => {
  const r = detectChange('Baixa', 55, { lastVies: 'Alta', lastConfianca: 65 }, CFG);
  assert.equal(r.prevVies, 'Alta');
  assert.equal(r.prevConfianca, 65);
});
