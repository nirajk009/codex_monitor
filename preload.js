const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('widget', {
  onUpdate(callback) {
    ipcRenderer.on('usage-update', (_event, data) => callback(data));
  },
  onMode(callback) {
    ipcRenderer.on('view-mode', (_event, mode) => callback(mode));
  },
  onRefreshInterval(callback) {
    ipcRenderer.on('refresh-interval', (_event, milliseconds) => callback(milliseconds));
  },
  refresh() { ipcRenderer.send('refresh'); },
  toggleRefreshInterval() { ipcRenderer.send('toggle-refresh-interval'); },
  cycleMode() { ipcRenderer.send('cycle-mode'); },
  minimize() { ipcRenderer.send('minimize'); },
  close() { ipcRenderer.send('close'); },
  setAlwaysOnTop(value) { ipcRenderer.send('always-on-top', value); }
});
