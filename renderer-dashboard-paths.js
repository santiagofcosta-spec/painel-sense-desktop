/**
 * Caminhos do dashboard.json, meta.time e linhas de estado (OK / stale).
 * Carregar antes de renderer.js.
 */

/** Caminho do JSON de exemplo do projeto (não é o que o EA grava no MT5). */
function isProjectExampleDashboardPath(p) {
  if (!p || typeof p !== "string") return false;
  const norm = p.replace(/\\/g, "/").toLowerCase();
  return /(^|\/)data\/dashboard\.json$/i.test(norm);
}

/** OneDrive / Dropbox / iCloud atrasam o que o processo lê vs. o que o MT5 já gravou. */
function pathLooksCloudSynced(p) {
  if (!p || typeof p !== "string") return false;
  const u = p.replace(/\\/g, "/").toLowerCase();
  return (
    u.includes("onedrive") ||
    u.includes("dropbox") ||
    u.includes("googledrive") ||
    u.includes("google drive") ||
    u.includes("icloud")
  );
}

/** O EA grava em …\\MQL5\\Files\\dashboard.json — outro sítio quase sempre é cópia ou caminho errado. */
function pathLooksLikeMt5Mql5Files(p) {
  if (!p || typeof p !== "string") return false;
  const u = p.replace(/\\/g, "/").toLowerCase();
  return u.includes("mql5") && u.includes("files");
}

function parseMetaTimeToMs(metaTime) {
  const s = String(metaTime || "").trim();
  const m = s.match(/^(\d{4})\.(\d{2})\.(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return NaN;
  const t = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6])).getTime();
  return Number.isFinite(t) ? t : NaN;
}

function metaLagSuffix(metaLagSec) {
  if (!Number.isFinite(metaLagSec)) return " · meta.time n/d";
  return ` · meta.time atraso ${Math.max(0, Math.round(metaLagSec))}s`;
}

function formatOkStatusLine(resultPath, metaLagSec) {
  const base = "OK · última leitura: " + new Date().toLocaleTimeString("pt-BR");
  if (isProjectExampleDashboardPath(resultPath)) {
    return (
      base +
      " · A usar o JSON de exemplo em data/ (zeros/neutro). Para dados do EA: botão «Escolher dashboard.json…» e ficheiro em MQL5\\Files." +
      metaLagSuffix(metaLagSec)
    );
  }
  if (pathLooksCloudSynced(resultPath)) {
    return (
      base +
      " · ATENÇÃO: caminho em pasta de nuvem (ex.: OneDrive) — o Windows pode atrasar segundos a leitura. Ideal: apontar para MQL5\\Files num disco local ou mover o painel para fora do OneDrive." +
      metaLagSuffix(metaLagSec)
    );
  }
  if (!pathLooksLikeMt5Mql5Files(resultPath)) {
    return (
      base +
      " · O EA grava em …\\\\MQL5\\\\Files\\\\dashboard.json. Se este caminho não for essa pasta, o painel pode não bater com o gráfico." +
      metaLagSuffix(metaLagSec)
    );
  }
  return base + metaLagSuffix(metaLagSec);
}

/** stale=true pode ser cache antigo (erro) ou leitura ao vivo com validação estrita pendente (main: liveData). */
function formatStaleStatusLine(result) {
  const tick = new Date().toLocaleTimeString("pt-BR");
  const lag = Number(result && result.metaLagSec);
  const lagNote = metaLagSuffix(lag);
  if (result && result.liveData === true) {
    const err = result.error && String(result.error).trim();
    return (err || "OK · ficheiro ao vivo.") + " · " + tick + lagNote;
  }
  const err = result && result.error ? String(result.error).trim() : "";
  return err
    ? "Atenção — " + err + " · " + tick + lagNote
    : "Leitura instável — cache. · " + tick + lagNote;
}
