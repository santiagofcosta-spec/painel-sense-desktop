/**
 * PTAX USD — média dos boletins do dia (Olinda BC), para mesclar no dashboard.
 * Cache curto para não martelar a API a cada leitura do ficheiro.
 */
const https = require("https");

const CACHE_TTL_MS = 55_000;
/** Só cacheia respostas ok — erros/rede não ficam “presos” 55s à primeira falha. */
let cache = { at: 0, key: "", payload: null };

function brDateMmDdYyyy(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year").value;
  const m = parts.find((p) => p.type === "month").value;
  const day = parts.find((p) => p.type === "day").value;
  return `${m}-${day}-${y}`;
}

function httpsGetJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: { Accept: "application/json", "User-Agent": "PainelSENSE/1.0" },
        timeout: 12000,
      },
      (res) => {
        let body = "";
        res.on("data", (c) => {
          body += c;
        });
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
  });
}

/**
 * Média aritmética de (compra+venda)/2 por boletim do dia — alinhado ao fechamento PTAX
 * (média das 4 janelas quando todas existem).
 * @returns {Promise<{ ok: boolean, media?: number, note?: string, error?: string, bulletins?: number }>}
 */
async function fetchBcPtaxUsdAuto() {
  const todayKey = brDateMmDdYyyy();
  if (cache.payload && cache.payload.ok && cache.key === todayKey && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.payload;
  }

  const baseUrl =
    "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoMoedaDia(moeda=@moeda,dataCotacao=@dataCotacao)";

  /** Domingo/sábado ou dia sem cotação: tenta até 5 dias úteis para trás. */
  for (let back = 0; back < 5; back++) {
    const d = new Date();
    d.setDate(d.getDate() - back);
    const dataCot = brDateMmDdYyyy(d);
    const url = `${baseUrl}?@moeda='USD'&@dataCotacao='${dataCot}'&$format=json`;

    try {
      const json = await httpsGetJson(url);
      const rows = json && Array.isArray(json.value) ? json.value : [];
      if (rows.length === 0) {
        continue;
      }
      const medias = [];
      for (const row of rows) {
        const c = Number(row.cotacaoCompra);
        const v = Number(row.cotacaoVenda);
        if (Number.isFinite(c) && Number.isFinite(v)) {
          medias.push((c + v) / 2);
        }
      }
      if (medias.length === 0) {
        continue;
      }
      const sum = medias.reduce((a, b) => a + b, 0);
      const media = sum / medias.length;
      const tipos = rows.map((r) => String(r.tipoBoletim || "").trim()).filter(Boolean);
      const note =
        back === 0
          ? `BC Olinda · ${medias.length} boletim(ns) · ${dataCot}`
          : `BC Olinda · ${medias.length} boletim(ns) · ${dataCot} (último dia com cotação)`;
      const out = {
        ok: true,
        media,
        note,
        bulletins: medias.length,
        tipos,
        dataCotacao: dataCot,
      };
      cache = { at: Date.now(), key: todayKey, payload: out };
      return out;
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      // erro de rede: não cachear; próxima leitura do painel volta a tentar
      return { ok: false, error: msg };
    }
  }

  const empty = {
    ok: false,
    error: "BC sem boletins nos últimos dias (rede, feriado ou API indisponível).",
  };
  return empty;
}

module.exports = { fetchBcPtaxUsdAuto, brDateMmDdYyyy };
