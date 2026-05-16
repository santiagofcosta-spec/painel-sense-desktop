// renderer-kill-switch.js
// Gerencia estado e interação do botão de kill switch no painel SENSE.

async function killSwitchInit() {
  const r = await window.senseAPI.killSwitchStatus();
  updateKillButton(r.active);
}

async function killSwitchToggle() {
  const btn = document.getElementById("btn-kill-switch");
  if (!btn) return;
  const isActive = btn.dataset.active === "true";
  if (!isActive) {
    if (!confirm("Travar EA?\nTodas as posições abertas serão fechadas imediatamente.")) return;
    const r = await window.senseAPI.travarEa();
    if (r.ok) updateKillButton(true);
    else alert("Erro ao travar EA: " + r.error);
  } else {
    const r = await window.senseAPI.desbloquearEa();
    if (r.ok) updateKillButton(false);
    else alert("Erro ao desbloquear EA: " + r.error);
  }
}

function updateKillButton(active) {
  const btn = document.getElementById("btn-kill-switch");
  if (!btn) return;
  btn.dataset.active            = active ? "true" : "false";
  btn.textContent               = active ? "Desbloquear EA" : "Travar EA";
  btn.style.backgroundColor     = active ? "#cc0000" : "#1a7a1a";
}

window.addEventListener("DOMContentLoaded", killSwitchInit);
