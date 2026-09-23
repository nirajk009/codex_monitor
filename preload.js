const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('widget', {
  onUpdate(callback) {
    ipcRenderer.on('usage-update', (_event, data) => callback(data));
  },
  onMode(callback) {
    ipcRenderer.on('view-mode', (_event, mode) => callback(mode));
  },
  refresh() { ipcRenderer.send('refresh'); },
  cycleMode() { ipcRenderer.send('cycle-mode'); },
  minimize() { ipcRenderer.send('minimize'); },
  close() { ipcRenderer.send('close'); },
  setAlwaysOnTop(value) { ipcRenderer.send('always-on-top', value); }
});
