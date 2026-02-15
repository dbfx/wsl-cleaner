const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const { isValidExternalUrl, friendlyError } = require('./lib/utils');
const wslOps = require('./lib/wsl-ops');
const statsDb = require('./lib/stats-db');
const preferences = require('./lib/preferences');

// ── Logging setup ────────────────────────────────────────────────────────────

log.transports.file.level = 'info';
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';

// ── Single-instance lock ─────────────────────────────────────────────────────

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    backgroundColor: '#0f0f1a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Check for updates after the window is ready
  mainWindow.webContents.on('did-finish-load', () => {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(err => {
        log.warn('Auto-update check failed:', err.message);
      });
    }, 3000);
  });
}

// ── Auto-updater events ──────────────────────────────────────────────────────

function sendUpdateStatus(data) {
  mainWindow?.webContents.send('update-status', data);
}

autoUpdater.on('checking-for-update', () => {
  log.info('Checking for update...');
  sendUpdateStatus({ status: 'checking' });
});

autoUpdater.on('update-available', (info) => {
  log.info('Update available:', info.version);
  sendUpdateStatus({ status: 'available', version: info.version });
});

autoUpdater.on('update-not-available', (info) => {
  log.info('Update not available. Current version is up to date.');
  sendUpdateStatus({ status: 'up-to-date', version: info.version });
});

autoUpdater.on('download-progress', (progress) => {
  log.info(`Download progress: ${Math.round(progress.percent)}%`);
  sendUpdateStatus({
    status: 'downloading',
    percent: Math.round(progress.percent),
    transferred: progress.transferred,
    total: progress.total,
  });
});

autoUpdater.on('update-downloaded', (info) => {
  log.info('Update downloaded:', info.version);
  sendUpdateStatus({ status: 'downloaded', version: info.version });
});

autoUpdater.on('error', (err) => {
  log.error('Auto-updater error:', err.message);
  sendUpdateStatus({ status: 'error', message: err.message });
});

// ── Auto-updater IPC handlers ────────────────────────────────────────────────

ipcMain.handle('check-for-updates', async () => {
  try {
    const result = await autoUpdater.checkForUpdates();
    return { ok: true };
  } catch (err) {
    log.error('Manual update check failed:', err.message);
    return { ok: false, error: friendlyError(err.message) };
  }
});

ipcMain.handle('install-update', () => {
  autoUpdater.quitAndInstall();
});

app.whenReady().then(() => {
  const userData = app.getPath('userData');
  statsDb.init(userData);
  preferences.init(userData);
  createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});

// ── Window controls ──────────────────────────────────────────────────────────

ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window-close', () => mainWindow?.close());
ipcMain.on('app-quit', () => app.quit());
ipcMain.on('window-reload', () => mainWindow?.webContents.reload());
ipcMain.on('window-toggle-fullscreen', () => {
  if (mainWindow) mainWindow.setFullScreen(!mainWindow.isFullScreen());
});

// ── App info & external URLs ─────────────────────────────────────────────────

ipcMain.handle('get-app-version', () => app.getVersion());

ipcMain.handle('open-external-url', async (_event, url) => {
  // Only allow http/https URLs for security
  if (isValidExternalUrl(url)) {
    await shell.openExternal(url);
    return { ok: true };
  }
  return { ok: false, error: 'Invalid URL' };
});

// ── WSL2 Detection ──────────────────────────────────────────────────────────

ipcMain.handle('check-wsl', async () => wslOps.checkWsl());

// ── Detect available tools inside WSL ────────────────────────────────────────

ipcMain.handle('detect-tools', async (_event, distro) => wslOps.detectTools(distro));

// ── Run a cleanup command inside WSL (streaming output, serialized) ──────────

let cleanupQueue = Promise.resolve();

ipcMain.handle('run-cleanup', async (event, opts) => {
  const onOutput = (data) => mainWindow?.webContents.send('task-output', data);
  // Queue each task so they run strictly one at a time
  const result = new Promise((resolve) => {
    cleanupQueue = cleanupQueue.then(() =>
      wslOps.runCleanupTask({ ...opts, onOutput }).then(resolve)
    );
  });
  return result;
});

// ── Find VHDX files ──────────────────────────────────────────────────────────

ipcMain.handle('find-vhdx', async (_event, _distro) => wslOps.findVhdx());

// ── Get file size ────────────────────────────────────────────────────────────

ipcMain.handle('get-file-size', async (_event, filePath) => wslOps.getFileSize(filePath));

// ── Run Windows-side WSL commands (shutdown, update, etc.) ───────────────────

ipcMain.handle('run-wsl-command', async (event, { command, taskId }) => {
  const onOutput = (data) => mainWindow?.webContents.send('task-output', data);
  return wslOps.runWslCommand({ command, taskId, onOutput });
});

// ── Scan for stale directories inside WSL ────────────────────────────────────

ipcMain.handle('scan-stale-dirs', async (_event, { distro, days }) => {
  return wslOps.scanStaleDirs({ distro, days });
});

// ── Delete stale directories inside WSL ──────────────────────────────────────

ipcMain.handle('delete-stale-dirs', async (_event, { distro, paths, taskId }) => {
  const onOutput = (data) => mainWindow?.webContents.send('task-output', data);
  return wslOps.deleteStaleDirs({ distro, paths, taskId, onOutput });
});

// ── Optimize VHDX via elevated PowerShell ────────────────────────────────────

ipcMain.handle('optimize-vhdx', async (_event, { vhdxPath, taskId }) => {
  const onOutput = (data) => mainWindow?.webContents.send('task-output', data);
  return wslOps.optimizeVhdx({ vhdxPath, taskId, onOutput });
});

// ── Cleanup history / stats ──────────────────────────────────────────────────

ipcMain.handle('get-cleanup-history', () => {
  return statsDb.loadHistory();
});

ipcMain.handle('save-cleanup-session', (_event, record) => {
  return statsDb.saveSession(record);
});

ipcMain.handle('clear-cleanup-history', () => {
  statsDb.clearHistory();
  return { ok: true };
});

// ── Estimate task sizes ──────────────────────────────────────────────────────

ipcMain.handle('estimate-task-sizes', async (_event, opts) => {
  return wslOps.estimateTaskSizes(opts);
});

// ── Disk usage scanning (treemap) ────────────────────────────────────────────

ipcMain.handle('scan-disk-usage', async (_event, { distro, targetPath, maxDepth }) => {
  return wslOps.scanDiskUsage({ distro, targetPath, maxDepth });
});

ipcMain.handle('cancel-disk-scan', async () => {
  wslOps.cancelDiskScan();
  return { ok: true };
});

// ── Health info ──────────────────────────────────────────────────────────

ipcMain.handle('get-health-info', async (_event, distro) => {
  return wslOps.getHealthInfo(distro);
});

// ── Task preferences ─────────────────────────────────────────────────────────

ipcMain.handle('get-task-preferences', () => {
  return preferences.loadPreferences();
});

ipcMain.handle('save-task-preferences', (_event, prefs) => {
  preferences.savePreferences(prefs);
  return { ok: true };
});

// ── i18n / Locale data ───────────────────────────────────────────────────────

ipcMain.handle('get-locale-data', (_event, code) => {
  // Sanitise the locale code to prevent directory traversal
  const safeCode = String(code).replace(/[^a-z0-9-]/gi, '');
  const localeFile = path.join(__dirname, 'locales', `${safeCode}.json`);
  try {
    const raw = fs.readFileSync(localeFile, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
});

ipcMain.handle('get-languages', () => {
  const langFile = path.join(__dirname, 'locales', 'languages.json');
  try {
    const raw = fs.readFileSync(langFile, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { sourceLocale: 'en', locales: [{ code: 'en', name: 'English', nativeName: 'English' }] };
  }
});

ipcMain.handle('get-locale-preference', () => {
  return preferences.getLocale();
});

ipcMain.handle('save-locale-preference', (_event, code) => {
  preferences.setLocale(code);
  return { ok: true };
});
