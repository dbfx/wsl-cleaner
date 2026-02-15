const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const { filterNoise, parseWslOutput, isValidExternalUrl, STALE_DIR_NAMES } = require('./lib/utils');

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
    width: 960,
    height: 750,
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
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('install-update', () => {
  autoUpdater.quitAndInstall();
});

app.whenReady().then(createWindow);

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

ipcMain.handle('check-wsl', async () => {
  try {
    const output = execSync('wsl -l -v', { encoding: 'utf16le' }).toString().trim();
    const { distros, defaultDistro } = parseWslOutput(output);

    if (distros.length === 0) {
      return { ok: false, error: 'No WSL 2 distributions found. Please install a WSL 2 distro first.' };
    }

    return { ok: true, distros, defaultDistro };
  } catch (err) {
    return { ok: false, error: 'WSL 2 is not installed or not available. Please install WSL 2 first.\n\n' + (err.message || '') };
  }
});

// ── WSL environment (suppress "bogus screen size" warnings) ──────────────────

const wslEnv = { ...process.env, TERM: 'dumb', COLUMNS: '120', LINES: '40' };

// filterNoise is imported from lib/utils.js

// ── Detect available tools inside WSL ────────────────────────────────────────

ipcMain.handle('detect-tools', async (_event, distro) => {
  const tools = {};
  const checks = [
    { name: 'composer', cmd: 'which composer' },
    { name: 'npm', cmd: 'which npm' },
    { name: 'snap', cmd: 'which snap' },
    { name: 'yarn', cmd: 'which yarn' },
    { name: 'go', cmd: 'which go' },
    { name: 'pip', cmd: 'which pip' },
    { name: 'pip3', cmd: 'which pip3' },
    { name: 'apt', cmd: 'which apt' },
    { name: 'dnf', cmd: 'which dnf' },
    { name: 'docker', cmd: 'which docker' },
    { name: 'pnpm', cmd: 'which pnpm' },
    { name: 'mvn', cmd: 'which mvn' },
    { name: 'gradle', cmd: 'which gradle' },
    { name: 'conda', cmd: 'which conda' },
    { name: 'gem', cmd: 'which gem' },
    { name: 'dotnet', cmd: 'which dotnet' },
    { name: 'deno', cmd: 'which deno' },
    { name: 'bun', cmd: 'which bun' },
    { name: 'dart', cmd: 'which dart' },
    { name: 'brew', cmd: 'which brew' },
    { name: 'ccache', cmd: 'which ccache' },
    { name: 'bazel', cmd: 'which bazel' },
  ];

  for (const check of checks) {
    try {
      execSync(`wsl -d ${distro} -- bash -lc "${check.cmd} 2>/dev/null"`, { encoding: 'utf8', timeout: 10000, env: wslEnv });
      tools[check.name] = true;
    } catch {
      tools[check.name] = false;
    }
  }

  return tools;
});

// ── Run a cleanup command inside WSL (streaming output, serialized) ──────────

let cleanupQueue = Promise.resolve();

function runCleanupTask({ distro, taskId, command, asRoot }) {
  return new Promise((resolve) => {
    const args = ['-d', distro];
    if (asRoot) args.push('-u', 'root');
    args.push('--', 'bash', '-lc', command);

    const proc = spawn('wsl', args, { windowsHide: true, env: wslEnv });
    let fullOutput = '';

    proc.stdout.on('data', (data) => {
      const text = filterNoise(data.toString());
      if (!text) return;
      fullOutput += text;
      mainWindow?.webContents.send('task-output', { taskId, text });
    });

    proc.stderr.on('data', (data) => {
      const text = filterNoise(data.toString());
      if (!text) return;
      fullOutput += text;
      mainWindow?.webContents.send('task-output', { taskId, text });
    });

    proc.on('close', (code) => {
      resolve({ ok: code === 0, output: fullOutput, code });
    });

    proc.on('error', (err) => {
      resolve({ ok: false, output: err.message, code: -1 });
    });
  });
}

ipcMain.handle('run-cleanup', async (event, opts) => {
  // Queue each task so they run strictly one at a time
  const result = new Promise((resolve) => {
    cleanupQueue = cleanupQueue.then(() => runCleanupTask(opts).then(resolve));
  });
  return result;
});

// ── Find VHDX files ──────────────────────────────────────────────────────────

ipcMain.handle('find-vhdx', async (_event, distro) => {
  const results = [];
  const localAppData = process.env.LOCALAPPDATA;
  const userProfile = process.env.USERPROFILE;

  if (localAppData) {
    const packagesDir = path.join(localAppData, 'Packages');
    try {
      const entries = fs.readdirSync(packagesDir);
      for (const entry of entries) {
        const localStatePath = path.join(packagesDir, entry, 'LocalState', 'ext4.vhdx');
        if (fs.existsSync(localStatePath)) {
          const stats = fs.statSync(localStatePath);
          results.push({ path: localStatePath, size: stats.size, folder: entry });
        }
      }
    } catch { /* ignore */ }
  }

  // Also check Docker Desktop WSL paths
  if (localAppData) {
    const dockerDir = path.join(localAppData, 'Docker', 'wsl');
    try {
      if (fs.existsSync(dockerDir)) {
        const walkDir = (dir) => {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              walkDir(fullPath);
            } else if (entry.name === 'ext4.vhdx') {
              const stats = fs.statSync(fullPath);
              results.push({ path: fullPath, size: stats.size, folder: 'Docker' });
            }
          }
        };
        walkDir(dockerDir);
      }
    } catch { /* ignore */ }
  }

  // Custom install locations in user profile
  if (userProfile) {
    const customPaths = [
      path.join(userProfile, 'AppData', 'Local', 'Packages'),
      path.join(userProfile, '.wsl'),
    ];
    for (const dir of customPaths) {
      try {
        if (fs.existsSync(dir) && !dir.includes('Packages')) {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory()) {
              const vhdxPath = path.join(dir, entry.name, 'ext4.vhdx');
              if (fs.existsSync(vhdxPath)) {
                const stats = fs.statSync(vhdxPath);
                results.push({ path: vhdxPath, size: stats.size, folder: entry.name });
              }
            }
          }
        }
      } catch { /* ignore */ }
    }
  }

  return results;
});

// ── Get file size ────────────────────────────────────────────────────────────

ipcMain.handle('get-file-size', async (_event, filePath) => {
  try {
    const stats = fs.statSync(filePath);
    return { ok: true, size: stats.size };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ── Run Windows-side WSL commands (shutdown, update, etc.) ───────────────────

ipcMain.handle('run-wsl-command', async (event, { command, taskId }) => {
  return new Promise((resolve) => {
    const parts = command.split(' ');
    const proc = spawn(parts[0], parts.slice(1), { windowsHide: true, shell: true });
    let fullOutput = '';

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      fullOutput += text;
      if (taskId) mainWindow?.webContents.send('task-output', { taskId, text });
    });

    proc.stderr.on('data', (data) => {
      const text = data.toString();
      fullOutput += text;
      if (taskId) mainWindow?.webContents.send('task-output', { taskId, text });
    });

    proc.on('close', (code) => {
      resolve({ ok: code === 0, output: fullOutput, code });
    });

    proc.on('error', (err) => {
      resolve({ ok: false, output: err.message, code: -1 });
    });
  });
});

// ── Scan for stale directories inside WSL ────────────────────────────────────

// STALE_DIR_NAMES is imported from lib/utils.js

ipcMain.handle('scan-stale-dirs', async (_event, { distro, days }) => {
  const staleDays = Math.max(1, parseInt(days, 10) || 30);
  return new Promise((resolve) => {
    // Build a bash script to avoid Windows argument escaping issues
    const nameTests = STALE_DIR_NAMES.map(n => `-name ${n}`).join(' -o ');

    // Write script to temp file to avoid all Windows argument escaping issues
    const tempDir = process.env.TEMP || '.';
    const tempScript = path.join(tempDir, 'wsl-cleaner-scan.sh');
    const scriptContent = [
      '#!/bin/bash',
      `find /home /root /var /tmp /opt -maxdepth 8 -type d \\( ${nameTests} \\) -mtime +${staleDays} -prune -print 2>/dev/null | while IFS= read -r dir; do`,
      '  size=$(du -sh "$dir" 2>/dev/null | cut -f1)',
      '  echo -e "$size\\t$dir"',
      'done',
    ].join('\n');
    fs.writeFileSync(tempScript, scriptContent.replace(/\r\n/g, '\n'), 'utf8');

    // Convert Windows path to WSL path for the script
    const wslScriptPath = tempScript.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, d) => `/mnt/${d.toLowerCase()}`);
    const args = ['-d', distro, '-u', 'root', '--', 'bash', wslScriptPath];
    const proc = spawn('wsl', args, { windowsHide: true, env: wslEnv });
    let output = '';

    proc.stdout.on('data', (data) => { output += data.toString(); });
    proc.stderr.on('data', () => {}); // discard stderr

    proc.on('close', () => {
      const results = [];
      const lines = output.trim().split('\n').filter(l => l.trim());
      for (const line of lines) {
        const parts = line.split('\t');
        if (parts.length >= 2) {
          const size = parts[0].trim();
          const dirPath = parts.slice(1).join('\t').trim();
          const name = path.basename(dirPath);
          results.push({ path: dirPath, size, name });
        }
      }
      resolve(results);
    });

    proc.on('error', () => resolve([]));
  });
});

// ── Delete stale directories inside WSL ──────────────────────────────────────

ipcMain.handle('delete-stale-dirs', async (_event, { distro, paths, taskId }) => {
  // Delete one at a time, streaming output
  const results = [];
  for (const dirPath of paths) {
    const result = await new Promise((resolve) => {
      const cmd = `rm -rf "${dirPath}" && echo "Deleted: ${dirPath}"`;
      const args = ['-d', distro, '-u', 'root', '--', 'bash', '-c', cmd];
      const proc = spawn('wsl', args, { windowsHide: true, env: wslEnv });
      let output = '';

      proc.stdout.on('data', (data) => {
        const text = filterNoise(data.toString());
        if (text) {
          output += text;
          mainWindow?.webContents.send('task-output', { taskId, text });
        }
      });
      proc.stderr.on('data', (data) => {
        const text = filterNoise(data.toString());
        if (text) {
          output += text;
          mainWindow?.webContents.send('task-output', { taskId, text });
        }
      });

      proc.on('close', (code) => resolve({ ok: code === 0, path: dirPath, output }));
      proc.on('error', (err) => resolve({ ok: false, path: dirPath, output: err.message }));
    });
    results.push(result);
  }
  return results;
});

// ── Optimize VHDX via elevated PowerShell ────────────────────────────────────

ipcMain.handle('optimize-vhdx', async (_event, { vhdxPath, taskId }) => {
  return new Promise((resolve) => {
    const tempDir = process.env.TEMP || '.';
    const tempScript = path.join(tempDir, 'wsl-cleaner-optimize.ps1');
    const tempOut = path.join(tempDir, 'wsl-cleaner-optimize.log');

    // Write the script to a temp file to avoid all quoting issues
    const scriptContent = [
      'try {',
      `  Optimize-VHD -Path '${vhdxPath.replace(/'/g, "''")}' -Mode Full`,
      `  'SUCCESS' | Out-File -FilePath '${tempOut.replace(/'/g, "''")}' -Encoding utf8`,
      '} catch {',
      `  $_.Exception.Message | Out-File -FilePath '${tempOut.replace(/'/g, "''")}' -Encoding utf8`,
      '}',
    ].join('\r\n');

    try { fs.unlinkSync(tempOut); } catch { /* ignore */ }
    fs.writeFileSync(tempScript, scriptContent, 'utf8');

    // Run the script elevated via Start-Process -Verb RunAs
    const args = [
      '-NoProfile',
      '-Command',
      `Start-Process powershell -Verb RunAs -Wait -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','${tempScript.replace(/'/g, "''")}'`
    ];

    const proc = spawn('powershell', args, { windowsHide: true, shell: false });
    let fullOutput = '';

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      fullOutput += text;
      if (taskId) mainWindow?.webContents.send('task-output', { taskId, text });
    });

    proc.stderr.on('data', (data) => {
      const text = data.toString();
      fullOutput += text;
      if (taskId) mainWindow?.webContents.send('task-output', { taskId, text });
    });

    proc.on('close', (code) => {
      // Clean up temp script
      try { fs.unlinkSync(tempScript); } catch { /* ignore */ }

      // Check the result file
      try {
        const result = fs.readFileSync(tempOut, 'utf8').trim();
        fs.unlinkSync(tempOut);
        if (result === 'SUCCESS') {
          resolve({ ok: true, output: 'Optimize-VHD completed successfully.', code: 0 });
        } else {
          resolve({ ok: false, output: result || fullOutput, code: code || 1 });
        }
      } catch {
        resolve({ ok: code === 0, output: fullOutput, code });
      }
    });

    proc.on('error', (err) => {
      resolve({ ok: false, output: err.message, code: -1 });
    });
  });
});
