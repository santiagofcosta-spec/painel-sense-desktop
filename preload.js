/**
 * Ponte mínima: só senseAPI. NÃO fazer require() de outros ficheiros aqui —
 * se o require falhar, o preload inteiro aborta e window.senseAPI nunca existe.
 * A validação JSON fica em dashboard-guard.js carregado pelo index.html.
 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("senseAPI", {
  readDashboard: () => ipcRenderer.invoke("read-dashboard"),
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
  /** Guarda relatório de calibragem localmente no notebook. */
  saveIaCalibrationReport: (payload) => ipcRenderer.invoke("save-ia-calibration-report", payload || {}),
  /** Guarda o texto do relatório Gatilho FA (A–F) em Markdown no Ambiente de Trabalho. */
  saveIaGatilhoFaReport: (payload) => ipcRenderer.invoke("save-ia-gatilho-fa-report", payload || {}),
  /** Guarda o diagnóstico de inputs em .md + .txt no Ambiente de Trabalho. */
  saveIaInputsReport: (payload) => ipcRenderer.invoke("save-ia-inputs-report", payload || {}),
  getLicenseStatus: () => ipcRenderer.invoke("get-license-status"),
  /** Chamado quando o ficheiro dashboard.json muda no disco (ex.: MT5 gravou). */
  onDashboardFileChanged: (cb) => {
    if (typeof cb !== "function") return;
    const fn = () => {
      try {
        cb();
      } catch (e) {
        console.error(e);
      }
    };
    ipcRenderer.on("dashboard-file-changed", fn);
  },
  /** Resultado do ciclo automático de 15 min — empurrado pelo processo principal. */
  onCycleResult: (cb) => {
    if (typeof cb !== "function") return;
    ipcRenderer.on("sense-ia-cycle-result", (_, data) => {
      try {
        cb(data);
      } catch (e) {
        console.error(e);
      }
    });
  },
});
