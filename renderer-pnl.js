// renderer-pnl.js
// Modal de histórico PnL — curva intraday + barras multiday + métricas.

let _pnlInterval = null;

function pnlModalOpen() {
  document.getElementById("pnl-modal-overlay").style.display = "flex";
  pnlRefresh();
  _pnlInterval = setInterval(pnlRefresh, 30000);
}

function pnlModalClose() {
  document.getElementById("pnl-modal-overlay").style.display = "none";
  if (_pnlInterval) { clearInterval(_pnlInterval); _pnlInterval = null; }
}

async function pnlRefresh() {
  let r;
  try {
    r = await window.senseAPI.readPnlHistory();
  } catch (e) {
    document.getElementById("pnl-last-update").textContent = "Erro: " + e.message;
    return;
  }
  if (r.error) {
    document.getElementById("pnl-last-update").textContent = "Erro: " + r.error;
    return;
  }
  pnlRenderMetrics(r.metrics);
  pnlDrawIntraday(r.today);
  pnlDrawMultiday(r.days);
  document.getElementById("pnl-last-update").textContent =
    "Última atualização: " + (r.lastUpdated || "—");
}

function pnlFormatBRL(v) {
  if (v === undefined || v === null) return "—";
  const abs = Math.abs(v).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return (v >= 0 ? "R$ " : "−R$ ") + abs;
}

function pnlSetMetric(id, value, cssClass) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = value;
  if (cssClass) el.className = "pnl-metric__value " + cssClass;
}

function pnlRenderMetrics(m) {
  if (!m) return;
  const posNeg = v => v >= 0 ? "pnl-metric__value--pos" : "pnl-metric__value--neg";

  pnlSetMetric("pnl-m-hoje",    pnlFormatBRL(m.resultadoHoje),   posNeg(m.resultadoHoje));
  pnlSetMetric("pnl-m-ops",     m.totalOpsHoje + " ops",         "pnl-metric__value--neutral");
  pnlSetMetric("pnl-m-winrate", m.winRateHoje + "%",             "pnl-metric__value--neutral");
  pnlSetMetric("pnl-m-dd",      pnlFormatBRL(m.drawdownMaxHoje), posNeg(m.drawdownMaxHoje));

  const seq = m.sequenciaAtual;
  if (seq && seq.count > 0) {
    const plural = seq.count > 1 ? "s" : "";
    pnlSetMetric("pnl-m-seq",
      seq.count + " " + seq.tipo + plural,
      seq.tipo === "ganho" ? "pnl-metric__value--pos" : "pnl-metric__value--neg");
  } else {
    pnlSetMetric("pnl-m-seq", "—", "pnl-metric__value--neutral");
  }

  pnlSetMetric("pnl-m-semana", pnlFormatBRL(m.resultadoSemana), posNeg(m.resultadoSemana));
}

function pnlDrawIntraday(today) {
  const canvas = document.getElementById("pnl-canvas-intraday");
  if (!canvas) return;
  canvas.width  = canvas.offsetWidth || 680;
  canvas.height = 140;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!today || today.length === 0) {
    ctx.fillStyle = "#666";
    ctx.font = "13px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Nenhuma operação hoje", canvas.width / 2, canvas.height / 2);
    return;
  }

  const pad = { top: 12, right: 16, bottom: 20, left: 60 };
  const w = canvas.width  - pad.left - pad.right;
  const h = canvas.height - pad.top  - pad.bottom;

  const values = today.map(t => t.pnlAcum);
  const minVal = Math.min(0, ...values);
  const maxVal = Math.max(0, ...values);
  const range  = maxVal - minVal || 1;

  const toX = i => pad.left + (i / Math.max(today.length - 1, 1)) * w;
  const toY = v => pad.top  + h - ((v - minVal) / range) * h;
  const y0  = toY(0);

  // Linha zero tracejada
  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = "#555";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad.left, y0);
  ctx.lineTo(pad.left + w, y0);
  ctx.stroke();
  ctx.restore();

  // Linha PnL
  const finalVal = values[values.length - 1];
  ctx.strokeStyle = finalVal >= 0 ? "#00cc66" : "#cc0000";
  ctx.lineWidth = 2;
  ctx.beginPath();
  today.forEach((t, i) => {
    const x = toX(i);
    const y = toY(t.pnlAcum);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Pontos por operação
  today.forEach((t, i) => {
    ctx.beginPath();
    ctx.arc(toX(i), toY(t.pnlAcum), 3, 0, Math.PI * 2);
    ctx.fillStyle = t.resultado >= 0 ? "#00cc66" : "#cc0000";
    ctx.fill();
  });

  // Labels eixo Y
  ctx.fillStyle = "#888";
  ctx.font = "10px sans-serif";
  ctx.textAlign = "right";
  if (maxVal !== 0) ctx.fillText(pnlFormatBRL(maxVal), pad.left - 4, pad.top + 10);
  ctx.fillText("0", pad.left - 4, y0 + 4);
  if (minVal !== 0) ctx.fillText(pnlFormatBRL(minVal), pad.left - 4, pad.top + h + 2);
}

function pnlDrawMultiday(days) {
  const canvas = document.getElementById("pnl-canvas-multiday");
  if (!canvas) return;
  canvas.width  = canvas.offsetWidth || 680;
  canvas.height = 140;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!days || days.length === 0) {
    ctx.fillStyle = "#666";
    ctx.font = "13px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Nenhum histórico disponível", canvas.width / 2, canvas.height / 2);
    return;
  }

  const pad = { top: 12, right: 16, bottom: 20, left: 60 };
  const w = canvas.width  - pad.left - pad.right;
  const h = canvas.height - pad.top  - pad.bottom;

  const values = days.map(d => d.resultado);
  const minVal = Math.min(0, ...values);
  const maxVal = Math.max(0, ...values);
  const range  = maxVal - minVal || 1;
  const toY    = v => pad.top + h - ((v - minVal) / range) * h;
  const y0     = toY(0);

  // Linha zero tracejada
  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = "#555";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad.left, y0);
  ctx.lineTo(pad.left + w, y0);
  ctx.stroke();
  ctx.restore();

  const barW = Math.max(4, w / days.length - 3);
  const gap  = (w - barW * days.length) / (days.length + 1);

  days.forEach((d, i) => {
    const x    = pad.left + gap + i * (barW + gap);
    const y    = d.resultado >= 0 ? toY(d.resultado) : y0;
    const barH = Math.max(1, Math.abs(toY(d.resultado) - y0));

    ctx.fillStyle = d.resultado >= 0 ? "#1a7a1a" : "#cc0000";
    ctx.fillRect(x, y, barW, barH);

    // Label data
    ctx.fillStyle = "#666";
    ctx.font = "9px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(d.date, x + barW / 2, canvas.height - 4);
  });

  // Labels eixo Y
  ctx.fillStyle = "#888";
  ctx.font = "10px sans-serif";
  ctx.textAlign = "right";
  if (maxVal !== 0) ctx.fillText(pnlFormatBRL(maxVal), pad.left - 4, pad.top + 10);
  ctx.fillText("0", pad.left - 4, y0 + 4);
  if (minVal !== 0) ctx.fillText(pnlFormatBRL(minVal), pad.left - 4, pad.top + h + 2);
}

// Fechar modal com tecla Esc
window.addEventListener("keydown", function(e) {
  if (e.key === "Escape" && _pnlInterval !== null) pnlModalClose();
});
