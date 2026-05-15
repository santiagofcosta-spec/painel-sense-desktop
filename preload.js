/**
 * Ponte mínima: só senseAPI. NÃO fazer require() de outros ficheiros aqui —
 * se o require falhar, o preload inteiro aborta e window.senseAPI nunca existe.
 * A validação JSON fica em dashboard-guard.js carregado pelo index.html.
 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("senseAPI", {
  readDashboard: () => ipcRenderer.invoke("read-dashboard"),
  cancelarAlvoInvertido: () => ipcRenderer.invoke("cancelar-alvo-invertido"),
  pickDashboardFile: () => ipcRenderer.invoke("pick-dashboard-file"),
  /** SENSE IA — modelo via config.json (senseIa) ou env: OpenAI, Ollama ou Genspark. */
  senseIaAsk: () => ipcRenderer.invoke("sense-ia-ask"),
  /** Relatório estruturado A–G (Gatilho operacional / FA); não substitui a leitura curta do logo. */
  senseIaAskGatilhoDiagnostic: () => ipcRenderer.invoke("sense-ia-ask-gatilho-diagnostic"),
  /** Diagnóstico dedicado dos inputs MT5 que influenciam o gatilho operacional. */
  senseIaAskInputsDiagnostic: () => ipcRenderer.invoke("sense-ia-ask-inputs-diagnostic"),
  /** JSON compacto igual ao da SENSE IA — para colar no Cursor ou outro assistente. */
  senseIaGetCompactContext: () => ipcRenderer.invoke("sense-ia-get-compact-context"),
  /** Leitura automática: minutos entre disparos (0 = off). */
  getSenseIaSchedule: () => ipcRenderer.invoke("get-sense-ia-schedule"),
  /** Liga/desliga modo híbrido da IA no config.json. */
  setSenseIaHybridEnabled: (enabled) => ipcRenderer.invoke("set-sense-ia-hybrid-enabled", !!enabled),
  /** Publica o veredito visual/regras da IA para a EA ler em MQL5\Files. */
  publishSenseIaVerdict: (payload) => ipcRenderer.invoke("publish-sense-ia-verdict", payload || {}),
  senseIaLogDecision: (entry) => ipcRenderer.invoke("sense-ia-log-decision", entry),
  /** Guarda relatório de calibragem localmente no notebook. */
  saveIaCalibrationReport: (payload) => ipcRenderer.invoke("save-ia-calibration-report", payload || {}),
  /** Persiste o histograma do Raio-X dos 22 filtros (ranking 1..N) ao lado do dashboard.json. */
  saveBlockHistogram: (payload) => ipcRenderer.invoke("save-block-histogram", payload || {}),
  /** Gera o relatório diário do Raio-X (Markdown + CSV) no Ambiente de Trabalho. */
  saveRaioxReport: (payload) => ipcRenderer.invoke("save-raiox-report", payload || {}),
  /** Dispara IMEDIATAMENTE um ciclo de auto-calib (sem esperar o intervalo regular). */
  triggerInputsAutocalib: () => ipcRenderer.invoke("trigger-inputs-autocalib"),
  /** Guarda o texto do relatório Gatilho FA (A–F) em Markdown no Ambiente de Trabalho. */
  saveIaGatilhoFaReport: (payload) => ipcRenderer.invoke("save-ia-gatilho-fa-report", payload || {}),
  /** Guarda o diagnóstico de inputs em .md + .txt no Ambiente de Trabalho. */
  saveIaInputsReport: (payload) => ipcRenderer.invoke("save-ia-inputs-report", payload || {}),
  getLicenseStatus: () => ipcRenderer.invoke("get-license-status"),
  getSenseHealth: () => ipcRenderer.invoke("get-sense-health"),
  /** Chamado quando o ficheiro dashboard.json muda no disco (ex.: MT5 gravou). */
  onDashboardFileChanged: (cb) => {
    if (typeof cb !== "function") return () => {};
    const fn = () => {
      try {
        cb();
      } catch (e) {
        console.error(e);
      }
    };
    ipcRenderer.on("dashboard-file-changed", fn);
    return () => ipcRenderer.removeListener("dashboard-file-changed", fn);
  },
  /** Resultado do ciclo automático de 15 min — empurrado pelo processo principal. */
  onCycleResult: (cb) => {
    if (typeof cb !== "function") return () => {};
    const fn = (_, data) => {
      try {
        cb(data);
      } catch (e) {
        console.error(e);
      }
    };
    ipcRenderer.on("sense-ia-cycle-result", fn);
    return () => ipcRenderer.removeListener("sense-ia-cycle-result", fn);
  },
  onInputsAutocalibResult: (cb) => {
    if (typeof cb !== "function") return () => {};
    const fn = (_, data) => {
      try {
        cb(data);
      } catch (e) {
        console.error(e);
      }
    };
    ipcRenderer.on("sense-ia-inputs-autocalib-result", fn);
    return () => ipcRenderer.removeListener("sense-ia-inputs-autocalib-result", fn);
  },
});
