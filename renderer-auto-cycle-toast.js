(function () {
  "use strict";

  const COLORS = {
    baseline: { bg: "#0d1b2a", border: "#3b82f6", icon: "◈" },
    vies: { bg: "#0d1b2a", border: "#3b82f6", icon: "↕" },
    confianca: { bg: "#0a1f12", border: "#22c55e", icon: "↑" },
    fallback: { bg: "#1f1a08", border: "#eab308", icon: "⚠" },
    stale: { bg: "#1f1a08", border: "#eab308", icon: "⚠" },
    error: { bg: "#1f0808", border: "#ef4444", icon: "✕" },
  };

  const PROVIDER_LABELS = { ollama: "Ollama", openai: "OpenAI", genspark: "Genspark" };
  let container = null;

  function ensureContainer() {
    if (container) return container;
    container = document.getElementById("autoCycleToastContainer");
    if (!container) {
      container = document.createElement("div");
      container.id = "autoCycleToastContainer";
      document.body.appendChild(container);
    }
    Object.assign(container.style, {
      position: "fixed",
      bottom: "18px",
      right: "18px",
      zIndex: "9999",
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      pointerEvents: "none",
      maxWidth: "320px",
    });
    return container;
  }

  function buildMainLabel(payload) {
    const { type, vies, confianca, prevVies, prevConfianca, message } = payload;
    if (type === "error" || type === "stale" || type === "fallback") return message || "IA: erro no ciclo automático";
    if (type === "baseline") return `${vies} · ${confianca}%`;
    if (type === "vies") return `${prevVies} → ${vies} · ${confianca}%`;
    if (type === "confianca") return `${vies} · ${prevConfianca}% → ${confianca}%`;
    return `${vies} · ${confianca}%`;
  }

  function showToast(payload) {
    const c = ensureContainer();
    const colors = COLORS[payload.type] || COLORS.error;
    const durationMs = payload.toastDurationMs || 30000;
    const mainLabel = buildMainLabel(payload);
    const providerTag = payload.provider ? PROVIDER_LABELS[payload.provider] || payload.provider : null;

    const toast = document.createElement("div");
    Object.assign(toast.style, {
      background: colors.bg,
      border: `1px solid ${colors.border}`,
      borderRadius: "6px",
      padding: "10px 12px 14px 12px",
      fontFamily: "monospace",
      fontSize: "12px",
      color: "#e2e8f0",
      boxShadow: "0 4px 12px rgba(0,0,0,0.65)",
      cursor: "pointer",
      pointerEvents: "all",
      position: "relative",
      overflow: "hidden",
      userSelect: "none",
      lineHeight: "1.4",
    });

    toast.innerHTML =
      (providerTag
        ? `<span style="position:absolute;top:6px;right:8px;font-size:9px;opacity:0.45;color:#94a3b8">${providerTag}</span>`
        : "") +
      `<span style="color:${colors.border};margin-right:6px">${colors.icon}</span>` +
      `<span style="font-weight:bold">${mainLabel}</span>` +
      (payload.razao
        ? `<div class="actoast-razao" style="margin-top:4px;opacity:0.65;font-size:10px;display:none">${payload.razao}</div>`
        : "") +
      `<div class="actoast-bar" style="position:absolute;bottom:0;left:0;height:2px;background:${colors.border};width:100%;transition:transform linear ${durationMs}ms;transform-origin:left"></div>`;

    let dismissed = false;
    let expanded = false;
    toast.addEventListener("click", () => {
      const r = toast.querySelector(".actoast-razao");
      if (r) {
        expanded = !expanded;
        r.style.display = expanded ? "block" : "none";
      }
    });

    c.appendChild(toast);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const bar = toast.querySelector(".actoast-bar");
        if (bar) bar.style.transform = "scaleX(0)";
      });
    });

    const timer = setTimeout(() => {
      if (dismissed) return;
      dismissed = true;
      toast.style.transition = "opacity 0.3s";
      toast.style.opacity = "0";
      setTimeout(() => {
        if (toast.parentNode) toast.remove();
      }, 320);
    }, durationMs);

    toast.addEventListener(
      "dblclick",
      () => {
        clearTimeout(timer);
        dismissed = true;
        toast.remove();
      },
      { once: true },
    );
  }

  function init() {
    if (!window.senseAPI || typeof window.senseAPI.onCycleResult !== "function") return;
    window.senseAPI.onCycleResult((payload) => {
      if (!payload || !payload.type) return;
      showToast(payload);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
