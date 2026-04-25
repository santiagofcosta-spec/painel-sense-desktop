/**
 * Agrega styles/blocks/block-01..06.css em ficheiros semânticos em styles/semantic/,
 * preservando a ordem global (cascata idêntica ao concat dos 6 blocos).
 *
 * Uso: node scripts/split-css-semantic.js
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const BLOCKS_DIR = path.join(ROOT, "styles", "blocks");
const OUT_DIR = path.join(ROOT, "styles", "semantic");

const BLOCK_FILES = [
  "block-01.css",
  "block-02.css",
  "block-03.css",
  "block-04.css",
  "block-05.css",
  "block-06.css",
];

/** Ordem de desempate: primeiro na lista perde em empate (último ganha). */
const TIE = ["misc", "media", "keyframes", "signal", "placar", "gatilho", "hud", "delta", "levels", "flow", "shell", "tokens"];

function scoreCategories(text) {
  const t = text.toLowerCase();
  const sc = {
    tokens: 0,
    shell: 0,
    flow: 0,
    levels: 0,
    delta: 0,
    hud: 0,
    gatilho: 0,
    placar: 0,
    signal: 0,
    keyframes: 0,
    media: 0,
    misc: 0,
  };

  if (t.includes("@keyframes")) {
    sc.keyframes += 50;
  }
  if (t.trim().startsWith("@media") || (t.includes("@media") && t.indexOf("@media") < 40)) {
    sc.media += 15;
  }
  if (t.includes(":root") || /^\s*\*\s*\{/.test(t) || t.includes("html.realtime-optimized {")) {
    sc.tokens += 20;
  }
  if (t.includes(".signal-strip") || t.includes("signal-strip")) {
    sc.signal += 12;
  }
  if (t.includes(".gatilho") || t.includes("gatilho-")) {
    sc.gatilho += 14;
  }
  if (t.includes(".hud-") || t.includes(".hud ") || t.includes(" .hud") || t.includes("\n.hud") || t.includes(".radar-delta") || t.includes(".hud-sr") || t.includes(".ptax-compass")) {
    sc.hud += 10;
  }
  if (
    t.includes(".delta-") ||
    t.includes(".delta.") ||
    t.includes(".delta-line") ||
    t.includes(".delta-bars") ||
    t.includes(".delta-row") ||
    t.includes(".delta-hint") ||
    t.includes(".streak-wrap") ||
    t.includes(".hammer")
  ) {
    sc.delta += 12;
  }
  if (t.includes(".levels") || t.includes(".level-row") || t.includes("levels-sr")) {
    sc.levels += 12;
  }
  if (t.includes(".flow") || t.includes("flow-row") || t.includes("flow-ztrack") || t.includes("flow-mini") || t.includes("flow-trend")) {
    sc.flow += 12;
  }
  if (t.includes(".placar") || t.includes(".scoreboard") || t.includes(".meta-foot") || t.includes("bar-wrap--compact") || t.includes(".summary")) {
    sc.placar += 10;
  }
  if (
    t.includes(".layout") ||
    t.includes(".topbar") ||
    t.includes(".grid") ||
    t.includes(".panel") ||
    t.includes(".footer") ||
    t.includes(".path") ||
    t.includes(".brand") ||
    t.includes(".btn-pick") ||
    t.includes(".hint") ||
    t.includes(".data-banner") ||
    t.includes(".status") ||
    t.includes("body {") ||
    t.includes("html {")
  ) {
    sc.shell += 6;
  }

  return sc;
}

function pickCategory(text) {
  const sc = scoreCategories(text);
  let best = "misc";
  let bestV = -1;
  for (const k of TIE) {
    if (sc[k] > bestV) {
      bestV = sc[k];
      best = k;
    }
  }
  if (bestV <= 0) return "misc";
  return best;
}

/**
 * @returns {{ kind: 'comment'|'at'|'rule', text: string, prelude?: string }[]}
 */
function extractStatements(css) {
  const out = [];
  let i = 0;
  const n = css.length;

  function skipWs() {
    while (i < n && /[\s\r\n\t]/.test(css[i])) i++;
  }

  function readComment() {
    const start = i;
    if (css[i] !== "/" || css[i + 1] !== "*") return null;
    i += 2;
    while (i < n - 1) {
      if (css[i] === "*" && css[i + 1] === "/") {
        i += 2;
        break;
      }
      i++;
    }
    return { kind: "comment", text: css.slice(start, i) };
  }

  function readString(quote) {
    let s = "";
    s += quote;
    i++;
    while (i < n) {
      const c = css[i++];
      s += c;
      if (c === "\\" && i < n) {
        s += css[i++];
        continue;
      }
      if (c === quote) break;
    }
    return s;
  }

  function readBalancedBlock() {
    if (css[i] !== "{") throw new Error("Esperava { em " + i);
    const start = i;
    let depth = 0;
    while (i < n) {
      const c = css[i];
      if (c === '"' || c === "'") {
        readString(c);
        continue;
      }
      if (c === "/" && i + 1 < n && css[i + 1] === "*") {
        readComment();
        continue;
      }
      if (c === "{") {
        depth++;
        i++;
        continue;
      }
      if (c === "}") {
        depth--;
        i++;
        if (depth === 0) return css.slice(start, i);
        continue;
      }
      i++;
    }
    throw new Error("Bloco não fechado");
  }

  /** Preserva newlines / espaço entre declarações (evita alterar cascata e tamanho do ficheiro). */
  let pendingWs = "";
  function consumeWhitespace() {
    const s0 = i;
    while (i < n && /[\s\r\n\t]/.test(css[i])) i++;
    pendingWs += css.slice(s0, i);
  }

  while (i < n) {
    consumeWhitespace();
    if (i >= n) break;
    if (css[i] === "/" && i + 1 < n && css[i + 1] === "*") {
      const cm = readComment();
      if (!cm) throw new Error("comentário inválido");
      out.push({ kind: "comment", text: pendingWs + cm.text });
      pendingWs = "";
      continue;
    }

    const stmt0 = i;

    if (css[i] === "@") {
      i++;
      while (i < n && /[a-zA-Z0-9_-]/.test(css[i])) i++;
      skipWs();
      let paren = 0;
      while (i < n) {
        const c = css[i];
        if (c === '"' || c === "'") {
          readString(c);
          continue;
        }
        if (c === "/" && i + 1 < n && css[i + 1] === "*") {
          readComment();
          continue;
        }
        if (c === "(") paren++;
        if (c === ")") paren = Math.max(0, paren - 1);
        if (c === "{" && paren === 0) break;
        i++;
      }
      readBalancedBlock();
      out.push({ kind: "at", text: pendingWs + css.slice(stmt0, i) });
      pendingWs = "";
      continue;
    }

    while (i < n) {
      const c = css[i];
      if (c === '"' || c === "'") {
        readString(c);
        continue;
      }
      if (c === "/" && i + 1 < n && css[i + 1] === "*") {
        readComment();
        continue;
      }
      if (c === "{") break;
      i++;
    }
    if (i >= n) break;
    readBalancedBlock();
    const full = css.slice(stmt0, i);
    const prelude = full.slice(0, full.indexOf("{")).trim();
    out.push({ kind: "rule", text: pendingWs + full, prelude });
    pendingWs = "";
  }

  if (pendingWs.length && out.length) {
    out[out.length - 1].text += pendingWs;
  }

  return out;
}

function main() {
  let combined = "";
  for (const f of BLOCK_FILES) {
    combined += fs.readFileSync(path.join(BLOCKS_DIR, f), "utf8");
    if (!combined.endsWith("\n")) combined += "\n";
  }

  const normCombined = combined.replace(/\r\n/g, "\n");
  const stmts = extractStatements(normCombined);
  const joinedStmts = stmts.map((s) => s.text).join("");
  if (joinedStmts.length !== normCombined.length) {
    console.warn("extractStatements difere do normalizado:", normCombined.length, joinedStmts.length);
  }

  /** @type {{ cat: string, text: string }[]} */
  const runs = [];
  let pending = "";

  function flushPendingTo(text) {
    return pending ? pending + text : text;
  }

  for (const st of stmts) {
    if (st.kind === "comment") {
      pending += st.text;
      continue;
    }
    const body = flushPendingTo(st.text);
    pending = "";
    const cat = pickCategory(st.kind === "rule" ? st.prelude + " " + st.text : st.text);
    const last = runs[runs.length - 1];
    if (last && last.cat === cat) {
      last.text += body;
    } else {
      runs.push({ cat, text: body });
    }
  }
  if (pending && runs.length) {
    runs[runs.length - 1].text += pending;
  } else if (pending) {
    runs.push({ cat: "misc", text: pending });
  }

  /** @keyframes podem ir a seguir ao bloco que os usa — fundir no run anterior reduz @import sem alterar significado. */
  const fused = [];
  for (const r of runs) {
    if (r.cat === "keyframes" && fused.length) {
      fused[fused.length - 1].text += r.text;
    } else {
      fused.push({ cat: r.cat, text: r.text });
    }
  }
  runs.length = 0;
  runs.push(...fused);

  if (runs.length > 1 && runs[0].cat === "misc" && runs[0].text.length < 120) {
    runs[1].text = runs[0].text + runs[1].text;
    runs.shift();
  }

  const origLen = normCombined.length;
  const sumRuns = runs.reduce((a, r) => a + r.text.length, 0);
  if (sumRuns !== origLen) {
    console.warn("Aviso: runs somam diferente do normalizado", origLen, sumRuns);
  }

  if (fs.existsSync(OUT_DIR)) {
    for (const f of fs.readdirSync(OUT_DIR)) {
      if (f.endsWith(".css")) fs.unlinkSync(path.join(OUT_DIR, f));
    }
  } else {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  const importLines = [];
  /** Remove o banner gerado e uma newline opcional após o fecho do comentário. */
  const bannerRe = /^\/\*\*[\s\S]*?\*\/\n?/;
  let idx = 0;
  for (const r of runs) {
    const num = String(++idx).padStart(4, "0");
    const fname = `${num}-${r.cat}.css`;
    const banner = `/**\n * [${r.cat}] — parte ${num} (ordem global preservada).\n * Gerado: scripts/split-css-semantic.js\n */\n`;
    fs.writeFileSync(path.join(OUT_DIR, fname), banner + r.text, "utf8");
    importLines.push(`@import url("./styles/semantic/${fname}");`);
  }
  importLines.push('@import url("./styles/sense-ia-ux.css");');

  const rootCss = [
    "/**",
    " * Painel SENSE — CSS semântico (ordem = mesma cascata que block-01..06 concatenados).",
    " * Fonte: styles/blocks/block-*.css — regenerar com: node scripts/split-css-semantic.js",
    " */",
    ...importLines,
    "",
  ].join("\n");

  fs.writeFileSync(path.join(ROOT, "styles.css"), rootCss, "utf8");

  let diskStripped = 0;
  for (const line of importLines) {
    const m = line.match(/styles\/semantic\/([^"']+)/);
    if (!m) continue;
    const raw = fs.readFileSync(path.join(OUT_DIR, m[1]), "utf8");
    diskStripped += raw.replace(bannerRe, "").length;
  }
  if (diskStripped !== origLen || sumRuns !== diskStripped) {
    console.warn("Sanidade CSS:", { origLen, sumRuns, diskStripped });
  }

  console.log("Runs:", runs.length, "→", OUT_DIR);
  runs.forEach((r, j) => console.log(`  ${j + 1}. ${r.cat} (${r.text.length} chars)`));
}

if (require.main === module) {
  main();
}
