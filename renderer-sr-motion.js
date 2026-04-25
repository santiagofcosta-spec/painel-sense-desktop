/**
 * SR forte + faixa de sinal: ResizeObserver e deslize horizontal (rAF).
 * Estado em `window.SenseRendererState` (srDetect*). Carregar após renderer-state.js.
 */
(function () {
  if (typeof window === "undefined") return;

  function st() {
    const x = window.SenseRendererState;
    if (!x || typeof x !== "object") {
      throw new Error("Painel SENSE: falta renderer-state.js antes de renderer-sr-motion.js (ver index.html).");
    }
    return x;
  }

  const SR_MOTION_MOVING_SELECTOR =
    "#summaryBox .hud-sr-detect--lead-strong:not(.hud-sr-detect--absorption-nuance) .hud-sr-detect__moving, #levelsBox .hud-sr-detect--lead-strong:not(.hud-sr-detect--absorption-nuance) .hud-sr-detect__moving";
  const SR_MOTION_TRACK_SELECTOR =
    "#summaryBox .hud-sr-detect--lead-strong:not(.hud-sr-detect--absorption-nuance) .hud-sr-detect__track, #levelsBox .hud-sr-detect--lead-strong:not(.hud-sr-detect--absorption-nuance) .hud-sr-detect__track";

  function ensureSrDetectResizeObserver() {
    const S = st();
    const summaryBox = document.getElementById("summaryBox");
    const levelsBox = document.getElementById("levelsBox");
    const signalBanner = document.getElementById("signalBanner");
    if ((!summaryBox && !levelsBox && !signalBanner) || typeof ResizeObserver === "undefined") return;
    if (S.srDetectResizeObserver) {
      if (signalBanner) {
        try {
          S.srDetectResizeObserver.observe(signalBanner);
        } catch {
          /* já observado em alguns runtimes */
        }
      }
      return;
    }
    S.srDetectResizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(ensureSrDetectTextMotionLoop);
    });
    if (summaryBox) S.srDetectResizeObserver.observe(summaryBox);
    if (levelsBox) S.srDetectResizeObserver.observe(levelsBox);
    if (signalBanner) S.srDetectResizeObserver.observe(signalBanner);
  }

  function stopSrDetectTextMotion() {
    const S = st();
    if (S.srDetectTextMotionRaf != null) {
      cancelAnimationFrame(S.srDetectTextMotionRaf);
      S.srDetectTextMotionRaf = null;
    }
    S.srDetectTextMotionActive = false;
    document.querySelectorAll(SR_MOTION_MOVING_SELECTOR).forEach((el) => {
      el.style.removeProperty("transform");
    });
    document.querySelectorAll("#signalBanner .signal-strip__moving").forEach((el) => {
      el.style.removeProperty("transform");
    });
  }

  function srDetectTextMotionFrame() {
    const S = st();
    S.srDetectTextMotionRaf = null;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      stopSrDetectTextMotion();
      return;
    }
    const tracks = document.querySelectorAll(SR_MOTION_TRACK_SELECTOR);
    const signalTrack = document.querySelector("#signalBanner .signal-strip__track");
    if (tracks.length === 0 && !signalTrack) {
      stopSrDetectTextMotion();
      return;
    }
    const periodMs = 18000;
    const halfMs = 9000;
    const t = Date.now() % periodMs;
    const phase = t < halfMs ? t / halfMs : 2 - t / halfMs;

    tracks.forEach((track) => {
      const moving = track.querySelector(".hud-sr-detect__moving");
      if (!moving) return;
      const travel = Math.max(0, track.clientWidth - moving.offsetWidth);
      moving.style.transform = `translateX(${phase * travel}px)`;
    });

    if (signalTrack) {
      const moving = signalTrack.querySelector(".signal-strip__moving");
      if (moving) {
        const travel = Math.max(0, signalTrack.clientWidth - moving.offsetWidth);
        if (travel <= 0) moving.style.removeProperty("transform");
        else moving.style.transform = `translateX(${phase * travel}px)`;
      }
    }

    S.srDetectTextMotionRaf = requestAnimationFrame(srDetectTextMotionFrame);
  }

  function ensureSrDetectTextMotionLoop() {
    const S = st();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      stopSrDetectTextMotion();
      return;
    }
    const tracks = document.querySelectorAll(SR_MOTION_TRACK_SELECTOR);
    const signalTrack = document.querySelector("#signalBanner .signal-strip__track");
    if (tracks.length === 0 && !signalTrack) {
      stopSrDetectTextMotion();
      return;
    }
    S.srDetectTextMotionActive = true;
    if (S.srDetectTextMotionRaf == null) {
      S.srDetectTextMotionRaf = requestAnimationFrame(srDetectTextMotionFrame);
    }
  }

  function scheduleSignalStripMarqueeLayout() {
    ensureSrDetectResizeObserver();
    ensureSrDetectTextMotionLoop();
    requestAnimationFrame(() => {
      requestAnimationFrame(ensureSrDetectTextMotionLoop);
    });
    setTimeout(ensureSrDetectTextMotionLoop, 0);
    setTimeout(ensureSrDetectTextMotionLoop, 120);
  }

  function scheduleSrDetectLeadStrongLayout() {
    ensureSrDetectResizeObserver();
    ensureSrDetectTextMotionLoop();
    requestAnimationFrame(() => {
      requestAnimationFrame(ensureSrDetectTextMotionLoop);
    });
    setTimeout(ensureSrDetectTextMotionLoop, 0);
    setTimeout(ensureSrDetectTextMotionLoop, 120);
  }

  window.ensureSrDetectResizeObserver = ensureSrDetectResizeObserver;
  window.stopSrDetectTextMotion = stopSrDetectTextMotion;
  window.srDetectTextMotionFrame = srDetectTextMotionFrame;
  window.ensureSrDetectTextMotionLoop = ensureSrDetectTextMotionLoop;
  window.scheduleSignalStripMarqueeLayout = scheduleSignalStripMarqueeLayout;
  window.scheduleSrDetectLeadStrongLayout = scheduleSrDetectLeadStrongLayout;
})();
