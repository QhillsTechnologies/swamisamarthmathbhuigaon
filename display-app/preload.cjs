const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('pairing', {
  get: () => ipcRenderer.invoke('pairing-get'),
  save: (url) => ipcRenderer.invoke('pairing-save', url),
})
