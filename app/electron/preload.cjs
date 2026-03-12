const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld('pty', {
  start: (cols, rows) => ipcRenderer.send('pty:start', { cols, rows }),
  write: (data) => ipcRenderer.send('pty:write', data),
  onData: (cb) => ipcRenderer.on('pty:data', (_, data) => cb(data)),
  onContextReady: (cb) => ipcRenderer.on('context:ready', (_, ctx) => cb(ctx)),
  onAiQuery: (cb) => ipcRenderer.on('ai:query', (_, payload) => cb(payload)),
  getContext: () => ipcRenderer.invoke('context:get')
});

contextBridge.exposeInMainWorld('ai', {
  explain: (ctx) => ipcRenderer.invoke('ai:explain', ctx),
  query: (input, ctx) => ipcRenderer.invoke('ai:query', { input, context: ctx }),
  script: (input, ctx) => ipcRenderer.invoke('ai:script', { input, context: ctx })
});
