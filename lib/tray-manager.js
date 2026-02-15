// ── System tray manager with live stats and smart alerts ─────────────────────

const { Tray, Menu, Notification, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const log = require('electron-log');

let tray = null;
let mainWindow = null;
let wslOps = null;
let preferences = null;
let monitorInterval = null;
let tickInProgress = false;
let lastHealthSnapshot = null;
let lastAlertTimestamps = {};

// ── Locale helper (main process reads locale files directly) ─────────────────

let localeCache = null;
let localeCacheCode = null;

function getLocaleStrings() {
  const code = preferences.getLocale();
  if (localeCache && localeCacheCode === code) return localeCache;

  const localeFile = path.join(__dirname, '..', 'locales', `${code}.json`);
  const enFile = path.join(__dirname, '..', 'locales', 'en.json');

  let strings = {};
  try { strings = JSON.parse(fs.readFileSync(enFile, 'utf8')); } catch {}
  if (code !== 'en') {
    try {
      const localeData = JSON.parse(fs.readFileSync(localeFile, 'utf8'));
      Object.assign(strings, localeData);
    } catch {}
  }

  localeCache = strings;
  localeCacheCode = code;
  return strings;
}

function t(key, params) {
  const strings = getLocaleStrings();
  let str = strings[key] || key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.replaceAll('{' + k + '}', v);
    }
  }
  return str;
}

function invalidateLocaleCache() {
  localeCache = null;
  localeCacheCode = null;
}

// ── Byte formatting ──────────────────────────────────────────────────────────

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i > 1 ? 1 : 0) + ' ' + units[i];
}

// ── Tray lifecycle ───────────────────────────────────────────────────────────

function initTray(win, ops, prefs) {
  if (tray) return; // already initialised

  mainWindow = win;
  wslOps = ops;
  preferences = prefs;

  const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip('WSL Cleaner');

  tray.on('click', () => showWindow());

  buildContextMenu(null);

  const savedPrefs = preferences.loadPreferences();
  const distro = savedPrefs._trayDistro || '';
  const interval = (savedPrefs._trayInterval || 60) * 1000;
  startMonitoring(distro, interval);

  log.info('System tray initialised');
}

function destroyTray() {
  stopMonitoring();
  if (tray) {
    tray.destroy();
    tray = null;
  }
  lastHealthSnapshot = null;
  lastAlertTimestamps = {};
  log.info('System tray destroyed');
}

function showWindow() {
  if (!mainWindow) return;
  if (!mainWindow.isVisible()) mainWindow.show();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}

// ── Monitoring loop ──────────────────────────────────────────────────────────

function startMonitoring(distro, intervalMs) {
  stopMonitoring();
  // Run first tick immediately
  tick(distro);
  monitorInterval = setInterval(() => tick(distro), intervalMs);
}

function stopMonitoring() {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
}

function restartMonitoring() {
  const prefs = preferences.loadPreferences();
  const distro = prefs._trayDistro || '';
  const interval = (prefs._trayInterval || 60) * 1000;
  startMonitoring(distro, interval);
}

async function tick(distro) {
  if (tickInProgress) return;
  tickInProgress = true;

  try {
    // Check WSL availability
    const wslResult = wslOps.checkWsl();
    if (!wslResult.ok) {
      if (tray) tray.setToolTip('WSL Cleaner - WSL not available');
      buildContextMenu(null);
      sendStatsToRenderer(null);
      tickInProgress = false;
      return;
    }

    // Use configured distro or fall back to default
    const targetDistro = distro || wslResult.defaultDistro;
    if (!targetDistro) {
      if (tray) tray.setToolTip('WSL Cleaner - No distro found');
      buildContextMenu(null);
      sendStatsToRenderer(null);
      tickInProgress = false;
      return;
    }

    // Gather health and VHDX data
    const [healthResult, vhdxData] = await Promise.all([
      wslOps.getHealthInfo(targetDistro),
      Promise.resolve(wslOps.findVhdx()),
    ]);

    const health = healthResult.ok ? healthResult.data : null;
    const snapshot = { health, vhdx: vhdxData, distro: targetDistro, timestamp: Date.now() };
    lastHealthSnapshot = snapshot;

    // Update tray
    updateTrayTooltip(health, vhdxData);
    buildContextMenu(snapshot);
    sendStatsToRenderer(snapshot);

    // Evaluate alerts
    const prefs = preferences.loadPreferences();
    evaluateAlerts(health, vhdxData, prefs);
  } catch (err) {
    log.warn('Tray monitoring tick failed:', err.message);
    if (tray) tray.setToolTip('WSL Cleaner - Monitor error');
  } finally {
    tickInProgress = false;
  }
}

// ── Tooltip ──────────────────────────────────────────────────────────────────

function updateTrayTooltip(health, vhdxData) {
  if (!tray) return;

  const parts = ['WSL Cleaner'];

  // VHDX total size
  if (vhdxData && vhdxData.length > 0) {
    const totalSize = vhdxData.reduce((sum, v) => sum + v.size, 0);
    parts.push('Disk: ' + formatBytes(totalSize));
  }

  // RAM usage
  if (health && health.memory && health.memory.total > 0) {
    const usedPercent = Math.round(
      ((health.memory.total - health.memory.available) / health.memory.total) * 100
    );
    parts.push('RAM: ' + usedPercent + '%');
  }

  // Docker containers or uptime
  if (health && health.docker) {
    parts.push(health.docker.total + ' containers');
  }

  tray.setToolTip(parts.join(' | '));
}

// ── Context menu ─────────────────────────────────────────────────────────────

function buildContextMenu(snapshot) {
  if (!tray) return;

  const items = [];

  if (snapshot && snapshot.health) {
    const h = snapshot.health;
    const vhdx = snapshot.vhdx;

    // VHDX size
    if (vhdx && vhdx.length > 0) {
      const totalSize = vhdx.reduce((sum, v) => sum + v.size, 0);
      items.push({ label: 'Disk: ' + formatBytes(totalSize), enabled: false });
    }

    // RAM
    if (h.memory && h.memory.total > 0) {
      const usedPercent = Math.round(
        ((h.memory.total - h.memory.available) / h.memory.total) * 100
      );
      items.push({
        label: 'RAM: ' + formatBytes(h.memory.total - h.memory.available)
          + ' / ' + formatBytes(h.memory.total) + ' (' + usedPercent + '%)',
        enabled: false,
      });
    }

    // Docker
    if (h.docker) {
      items.push({
        label: 'Docker: ' + h.docker.running + ' running, ' + h.docker.stopped + ' stopped',
        enabled: false,
      });
    }

    // DNS
    if (h.dns) {
      items.push({
        label: 'DNS: ' + (h.dns.ok ? 'OK' : 'FAILING'),
        enabled: false,
      });
    }

    items.push({ type: 'separator' });
  }

  items.push({
    label: t('tray.menuOpen'),
    click: () => showWindow(),
  });

  items.push({ type: 'separator' });

  items.push({
    label: t('tray.menuQuit'),
    click: () => {
      const { app } = require('electron');
      app.quit();
    },
  });

  tray.setContextMenu(Menu.buildFromTemplate(items));
}

// ── Send stats to renderer ───────────────────────────────────────────────────

function sendStatsToRenderer(snapshot) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('tray-stats-updated', snapshot);
  }
}

// ── Alert evaluation ─────────────────────────────────────────────────────────

function evaluateAlerts(health, vhdxData, prefs) {
  if (!prefs._alertsEnabled) return;

  const cooldownMs = (prefs._alertCooldown || 30) * 60 * 1000;
  const now = Date.now();

  const checks = [
    {
      id: 'vhdxSize',
      enabled: prefs._alertVhdxSize,
      condition: () => {
        if (!vhdxData || vhdxData.length === 0) return null;
        const totalGB = vhdxData.reduce((sum, v) => sum + v.size, 0) / (1024 ** 3);
        const threshold = prefs._alertVhdxSizeThreshold || 60;
        return totalGB > threshold
          ? { size: formatBytes(vhdxData.reduce((s, v) => s + v.size, 0)), threshold }
          : null;
      },
      navigateTo: 'settings',
    },
    {
      id: 'memoryHigh',
      enabled: prefs._alertMemoryHigh,
      condition: () => {
        if (!health || !health.memory || !health.memory.total) return null;
        const usedPercent = Math.round(
          ((health.memory.total - health.memory.available) / health.memory.total) * 100
        );
        const threshold = prefs._alertMemoryHighThreshold || 80;
        return usedPercent > threshold ? { percent: usedPercent, threshold } : null;
      },
      navigateTo: 'health',
    },
    {
      id: 'dockerSpace',
      enabled: prefs._alertDockerSpace,
      condition: () => {
        if (!health || !health.docker) return null;
        const threshold = prefs._alertDockerSpaceThreshold || 10;
        return health.docker.total > threshold
          ? { count: health.docker.total, threshold }
          : null;
      },
      navigateTo: 'health',
    },
    {
      id: 'zombies',
      enabled: prefs._alertZombies,
      condition: () => {
        if (!health || !health.zombies) return null;
        const threshold = prefs._alertZombiesThreshold || 1;
        return health.zombies.length >= threshold
          ? { count: health.zombies.length, threshold }
          : null;
      },
      navigateTo: 'health',
    },
    {
      id: 'systemdFail',
      enabled: prefs._alertSystemdFail,
      condition: () => {
        if (!health || !health.systemd || !health.systemd.failedUnits) return null;
        const threshold = prefs._alertSystemdFailThreshold || 1;
        return health.systemd.failedUnits.length >= threshold
          ? { count: health.systemd.failedUnits.length, threshold }
          : null;
      },
      navigateTo: 'health',
    },
    {
      id: 'dnsBroken',
      enabled: prefs._alertDnsBroken,
      condition: () => {
        if (!health || !health.dns) return null;
        return health.dns.ok === false ? {} : null;
      },
      navigateTo: 'health',
    },
  ];

  for (const check of checks) {
    if (!check.enabled) continue;

    // Check cooldown
    const lastFired = lastAlertTimestamps[check.id] || 0;
    if (now - lastFired < cooldownMs) continue;

    // Evaluate condition
    const result = check.condition();
    if (result === null) continue;

    // Fire notification
    const title = t('alerts.' + check.id + '.title');
    const body = t('alerts.' + check.id + '.notification', result);

    fireNotification(title, body, check.navigateTo);
    lastAlertTimestamps[check.id] = now;
  }
}

function fireNotification(title, body, navigateTo) {
  if (!Notification.isSupported()) return;

  const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');
  const notification = new Notification({
    title,
    body,
    icon: iconPath,
  });

  notification.on('click', () => {
    showWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('notification-navigate', navigateTo);
    }
  });

  notification.show();
  log.info(`Alert fired: ${title}`);
}

// ── Public API ───────────────────────────────────────────────────────────────

function getLatestStats() {
  return lastHealthSnapshot;
}

function isActive() {
  return tray !== null;
}

module.exports = {
  initTray,
  destroyTray,
  restartMonitoring,
  getLatestStats,
  isActive,
  invalidateLocaleCache,
};
