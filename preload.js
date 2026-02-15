const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wslCleaner', {
  // Window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  quit: () => ipcRenderer.send('app-quit'),
  reload: () => ipcRenderer.send('window-reload'),
  toggleFullscreen: () => ipcRenderer.send('window-toggle-fullscreen'),

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

  // Size estimation
  estimateTaskSizes: (opts) => ipcRenderer.invoke('estimate-task-sizes', opts),

  // Disk usage scanning (treemap)
  scanDiskUsage: (opts) => ipcRenderer.invoke('scan-disk-usage', opts),
  cancelDiskScan: () => ipcRenderer.invoke('cancel-disk-scan'),

  // Health info
  getHealthInfo: (distro) => ipcRenderer.invoke('get-health-info', distro),

  // Distro management
  exportDistro: (opts) => ipcRenderer.invoke('export-distro', opts),
  importDistro: (opts) => ipcRenderer.invoke('import-distro', opts),
  cloneDistro: (opts) => ipcRenderer.invoke('clone-distro', opts),
  restartDistro: (opts) => ipcRenderer.invoke('restart-distro', opts),
  getDistroComparison: (distros) => ipcRenderer.invoke('get-distro-comparison', distros),
  showSaveDialog: (opts) => ipcRenderer.invoke('show-save-dialog', opts),
  showOpenDialog: (opts) => ipcRenderer.invoke('show-open-dialog', opts),

  // App info & external URLs
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  openExternal: (url) => ipcRenderer.invoke('open-external-url', url),

  // Streaming output listener
  onTaskOutput: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('task-output', handler);
    return () => ipcRenderer.removeListener('task-output', handler);
  },

  // Cleanup history / stats
  getCleanupHistory: () => ipcRenderer.invoke('get-cleanup-history'),
  saveCleanupSession: (data) => ipcRenderer.invoke('save-cleanup-session', data),
  clearCleanupHistory: () => ipcRenderer.invoke('clear-cleanup-history'),

  // Task preferences
  getTaskPreferences: () => ipcRenderer.invoke('get-task-preferences'),
  saveTaskPreferences: (prefs) => ipcRenderer.invoke('save-task-preferences', prefs),

  // Auto-update
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdateStatus: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('update-status', handler);
    return () => ipcRenderer.removeListener('update-status', handler);
  },

  // i18n / Locale
  getLocaleData: (code) => ipcRenderer.invoke('get-locale-data', code),
  getLanguages: () => ipcRenderer.invoke('get-languages'),
  getLocalePreference: () => ipcRenderer.invoke('get-locale-preference'),
  saveLocalePreference: (code) => ipcRenderer.invoke('save-locale-preference', code),

  // System tray & alerts
  saveTrayPreferences: (prefs) => ipcRenderer.invoke('save-tray-preferences', prefs),
  getTrayLatestStats: () => ipcRenderer.invoke('tray-get-latest-stats'),
  onTrayStatsUpdated: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('tray-stats-updated', handler);
    return () => ipcRenderer.removeListener('tray-stats-updated', handler);
  },
  onNotificationNavigate: (callback) => {
    const handler = (_event, page) => callback(page);
    ipcRenderer.on('notification-navigate', handler);
    return () => ipcRenderer.removeListener('notification-navigate', handler);
  },
});
