const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pty", {
  start: () => ipcRenderer.invoke("pty:start"),
  write: (input) => ipcRenderer.invoke("pty:write", input),
  onData: (callback) =>
    ipcRenderer.on("pty:data", (_event, data) => callback(data)),
});