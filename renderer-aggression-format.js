/**
 * Formatação da linha de agressão para o painel (AGR:, Zm) e separação do sufixo Zm para o HUD.
 * Depende de renderer-flow-levels.js (`stripAccentsForDisplay`).
 * Carregar depois de renderer-flow-levels.js e antes de renderer-hud.js.
 */
(function () {
  "use strict";
  if (typeof window === "undefined") {
    throw new Error("Painel SENSE: ambiente sem window.");
  }
  if (typeof stripAccentsForDisplay !== "function") {
    throw new Error("Painel SENSE: falta renderer-flow-levels.js antes de renderer-aggression-format.js (ver index.html).");
  }
})();

/** Ex.: "| Z medio +0.27" → "| Zm +0.27"; "AGRESSAO:" / "AGRESSO:" → "AGR:" */
function formatAggressionLineForUi(raw) {
  let t = stripAccentsForDisplay(String(raw || ""));
  t = t.replace(/^\s*(AGRESSAO|AGRESSO)\s*:/i, "AGR:");
  t = t.replace(/\|\s*Z\s*mdio/gi, "| Zm");
  t = t.replace(/\|\s*Z\s*medio/gi, "| Zm");
  t = t.replace(/\bZ\s*mdio\b/gi, "Zm");
  t = t.replace(/\bZ\s*medio\b/gi, "Zm");
  return t.trim();
}

/** Formata só o valor numérico do Z (sem prefixo Zm) para a linha acima das barras. */
function formatAggressionZValueOnly(capturedNum) {
  const raw = String(capturedNum || "").replace(",", ".").trim();
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return "";
  if (n === 0) return "0";
  const s = n.toFixed(4).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  if (n > 0) return `+${s}`;
  return s;
}

/** Separa o sufixo "| Zm ±n" — o valor vai só acima das barrinhas (sem texto "Zm"). */
function splitAggressionZmFromFormatted(formatted) {
  const t = String(formatted || "").trim();
  const re = /\s*\|\s*Zm\s*([+-]?\d+(?:[.,]\d+)?)\s*$/i;
  const m = t.match(re);
  if (m) {
    const zDisplay = formatAggressionZValueOnly(m[1]);
    return {
      body: t.slice(0, m.index).trim(),
      zDisplay,
    };
  }
  return { body: t, zDisplay: "" };
}
