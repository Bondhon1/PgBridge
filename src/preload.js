const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pgBridge', {
  startMigration: (payload) => ipcRenderer.invoke('migration:start', payload),
  onStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('migration:status', listener);

    return () => {
      ipcRenderer.removeListener('migration:status', listener);
    };
  }
});
