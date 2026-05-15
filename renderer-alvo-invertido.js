/**
 * Alvo Invertido — card de alerta no bloco «Alvos / Níveis».
 * Depende de: renderer-utils.js (escapeHtml).
 * Gerencia #alvoInvertidoCard e visibilidade de #levelsBox.
 * Exporta: paintAlvoInvertidoOverlay(levelsBox, d) → bool
 */

let _alvoInvPrevAtivo = false;

function _tocarAlertaAlvoInvertido() {
  try {
    const ctx = new AudioContext();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch (_) { /* AudioContext não disponível */ }
}

function _buildAlvoInvertidoCardHtml(ai) {
  const dir       = String(ai.direcao || "").toUpperCase() === "BUY" ? "COMPRA" : "VENDA";
  const entrada   = Number(ai.entradaPrice  || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const novoAlvo  = Number(ai.novoTarget    || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const slVal     = Number(ai.sl            || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const distancia = Number(ai.distancia     || 0).toFixed(2);
  const countdown = Number(ai.countdown     || 0);
  const count     = Number(ai.count         || 0);
  const sinal     = String(ai.direcao || "").toUpperCase() === "BUY" ? "+" : "-";

  return `<div class="alvo-inv-alert">
    <div class="alvo-inv-header">&#9888; ALVO INVERTIDO &#8212; ${escapeHtml(dir)}</div>
    <div class="alvo-inv-desc">Alvo original abaixo da entrada. Novo alvo calculado:</div>
    <div class="alvo-inv-row"><span class="lbl">Entrada</span><strong>${escapeHtml(entrada)}</strong></div>
    <div class="alvo-inv-row"><span class="lbl">Novo Alvo</span><strong class="alvo-inv--buy">${escapeHtml(novoAlvo)} (${sinal}${escapeHtml(distancia)} pts)</strong></div>
    <div class="alvo-inv-row"><span class="lbl">SL</span><strong class="alvo-inv--sl">${escapeHtml(slVal)}</strong></div>
    <div class="alvo-inv-footer">
      <span>Executando em <strong>${countdown}s</strong></span>
      <button id="btn-cancelar-alvo-invertido" class="alvo-inv-btn-cancel">CANCELAR</button>
    </div>
    ${count > 1 ? `<div class="alvo-inv-session-badge">Ocorr&#234;ncia #${count} na sess&#227;o</div>` : ""}
  </div>`;
}

/**
 * Chamada no início de paintDashboardLevelsPanel.
 * Retorna true se o overlay está ativo (levelsBox não deve ser preenchido normalmente).
 * Retorna false se o alvo invertido está inativo (renderização normal prossegue).
 */
function paintAlvoInvertidoOverlay(levelsBox, d) {
  const ai    = d && typeof d.alvoInvertido === "object" ? d.alvoInvertido : null;
  const ativo = !!(ai && ai.ativo);
  const count = Number((ai && ai.count) || 0);
  const cardEl = document.getElementById("alvoInvertidoCard");

  if (!cardEl) return false;

  // Som apenas na transição false → true
  if (ativo && !_alvoInvPrevAtivo) {
    _tocarAlertaAlvoInvertido();
  }
  _alvoInvPrevAtivo = ativo;

  if (ativo) {
    levelsBox.style.display = "none";
    cardEl.innerHTML = _buildAlvoInvertidoCardHtml(ai);
    const btn = document.getElementById("btn-cancelar-alvo-invertido");
    if (btn && window.senseAPI && typeof window.senseAPI.cancelarAlvoInvertido === "function") {
      btn.onclick = () => window.senseAPI.cancelarAlvoInvertido();
    }
    return true;
  }

  // Inativo: restaurar levelsBox, mostrar badge de sessão se houver
  levelsBox.style.display = "";
  cardEl.innerHTML = count > 0
    ? `<div class="alvo-inv-session-badge">Alvo invertido ativo ${count}&times; nesta sess&#227;o</div>`
    : "";
  return false;
}
