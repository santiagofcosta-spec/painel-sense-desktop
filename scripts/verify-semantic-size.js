"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const blocks = [
  "block-01.css",
  "block-02.css",
  "block-03.css",
  "block-04.css",
  "block-05.css",
  "block-06.css",
];
let c = "";
for (const b of blocks) {
  c += fs.readFileSync(path.join(ROOT, "styles", "blocks", b), "utf8");
}
const n = c.replace(/\r\n/g, "\n").length;
const sc = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
let s = 0;
let raw = 0;
for (const line of sc.split("\n")) {
  const m = line.match(/semantic\/([^"']+)/);
  if (!m) continue;
  const full = fs.readFileSync(path.join(ROOT, "styles", "semantic", m[1]), "utf8");
  raw += full.length;
  const t = full.replace(/^\/\*\*[\s\S]*?\*\/\n?/, "");
  s += t.length;
}
console.log("orig", n, "semantic stripped", s, "diff", s - n, "raw sum", raw, "banners approx", raw - s);
