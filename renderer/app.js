// ── Task definitions ─────────────────────────────────────────────────────────

const TASKS = [
  {
    id: 'apt-update',
    name: 'Update System Packages',
    desc: 'Brings all system packages up to date. Uses <code>dnf upgrade</code> on Fedora/RHEL or <code>apt-get update &amp;&amp; upgrade</code> on Debian/Ubuntu.',
    command: 'if command -v dnf &>/dev/null; then dnf upgrade -y; else DEBIAN_FRONTEND=noninteractive apt-get update -y && DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" || true; fi',
    asRoot: true,
    requires: null,
  },
  {
    id: 'apt-clean',
    name: 'Clean Old Packages',
    desc: 'Removes orphaned packages and clears package caches. Uses <code>dnf clean all &amp;&amp; dnf autoremove</code> on Fedora/RHEL or <code>apt autoremove &amp;&amp; clean</code> on Debian/Ubuntu.',
    command: 'if command -v dnf &>/dev/null; then dnf clean all && dnf autoremove -y; else DEBIAN_FRONTEND=noninteractive apt -y autoremove; apt -y clean; fi || true',
    asRoot: true,
    requires: null,
  },
  {
    id: 'journal',
    name: 'Shrink Systemd Journal',
    desc: 'Reduces journal log files to 10 MB and removes entries older than 2 weeks.',
    command: 'journalctl --vacuum-size=10M && journalctl --vacuum-time=2weeks',
    asRoot: true,
    requires: null,
  },
  {
    id: 'tmp',
    name: 'Clean Temporary Files',
    desc: 'Deletes all files in <code>/tmp</code> and <code>/var/tmp</code>.',
    command: 'rm -rf /tmp/* /var/tmp/*',
    asRoot: true,
    requires: null,
  },
  {
    id: 'caches',
    name: 'Clean User Caches',
    desc: 'Clears npm cache, pip cache, and browser caches (Mozilla, Chrome) from your home directory.',
    command: 'rm -rf ~/.npm; (pip cache purge 2>/dev/null || pip3 cache purge 2>/dev/null || true); rm -rf ~/.cache/mozilla/* ~/.cache/google-chrome/*',
    asRoot: false,
    requires: null,
  },
  {
    id: 'rotated-logs',
    name: 'Clean Old Rotated Logs',
    desc: 'Removes compressed and rotated log files (<code>.gz</code>, <code>.old</code>, <code>.1</code>) from <code>/var/log</code>.',
    command: 'find /var/log -type f \\( -name "*.gz" -o -name "*.old" -o -name "*.1" \\) -delete',
    asRoot: true,
    requires: null,
  },
  {
    id: 'truncate-logs',
    name: 'Truncate Active Log Files',
    desc: 'Empties <code>/var/log/syslog</code> and all <code>*.log</code> files in <code>/var/log</code> without deleting them, freeing space while keeping the files intact for continued logging.',
    command: 'truncate -s 0 /var/log/syslog 2>/dev/null; truncate -s 0 /var/log/*.log 2>/dev/null; echo "Log files truncated"',
    asRoot: true,
    requires: null,
  },
  {
    id: 'apt-lists',
    name: 'Clean Apt Package Lists',
    desc: 'Removes cached package lists from <code>/var/lib/apt/lists</code>. They are recreated on the next <code>apt update</code>. (Debian/Ubuntu only)',
    command: 'rm -rf /var/lib/apt/lists/*',
    asRoot: true,
    requires: 'apt',
  },
  {
    id: 'snap-cache',
    name: 'Clean Snap Cache',
    desc: 'Removes cached snap packages from <code>/var/lib/snapd/cache</code>.',
    command: 'rm -rf /var/lib/snapd/cache/*',
    asRoot: true,
    requires: 'snap',
  },
  {
    id: 'vscode-server',
    name: 'Clean VS Code / Cursor Server',
    desc: 'Removes extension caches and log files from <code>~/.vscode-server</code> and <code>~/.cursor-server</code>. Preserves extensions and settings.',
    command: 'rm -rf ~/.vscode-server/extensionCache ~/.vscode-server/bin/*/log ~/.vscode-server/data/logs ~/.cursor-server/extensionCache ~/.cursor-server/bin/*/log ~/.cursor-server/data/logs',
    asRoot: false,
    requires: null,
  },
  {
    id: 'trash',
    name: 'Empty Trash',
    desc: 'Empties the desktop trash folder at <code>~/.local/share/Trash</code>.',
    command: 'rm -rf ~/.local/share/Trash/*',
    asRoot: false,
    requires: null,
  },
  {
    id: 'thumbnails',
    name: 'Clean Thumbnail Cache',
    desc: 'Removes cached image thumbnails from <code>~/.cache/thumbnails</code>.',
    command: 'rm -rf ~/.cache/thumbnails/*',
    asRoot: false,
    requires: null,
  },
  {
    id: 'yarn-cache',
    name: 'Clean Yarn Cache',
    desc: 'Runs <code>yarn cache clean</code> to remove all cached Yarn packages.',
    command: 'yarn cache clean',
    asRoot: false,
    requires: 'yarn',
  },
  {
    id: 'go-cache',
    name: 'Clean Go Module Cache',
    desc: 'Runs <code>go clean -modcache</code> to remove downloaded Go module files.',
    command: 'go clean -modcache',
    asRoot: false,
    requires: 'go',
  },
  {
    id: 'cargo-cache',
    name: 'Clean Cargo/Rust Registry Cache',
    desc: 'Removes cached crate files from <code>~/.cargo/registry/cache</code> and <code>~/.cargo/registry/src</code>.',
    command: 'rm -rf ~/.cargo/registry/cache/* ~/.cargo/registry/src/*',
    asRoot: false,
    requires: null,
  },
];

// ── State ────────────────────────────────────────────────────────────────────

let state = {
  distro: null,
  tools: {},
  vhdxFiles: [],
  taskEnabled: {},
  isRunning: false,
  currentPage: localStorage.getItem('wsl-cleaner-page') || 'simple',
};

// Initialise toggles - all on by default
TASKS.forEach(t => (state.taskEnabled[t.id] = true));

// ── DOM refs ─────────────────────────────────────────────────────────────────

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const errorScreen = $('#error-screen');
const loadingScreen = $('#loading-screen');
const mainScreen = $('#main-screen');
const errorMessage = $('#error-message');
const statusText = $('#status-text');
const distroName = $('#distro-name');

// Advanced page
const taskCardsEl = $('#task-cards');
const btnRunCleanup = $('#btn-run-cleanup');
const logPanel = $('#log-panel');
const logOutput = $('#log-output');
const btnClearLog = $('#btn-clear-log');
const vhdxPathEl = $('#vhdx-path');
const vhdxSizeEl = $('#vhdx-size');
const btnCompact = $('#btn-compact');
const compactResult = $('#compact-result');
const sizeBefore = $('#size-before');
const sizeAfter = $('#size-after');
const spaceSaved = $('#space-saved');

// Simple page
const simpleSize = $('#simple-size');
const btnSimpleGo = $('#btn-simple-go');
const simpleSteps = $('#simple-steps');
const simpleResult = $('#simple-result');
const simpleSizeBefore = $('#simple-size-before');
const simpleSizeAfter = $('#simple-size-after');
const simpleSpaceSaved = $('#simple-space-saved');

// About page
const aboutVersion = $('#about-version');
const btnCheckUpdates = $('#btn-check-updates');
const btnGitHub = $('#btn-github');

// ── Window controls ──────────────────────────────────────────────────────────

$('#btn-minimize').addEventListener('click', () => window.wslCleaner.minimize());
$('#btn-maximize').addEventListener('click', () => window.wslCleaner.maximize());
$('#btn-close').addEventListener('click', () => window.wslCleaner.close());

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return val.toFixed(i > 1 ? 2 : 0) + ' ' + units[i];
}

function showScreen(screen) {
  [errorScreen, loadingScreen, mainScreen].forEach(s => s.classList.add('hidden'));
  screen.classList.remove('hidden');
}

function appendLog(text) {
  logPanel.classList.remove('hidden');
  logOutput.textContent += text;
  logOutput.scrollTop = logOutput.scrollHeight;
}

function setTaskState(taskId, stateClass) {
  const card = document.querySelector(`.task-card[data-id="${taskId}"]`);
  if (!card) return;
  card.classList.remove('running', 'completed', 'failed');
  if (stateClass) card.classList.add(stateClass);

  const iconSlot = card.querySelector('.task-status-slot');
  if (!iconSlot) return;

  if (stateClass === 'running') {
    iconSlot.innerHTML = '<div class="task-spinner"></div>';
  } else if (stateClass === 'completed') {
    iconSlot.innerHTML = `<svg class="task-status-icon" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2.5"><polyline points="20,6 9,17 4,12"/></svg>`;
  } else if (stateClass === 'failed') {
    iconSlot.innerHTML = `<svg class="task-status-icon" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  } else {
    iconSlot.innerHTML = '';
  }
}

// ── Page navigation ──────────────────────────────────────────────────────────

function switchPage(pageName) {
  state.currentPage = pageName;
  localStorage.setItem('wsl-cleaner-page', pageName);

  // Update nav items
  $$('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === pageName);
  });

  // Show/hide pages
  $$('.page').forEach(page => page.classList.add('hidden'));
  const target = $(`#page-${pageName}`);
  if (target) target.classList.remove('hidden');
}

// Wire sidebar clicks
$$('.nav-item').forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    if (state.isRunning) return; // Don't switch while running
    switchPage(item.dataset.page);
  });
});

// ── Build task cards (Advanced) ──────────────────────────────────────────────

function renderTasks() {
  taskCardsEl.innerHTML = '';
  for (const task of TASKS) {
    const available = !task.requires || state.tools[task.requires];
    const card = document.createElement('div');
    card.className = `task-card fade-in${available ? '' : ' unavailable'}`;
    card.dataset.id = task.id;

    card.innerHTML = `
      <label class="toggle" onclick="event.stopPropagation()">
        <input type="checkbox" data-task="${task.id}" ${state.taskEnabled[task.id] && available ? 'checked' : ''} ${!available ? 'disabled' : ''}>
        <span class="toggle-slider"></span>
      </label>
      <div class="task-info">
        <div class="task-name">
          ${task.name}
          ${!available ? `<span class="chip-unavailable">${task.requires} not found</span>` : ''}
        </div>
        <div class="task-desc">${task.desc}</div>
      </div>
      <div class="task-status-slot"></div>
    `;

    card.addEventListener('click', () => {
      if (!available || state.isRunning) return;
      const cb = card.querySelector('input[type="checkbox"]');
      cb.checked = !cb.checked;
      state.taskEnabled[task.id] = cb.checked;
    });

    const cb = card.querySelector('input[type="checkbox"]');
    cb.addEventListener('change', (e) => {
      state.taskEnabled[task.id] = e.target.checked;
    });

    taskCardsEl.appendChild(card);
  }
}

// ── Streaming output listener ────────────────────────────────────────────────

window.wslCleaner.onTaskOutput(({ taskId, text }) => {
  appendLog(text);
});

// ── Run cleanup (Advanced) ───────────────────────────────────────────────────

btnRunCleanup.addEventListener('click', async () => {
  if (state.isRunning) return;
  state.isRunning = true;
  btnRunCleanup.disabled = true;
  btnCompact.disabled = true;
  logOutput.textContent = '';
  logPanel.classList.remove('hidden');

  const enabledTasks = TASKS.filter(t => {
    const available = !t.requires || state.tools[t.requires];
    return available && state.taskEnabled[t.id];
  });

  for (const task of enabledTasks) {
    appendLog(`\n── ${task.name} ──────────────────────────────\n`);
    setTaskState(task.id, 'running');

    const result = await window.wslCleaner.runCleanup({
      distro: state.distro,
      taskId: task.id,
      command: task.command,
      asRoot: task.asRoot,
    });

    if (result.ok) {
      setTaskState(task.id, 'completed');
      appendLog(`\n✓ ${task.name} completed.\n`);
    } else {
      setTaskState(task.id, 'failed');
      appendLog(`\n✗ ${task.name} failed (exit code ${result.code}).\n`);
    }
  }

  appendLog('\n══ All tasks finished. ══\n');
  state.isRunning = false;
  btnRunCleanup.disabled = false;
  btnCompact.disabled = false;
});

// ── Clear log ────────────────────────────────────────────────────────────────

btnClearLog.addEventListener('click', () => {
  logOutput.textContent = '';
});

// ── Stale directory scanner (Advanced) ───────────────────────────────────────

const btnScanStale = $('#btn-scan-stale');
const staleResults = $('#stale-results');
const staleScanSummary = $('#stale-scan-summary');
const staleDirList = $('#stale-dir-list');
const btnDeleteStale = $('#btn-delete-stale');
const staleSelectAllCb = $('#stale-select-all-cb');
const staleDeleteResult = $('#stale-delete-result');
const staleDeleteSummary = $('#stale-delete-summary');
const staleEnabledCb = $('#stale-enabled-cb');
const staleDaysInput = $('#stale-days-input');

let staleDirs = []; // cached scan results

function getStaleDays() {
  return Math.max(1, parseInt(staleDaysInput.value, 10) || 30);
}

function renderStaleDirs(dirs) {
  staleDirs = dirs;

  if (dirs.length === 0) {
    staleDirList.innerHTML = `
      <div class="stale-empty">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20,6 9,17 4,12"/>
        </svg>
        <p>No stale directories found. Your WSL filesystem looks clean!</p>
      </div>`;
    staleScanSummary.innerHTML = `<span>No stale directories found (nothing older than ${getStaleDays()} days).</span>`;
    btnDeleteStale.classList.add('hidden');
    staleSelectAllCb.parentElement.parentElement.classList.add('hidden');
    return;
  }

  // Show toolbar and delete button
  btnDeleteStale.classList.remove('hidden');
  staleSelectAllCb.parentElement.parentElement.classList.remove('hidden');
  staleSelectAllCb.checked = true;

  // Summary
  staleScanSummary.innerHTML = `
    Found <span class="summary-count">${dirs.length}</span> stale director${dirs.length === 1 ? 'y' : 'ies'}
    &mdash; total estimated size: <span class="summary-size">${estimateTotalSize(dirs)}</span>
  `;

  // Render list items
  staleDirList.innerHTML = dirs.map((d, i) => {
    // Highlight the directory name in the path
    const lastSlash = d.path.lastIndexOf('/');
    const parentPath = d.path.substring(0, lastSlash + 1);
    const dirName = d.path.substring(lastSlash + 1);
    return `
      <div class="stale-dir-item" data-index="${i}">
        <input type="checkbox" class="stale-cb" data-index="${i}" checked />
        <div class="stale-dir-path" title="${escapeHtml(d.path)}">
          ${escapeHtml(parentPath)}<span class="stale-dir-name">${escapeHtml(dirName)}</span>
        </div>
        <span class="stale-dir-size">${escapeHtml(d.size)}</span>
      </div>`;
  }).join('');
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function estimateTotalSize(dirs) {
  // Parse human-readable sizes like "120M", "4.5G", "240K" and sum them
  let totalBytes = 0;
  const multipliers = { K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4 };
  for (const d of dirs) {
    const match = d.size.match(/^([\d.]+)\s*([KMGT])?/i);
    if (match) {
      const num = parseFloat(match[1]);
      const unit = (match[2] || '').toUpperCase();
      totalBytes += num * (multipliers[unit] || 1);
    }
  }
  return formatBytes(totalBytes);
}

function getCheckedStalePaths() {
  const cbs = staleDirList.querySelectorAll('.stale-cb:checked');
  return Array.from(cbs).map(cb => staleDirs[parseInt(cb.dataset.index)].path);
}

// Stale directory toggle (Advanced)
staleEnabledCb.addEventListener('change', () => {
  const enabled = staleEnabledCb.checked;
  btnScanStale.disabled = !enabled;
  staleDaysInput.disabled = !enabled;
  if (!enabled) {
    staleResults.classList.add('hidden');
  }
});

// Select all / deselect all
staleSelectAllCb.addEventListener('change', () => {
  const checked = staleSelectAllCb.checked;
  staleDirList.querySelectorAll('.stale-cb').forEach(cb => { cb.checked = checked; });
});

// Scan button
btnScanStale.addEventListener('click', async () => {
  if (state.isRunning) return;
  state.isRunning = true;
  btnScanStale.disabled = true;
  const days = getStaleDays();
  btnScanStale.innerHTML = `<div class="task-spinner" style="width:18px;height:18px;border-width:2px;"></div> Scanning (${days} days)...`;
  staleResults.classList.add('hidden');
  staleDeleteResult.classList.add('hidden');

  try {
    const results = await window.wslCleaner.scanStaleDirs({ distro: state.distro, days });
    renderStaleDirs(results);
    staleResults.classList.remove('hidden');
  } catch (err) {
    staleScanSummary.innerHTML = `<span style="color: var(--danger);">Scan failed: ${escapeHtml(err.message || String(err))}</span>`;
    staleDirList.innerHTML = '';
    staleResults.classList.remove('hidden');
  }

  btnScanStale.disabled = false;
  btnScanStale.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Scan for Stale Directories`;
  state.isRunning = false;
});

// Delete button
btnDeleteStale.addEventListener('click', async () => {
  if (state.isRunning) return;
  const paths = getCheckedStalePaths();
  if (paths.length === 0) return;

  state.isRunning = true;
  btnDeleteStale.disabled = true;
  btnScanStale.disabled = true;
  btnDeleteStale.innerHTML = `<div class="task-spinner" style="width:18px;height:18px;border-width:2px;"></div> Deleting ${paths.length} director${paths.length === 1 ? 'y' : 'ies'}...`;
  staleDeleteResult.classList.add('hidden');

  // Show log panel for output
  logPanel.classList.remove('hidden');
  appendLog(`\n── Deleting ${paths.length} stale director${paths.length === 1 ? 'y' : 'ies'} ──────────────────────────────\n`);

  try {
    const results = await window.wslCleaner.deleteStaleDirs({
      distro: state.distro,
      paths,
      taskId: 'stale-delete',
    });

    const successCount = results.filter(r => r.ok).length;
    const failCount = results.length - successCount;

    appendLog(`\n✓ Deleted ${successCount} of ${results.length} directories.${failCount > 0 ? ` ${failCount} failed.` : ''}\n`);

    staleDeleteSummary.textContent = `Successfully deleted ${successCount} of ${results.length} directories.${failCount > 0 ? ` ${failCount} failed.` : ''}`;
    staleDeleteResult.classList.remove('hidden');

    // Remove deleted items from the list
    const deletedPaths = new Set(results.filter(r => r.ok).map(r => r.path));
    const remaining = staleDirs.filter(d => !deletedPaths.has(d.path));
    renderStaleDirs(remaining);
  } catch (err) {
    appendLog(`\n✗ Deletion error: ${err.message || err}\n`);
  }

  btnDeleteStale.disabled = false;
  btnScanStale.disabled = false;
  btnDeleteStale.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> Delete Selected`;
  state.isRunning = false;
});

// ── Disk compaction (Advanced) ───────────────────────────────────────────────

async function loadVhdxInfo() {
  const files = await window.wslCleaner.findVhdx(state.distro);
  state.vhdxFiles = files;

  if (files.length > 0) {
    const main = files[0];
    vhdxPathEl.textContent = main.path;
    vhdxPathEl.title = main.path;
    vhdxSizeEl.textContent = formatBytes(main.size);
    simpleSize.textContent = formatBytes(main.size);
  } else {
    vhdxPathEl.textContent = 'Not found';
    vhdxSizeEl.textContent = '--';
    simpleSize.textContent = '--';
  }
}

btnCompact.addEventListener('click', async () => {
  if (state.isRunning) return;
  if (state.vhdxFiles.length === 0) {
    appendLog('\n✗ No VHDX file found. Cannot compact.\n');
    logPanel.classList.remove('hidden');
    return;
  }

  state.isRunning = true;
  btnCompact.disabled = true;
  btnRunCleanup.disabled = true;
  compactResult.classList.add('hidden');
  logOutput.textContent = '';
  logPanel.classList.remove('hidden');

  const vhdxPath = state.vhdxFiles[0].path;

  appendLog('── Measuring disk size before compaction...\n');
  const beforeResult = await window.wslCleaner.getFileSize(vhdxPath);
  const beforeSize = beforeResult.ok ? beforeResult.size : 0;
  appendLog(`   Before: ${formatBytes(beforeSize)}\n`);

  appendLog('\n── Shutting down WSL...\n');
  await window.wslCleaner.runWslCommand({ command: 'wsl --shutdown', taskId: 'compact' });
  appendLog('   WSL shut down.\n');

  appendLog('\n── Updating WSL...\n');
  await window.wslCleaner.runWslCommand({ command: 'wsl --update', taskId: 'compact' });
  appendLog('   WSL updated.\n');

  appendLog('\n── Ensuring WSL is fully stopped...\n');
  await window.wslCleaner.runWslCommand({ command: 'wsl --shutdown', taskId: 'compact' });
  appendLog('   WSL stopped.\n');

  appendLog('\n── Compacting virtual disk (Optimize-VHD)...\n');
  appendLog('   You may see a UAC elevation prompt.\n');
  const compactRes = await window.wslCleaner.optimizeVhdx({ vhdxPath, taskId: 'compact' });
  if (compactRes.ok) {
    appendLog('   Compaction finished.\n');
  } else {
    appendLog(`   Compaction issue: ${compactRes.output}\n`);
  }

  appendLog('\n── Restarting WSL...\n');
  await window.wslCleaner.runWslCommand({ command: `wsl -d ${state.distro} -- echo "WSL restarted"`, taskId: 'compact' });
  appendLog('   WSL is running.\n');

  appendLog('\n── Measuring disk size after compaction...\n');
  const afterResult = await window.wslCleaner.getFileSize(vhdxPath);
  const afterSize = afterResult.ok ? afterResult.size : 0;
  appendLog(`   After: ${formatBytes(afterSize)}\n`);

  const saved = beforeSize - afterSize;
  appendLog(`\n══ Space saved: ${formatBytes(Math.max(0, saved))} ══\n`);

  sizeBefore.textContent = formatBytes(beforeSize);
  sizeAfter.textContent = formatBytes(afterSize);
  spaceSaved.textContent = saved > 0 ? formatBytes(saved) : '0 B (no change)';
  compactResult.classList.remove('hidden');
  vhdxSizeEl.textContent = formatBytes(afterSize);
  simpleSize.textContent = formatBytes(afterSize);

  state.isRunning = false;
  btnCompact.disabled = false;
  btnRunCleanup.disabled = false;
});

// ── Simple mode helpers ──────────────────────────────────────────────────────

function setSimpleStep(stepName, status) {
  const item = simpleSteps.querySelector(`.step-item[data-step="${stepName}"]`);
  if (!item) return;

  item.classList.remove('active', 'done', 'failed');
  const iconSlot = item.querySelector('.step-icon-slot');

  if (status === 'active') {
    item.classList.add('active');
    iconSlot.innerHTML = '<div class="step-spinner"></div>';
  } else if (status === 'done') {
    item.classList.add('done');
    iconSlot.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2.5"><polyline points="20,6 9,17 4,12"/></svg>`;
  } else if (status === 'failed') {
    item.classList.add('failed');
    iconSlot.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  } else {
    iconSlot.innerHTML = '';
  }
}

function resetSimpleSteps() {
  simpleSteps.querySelectorAll('.step-item').forEach(item => {
    item.classList.remove('active', 'done', 'failed');
    item.querySelector('.step-icon-slot').innerHTML = '';
  });
}

// ── Simple mode: Clean & Compact ─────────────────────────────────────────────

btnSimpleGo.addEventListener('click', async () => {
  if (state.isRunning) return;
  if (state.vhdxFiles.length === 0) return;

  state.isRunning = true;
  btnSimpleGo.disabled = true;
  simpleResult.classList.add('hidden');
  simpleSteps.classList.remove('hidden');
  resetSimpleSteps();

  const vhdxPath = state.vhdxFiles[0].path;

  // Measure before
  const beforeResult = await window.wslCleaner.getFileSize(vhdxPath);
  const beforeSize = beforeResult.ok ? beforeResult.size : 0;

  // Step 1: Run all available cleanup tasks
  setSimpleStep('cleanup', 'active');
  const availableTasks = TASKS.filter(t => !t.requires || state.tools[t.requires]);
  let cleanupOk = true;

  for (const task of availableTasks) {
    const result = await window.wslCleaner.runCleanup({
      distro: state.distro,
      taskId: task.id,
      command: task.command,
      asRoot: task.asRoot,
    });
    if (!result.ok) cleanupOk = false;
  }
  setSimpleStep('cleanup', cleanupOk ? 'done' : 'failed');

  // Step 1b: Scan and delete stale directories
  setSimpleStep('stale', 'active');
  try {
    const staleDirsFound = await window.wslCleaner.scanStaleDirs({ distro: state.distro, days: 30 });
    if (staleDirsFound.length > 0) {
      const stalePaths = staleDirsFound.map(d => d.path);
      await window.wslCleaner.deleteStaleDirs({
        distro: state.distro,
        paths: stalePaths,
        taskId: 'simple-stale',
      });
    }
    setSimpleStep('stale', 'done');
  } catch {
    setSimpleStep('stale', 'failed');
  }

  // Step 2: Shutdown WSL
  setSimpleStep('shutdown', 'active');
  await window.wslCleaner.runWslCommand({ command: 'wsl --shutdown', taskId: 'simple' });
  setSimpleStep('shutdown', 'done');

  // Step 3: Update WSL
  setSimpleStep('update', 'active');
  await window.wslCleaner.runWslCommand({ command: 'wsl --update', taskId: 'simple' });
  setSimpleStep('update', 'done');

  // Step 4: Compact disk (ensure WSL stopped, then Optimize-VHD with UAC elevation)
  setSimpleStep('compact', 'active');
  await window.wslCleaner.runWslCommand({ command: 'wsl --shutdown', taskId: 'simple' });
  const compactRes = await window.wslCleaner.optimizeVhdx({ vhdxPath, taskId: 'simple' });
  setSimpleStep('compact', compactRes.ok ? 'done' : 'failed');

  // Step 5: Restart WSL
  setSimpleStep('restart', 'active');
  await window.wslCleaner.runWslCommand({ command: `wsl -d ${state.distro} -- echo "WSL restarted"`, taskId: 'simple' });
  setSimpleStep('restart', 'done');

  // Measure after
  const afterResult = await window.wslCleaner.getFileSize(vhdxPath);
  const afterSize = afterResult.ok ? afterResult.size : 0;
  const saved = beforeSize - afterSize;

  // Show results
  simpleSizeBefore.textContent = formatBytes(beforeSize);
  simpleSizeAfter.textContent = formatBytes(afterSize);
  simpleSpaceSaved.textContent = saved > 0 ? formatBytes(saved) : '0 B (no change)';
  simpleResult.classList.remove('hidden');

  // Update displayed size
  simpleSize.textContent = formatBytes(afterSize);
  vhdxSizeEl.textContent = formatBytes(afterSize);

  state.isRunning = false;
  btnSimpleGo.disabled = false;
});

// ── About page ───────────────────────────────────────────────────────────────

btnCheckUpdates.addEventListener('click', () => {
  window.wslCleaner.openExternal('https://github.com/dbfx/wsl-cleaner/releases');
});

btnGitHub.addEventListener('click', () => {
  window.wslCleaner.openExternal('https://github.com/dbfx/wsl-cleaner');
});

// ── Initialization ───────────────────────────────────────────────────────────

async function init() {
  showScreen(loadingScreen);

  // Load app version for About page
  try {
    const version = await window.wslCleaner.getAppVersion();
    aboutVersion.textContent = `v${version}`;
  } catch { /* keep default */ }

  const wslCheck = await window.wslCleaner.checkWsl();

  if (!wslCheck.ok) {
    errorMessage.textContent = wslCheck.error;
    showScreen(errorScreen);
    return;
  }

  state.distro = wslCheck.defaultDistro;
  distroName.textContent = state.distro;
  statusText.textContent = `WSL 2 Ready — ${wslCheck.distros.length} distro(s) found`;

  // Detect tools
  state.tools = await window.wslCleaner.detectTools(state.distro);

  renderTasks();
  await loadVhdxInfo();

  // Restore last page from localStorage
  switchPage(state.currentPage);

  showScreen(mainScreen);
}

init();
