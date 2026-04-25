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
  /** Leitura automática: minutos entre disparos (0 = off). */
  getSenseIaSchedule: () => ipcRenderer.invoke("get-sense-ia-schedule"),
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
});
