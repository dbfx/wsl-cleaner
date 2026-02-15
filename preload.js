const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wslCleaner', {
  // Window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),

  // WSL detection
  checkWsl: () => ipcRenderer.invoke('check-wsl'),
  detectTools: (distro) => ipcRenderer.invoke('detect-tools', distro),

  // Cleanup tasks
  runCleanup: (opts) => ipcRenderer.invoke('run-cleanup', opts),

  // Disk compaction
  findVhdx: (distro) => ipcRenderer.invoke('find-vhdx', distro),
  getFileSize: (filePath) => ipcRenderer.invoke('get-file-size', filePath),
  runWslCommand: (opts) => ipcRenderer.invoke('run-wsl-command', opts),
  optimizeVhdx: (opts) => ipcRenderer.invoke('optimize-vhdx', opts),

  // Stale directory scanning
  scanStaleDirs: (opts) => ipcRenderer.invoke('scan-stale-dirs', opts),
  deleteStaleDirs: (opts) => ipcRenderer.invoke('delete-stale-dirs', opts),

  // App info & external URLs
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  openExternal: (url) => ipcRenderer.invoke('open-external-url', url),

  // Streaming output listener
  onTaskOutput: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('task-output', handler);
    return () => ipcRenderer.removeListener('task-output', handler);
  },
});
