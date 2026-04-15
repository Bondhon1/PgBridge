const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pgBridge', {
  startMigration: (payload) => ipcRenderer.invoke('migration:start', payload),
  cancelMigration: () => ipcRenderer.invoke('migration:cancel'),
  onStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('migration:status', listener);

    return () => {
      ipcRenderer.removeListener('migration:status', listener);
    };
  },
  onProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on('migration:progress', listener);

    return () => {
      ipcRenderer.removeListener('migration:progress', listener);
    };
  }
});
