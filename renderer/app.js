// TASKS is loaded from tasks.js (included via <script> tag before this file)
// formatBytes, escapeHtml, estimateTotalSize are loaded from utils.js

// ── State ────────────────────────────────────────────────────────────────────

let state = {
  distros: [],            // full list from check-wsl: [{ name, state, isDefault }]
  selectedDistros: [],    // user-checked distro names
  toolsByDistro: {},      // { "Ubuntu": { npm: true, ... }, ... }
  vhdxByDistro: {},       // { "Ubuntu": [{ path, size }], ... }
  tools: {},              // merged tool availability across selected distros
  vhdxFiles: [],          // merged VHDX list across selected distros
  taskEnabled: {},
  isRunning: false,
  currentPage: localStorage.getItem('wsl-cleaner-page') || 'simple',
};

// Initialise toggles - all on by default, aggressive tasks off by default
TASKS.forEach(t => (state.taskEnabled[t.id] = !t.aggressive));

// ── DOM refs ─────────────────────────────────────────────────────────────────

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const errorScreen = $('#error-screen');
const loadingScreen = $('#loading-screen');
const mainScreen = $('#main-screen');
const errorMessage = $('#error-message');
const statusText = $('#status-text');
const distroPickerBtn = $('#distro-picker-btn');
const distroPickerLabel = $('#distro-picker-label');
const distroDropdown = $('#distro-dropdown');

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
const btnInstallUpdate = $('#btn-install-update');
const btnGitHub = $('#btn-github');
const updateStatusEl = $('#update-status');

// ── Window controls ──────────────────────────────────────────────────────────

$('#btn-minimize').addEventListener('click', () => window.wslCleaner.minimize());
$('#btn-maximize').addEventListener('click', () => window.wslCleaner.maximize());
$('#btn-close').addEventListener('click', () => window.wslCleaner.close());

// ── Helpers ──────────────────────────────────────────────────────────────────

// formatBytes is loaded from utils.js

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

// ── Distro picker ─────────────────────────────────────────────────────────────

function updatePickerLabel() {
  const sel = state.selectedDistros;
  if (sel.length === 0) {
    distroPickerLabel.textContent = 'No distro';
  } else if (sel.length === 1) {
    distroPickerLabel.textContent = sel[0];
  } else {
    distroPickerLabel.textContent = `${sel.length} distros selected`;
  }
}

function renderDistroPicker() {
  distroDropdown.innerHTML = '';
  for (const d of state.distros) {
    const item = document.createElement('label');
    item.className = 'distro-dropdown-item';
    const checked = state.selectedDistros.includes(d.name) ? 'checked' : '';
    const singleDistro = state.distros.length === 1;
    item.innerHTML = `
      <input type="checkbox" data-distro="${escapeHtml(d.name)}" ${checked} ${singleDistro ? 'disabled' : ''}>
      <span class="distro-item-name">${escapeHtml(d.name)}</span>
      ${d.isDefault ? '<span class="distro-item-default">default</span>' : ''}
      <span class="distro-item-state">${escapeHtml(d.state)}</span>
    `;
    const cb = item.querySelector('input');
    cb.addEventListener('change', () => {
      if (cb.checked) {
        if (!state.selectedDistros.includes(d.name)) {
          state.selectedDistros.push(d.name);
        }
      } else {
        // Prevent empty selection
        if (state.selectedDistros.length <= 1) {
          cb.checked = true;
          distroPickerBtn.classList.add('shake');
          setTimeout(() => distroPickerBtn.classList.remove('shake'), 400);
          return;
        }
        state.selectedDistros = state.selectedDistros.filter(n => n !== d.name);
      }
      updatePickerLabel();
      refreshDistroData();
    });
    distroDropdown.appendChild(item);
  }
  updatePickerLabel();
}

// Toggle dropdown open/close
distroPickerBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (state.isRunning) return;
  const isOpen = !distroDropdown.classList.contains('hidden');
  distroDropdown.classList.toggle('hidden', isOpen);
  distroPickerBtn.classList.toggle('open', !isOpen);
});

// Close dropdown when clicking outside
document.addEventListener('click', () => {
  distroDropdown.classList.add('hidden');
  distroPickerBtn.classList.remove('open');
});

// Prevent dropdown from closing when clicking inside it
distroDropdown.addEventListener('click', (e) => {
  e.stopPropagation();
});

async function refreshDistroData() {
  // Detect tools and VHDX for each selected distro
  state.toolsByDistro = {};
  state.vhdxByDistro = {};

  for (const distro of state.selectedDistros) {
    state.toolsByDistro[distro] = await window.wslCleaner.detectTools(distro);
    state.vhdxByDistro[distro] = await window.wslCleaner.findVhdx(distro);
  }

  // Merge tools: available if ANY selected distro has it
  const mergedTools = {};
  for (const distro of state.selectedDistros) {
    const dt = state.toolsByDistro[distro] || {};
    for (const [key, val] of Object.entries(dt)) {
      if (val) mergedTools[key] = true;
      else if (!(key in mergedTools)) mergedTools[key] = false;
    }
  }
  state.tools = mergedTools;

  // Merge VHDX files with distro annotation
  state.vhdxFiles = [];
  for (const distro of state.selectedDistros) {
    const files = state.vhdxByDistro[distro] || [];
    for (const f of files) {
      state.vhdxFiles.push({ ...f, distro });
    }
  }

  renderTasks();
  updateVhdxDisplay();
}

function updateVhdxDisplay() {
  if (state.vhdxFiles.length > 0) {
    if (state.vhdxFiles.length === 1) {
      vhdxPathEl.textContent = state.vhdxFiles[0].path;
      vhdxPathEl.title = state.vhdxFiles[0].path;
      vhdxSizeEl.textContent = formatBytes(state.vhdxFiles[0].size);
    } else {
      const totalSize = state.vhdxFiles.reduce((sum, f) => sum + f.size, 0);
      vhdxPathEl.textContent = `${state.vhdxFiles.length} virtual disks (${state.selectedDistros.join(', ')})`;
      vhdxPathEl.title = state.vhdxFiles.map(f => `${f.distro}: ${f.path}`).join('\n');
      vhdxSizeEl.textContent = formatBytes(totalSize);
    }
    const totalSize = state.vhdxFiles.reduce((sum, f) => sum + f.size, 0);
    simpleSize.textContent = formatBytes(totalSize);
  } else {
    vhdxPathEl.textContent = 'Not found';
    vhdxSizeEl.textContent = '--';
    simpleSize.textContent = '--';
  }
}

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
          ${task.aggressive ? '<span class="chip-aggressive">aggressive</span>' : ''}
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
  distroPickerBtn.disabled = true;
  logOutput.textContent = '';
  logPanel.classList.remove('hidden');

  for (const distro of state.selectedDistros) {
    const distroTools = state.toolsByDistro[distro] || {};

    if (state.selectedDistros.length > 1) {
      appendLog(`\n╔══════════════════════════════════════════════╗\n`);
      appendLog(`║  Cleaning: ${distro}\n`);
      appendLog(`╚══════════════════════════════════════════════╝\n`);
    }

    const enabledTasks = TASKS.filter(t => {
      const available = !t.requires || distroTools[t.requires];
      return available && state.taskEnabled[t.id];
    });

    for (const task of enabledTasks) {
      appendLog(`\n── ${task.name} ──────────────────────────────\n`);
      setTaskState(task.id, 'running');

      const result = await window.wslCleaner.runCleanup({
        distro,
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

    // Reset task card states before next distro
    if (state.selectedDistros.length > 1) {
      TASKS.forEach(t => setTaskState(t.id, null));
    }
  }

  appendLog('\n══ All tasks finished. ══\n');
  state.isRunning = false;
  btnRunCleanup.disabled = false;
  btnCompact.disabled = false;
  distroPickerBtn.disabled = false;
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

let staleDirs = []; // cached scan results: [{ path, size, distro }]

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

  // Group by distro for display
  const multiDistro = state.selectedDistros.length > 1;
  const grouped = {};
  for (const d of dirs) {
    const key = d.distro || state.selectedDistros[0];
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(d);
  }

  let html = '';
  for (const distro of state.selectedDistros) {
    const group = grouped[distro];
    if (!group || group.length === 0) continue;

    if (multiDistro) {
      html += `<div class="stale-distro-header">${escapeHtml(distro)}</div>`;
    }

    for (const d of group) {
      const i = dirs.indexOf(d);
      const lastSlash = d.path.lastIndexOf('/');
      const parentPath = d.path.substring(0, lastSlash + 1);
      const dirName = d.path.substring(lastSlash + 1);
      html += `
        <div class="stale-dir-item" data-index="${i}">
          <input type="checkbox" class="stale-cb" data-index="${i}" checked />
          <div class="stale-dir-path" title="${escapeHtml(d.path)}">
            ${escapeHtml(parentPath)}<span class="stale-dir-name">${escapeHtml(dirName)}</span>
          </div>
          <span class="stale-dir-size">${escapeHtml(d.size)}</span>
        </div>`;
    }
  }
  staleDirList.innerHTML = html;
}

// escapeHtml is loaded from utils.js

// estimateTotalSize is loaded from utils.js

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
  distroPickerBtn.disabled = true;
  const days = getStaleDays();
  btnScanStale.innerHTML = `<div class="task-spinner" style="width:18px;height:18px;border-width:2px;"></div> Scanning (${days} days)...`;
  staleResults.classList.add('hidden');
  staleDeleteResult.classList.add('hidden');

  try {
    const allResults = [];
    for (const distro of state.selectedDistros) {
      const results = await window.wslCleaner.scanStaleDirs({ distro, days });
      // Tag each result with its distro
      for (const r of results) {
        allResults.push({ ...r, distro });
      }
    }
    renderStaleDirs(allResults);
    staleResults.classList.remove('hidden');
  } catch (err) {
    staleScanSummary.innerHTML = `<span style="color: var(--danger);">Scan failed: ${escapeHtml(err.message || String(err))}</span>`;
    staleDirList.innerHTML = '';
    staleResults.classList.remove('hidden');
  }

  btnScanStale.disabled = false;
  distroPickerBtn.disabled = false;
  btnScanStale.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Scan for Stale Directories`;
  state.isRunning = false;
});

// Delete button
btnDeleteStale.addEventListener('click', async () => {
  if (state.isRunning) return;
  const checkedIndices = Array.from(staleDirList.querySelectorAll('.stale-cb:checked'))
    .map(cb => parseInt(cb.dataset.index));
  if (checkedIndices.length === 0) return;

  // Group checked paths by distro
  const byDistro = {};
  for (const i of checkedIndices) {
    const d = staleDirs[i];
    const distro = d.distro || state.selectedDistros[0];
    if (!byDistro[distro]) byDistro[distro] = [];
    byDistro[distro].push(d.path);
  }

  state.isRunning = true;
  btnDeleteStale.disabled = true;
  btnScanStale.disabled = true;
  distroPickerBtn.disabled = true;
  btnDeleteStale.innerHTML = `<div class="task-spinner" style="width:18px;height:18px;border-width:2px;"></div> Deleting ${checkedIndices.length} director${checkedIndices.length === 1 ? 'y' : 'ies'}...`;
  staleDeleteResult.classList.add('hidden');

  // Show log panel for output
  logPanel.classList.remove('hidden');
  appendLog(`\n── Deleting ${checkedIndices.length} stale director${checkedIndices.length === 1 ? 'y' : 'ies'} ──────────────────────────────\n`);

  try {
    const allResults = [];
    for (const [distro, paths] of Object.entries(byDistro)) {
      if (state.selectedDistros.length > 1) {
        appendLog(`\n  Distro: ${distro}\n`);
      }
      const results = await window.wslCleaner.deleteStaleDirs({
        distro,
        paths,
        taskId: 'stale-delete',
      });
      allResults.push(...results);
    }

    const successCount = allResults.filter(r => r.ok).length;
    const failCount = allResults.length - successCount;

    appendLog(`\n✓ Deleted ${successCount} of ${allResults.length} directories.${failCount > 0 ? ` ${failCount} failed.` : ''}\n`);

    staleDeleteSummary.textContent = `Successfully deleted ${successCount} of ${allResults.length} directories.${failCount > 0 ? ` ${failCount} failed.` : ''}`;
    staleDeleteResult.classList.remove('hidden');

    // Remove deleted items from the list
    const deletedPaths = new Set(allResults.filter(r => r.ok).map(r => r.path));
    const remaining = staleDirs.filter(d => !deletedPaths.has(d.path));
    renderStaleDirs(remaining);
  } catch (err) {
    appendLog(`\n✗ Deletion error: ${err.message || err}\n`);
  }

  btnDeleteStale.disabled = false;
  btnScanStale.disabled = false;
  distroPickerBtn.disabled = false;
  btnDeleteStale.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> Delete Selected`;
  state.isRunning = false;
});

// ── Disk compaction (Advanced) ───────────────────────────────────────────────

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
  distroPickerBtn.disabled = true;
  compactResult.classList.add('hidden');
  logOutput.textContent = '';
  logPanel.classList.remove('hidden');

  let totalBefore = 0;
  let totalAfter = 0;

  // Measure all VHDX sizes before
  appendLog('── Measuring disk sizes before compaction...\n');
  const beforeSizes = {};
  for (const vf of state.vhdxFiles) {
    const res = await window.wslCleaner.getFileSize(vf.path);
    const sz = res.ok ? res.size : 0;
    beforeSizes[vf.path] = sz;
    totalBefore += sz;
    if (state.vhdxFiles.length > 1) {
      appendLog(`   ${vf.distro}: ${formatBytes(sz)}\n`);
    } else {
      appendLog(`   Before: ${formatBytes(sz)}\n`);
    }
  }

  // Run fstrim on each selected distro
  appendLog('\n── Running filesystem TRIM...\n');
  const fstrimTask = TASKS.find(t => t.id === 'fstrim');
  for (const distro of state.selectedDistros) {
    const fstrimRes = await window.wslCleaner.runCleanup({
      distro,
      taskId: 'compact-fstrim',
      command: fstrimTask.command,
      asRoot: fstrimTask.asRoot,
    });
    if (state.selectedDistros.length > 1) {
      appendLog(`   ${distro}: ${fstrimRes.ok ? 'TRIM complete' : 'TRIM finished (fallback)'}.\n`);
    } else {
      appendLog(fstrimRes.ok ? '   TRIM complete.\n' : '   TRIM finished (may have used zero-fill fallback).\n');
    }
  }

  // Shutdown, update, shutdown (once for all distros)
  appendLog('\n── Shutting down WSL...\n');
  await window.wslCleaner.runWslCommand({ command: 'wsl --shutdown', taskId: 'compact' });
  appendLog('   WSL shut down.\n');

  appendLog('\n── Updating WSL...\n');
  await window.wslCleaner.runWslCommand({ command: 'wsl --update', taskId: 'compact' });
  appendLog('   WSL updated.\n');

  appendLog('\n── Ensuring WSL is fully stopped...\n');
  await window.wslCleaner.runWslCommand({ command: 'wsl --shutdown', taskId: 'compact' });
  appendLog('   WSL stopped.\n');

  // Compact each VHDX
  appendLog('\n── Compacting virtual disk(s) (Optimize-VHD)...\n');
  appendLog('   You may see a UAC elevation prompt.\n');
  for (const vf of state.vhdxFiles) {
    if (state.vhdxFiles.length > 1) {
      appendLog(`   Compacting ${vf.distro}...\n`);
    }
    const compactRes = await window.wslCleaner.optimizeVhdx({ vhdxPath: vf.path, taskId: 'compact' });
    if (compactRes.ok) {
      appendLog(`   ${state.vhdxFiles.length > 1 ? vf.distro + ': ' : ''}Compaction finished.\n`);
    } else {
      appendLog(`   ${state.vhdxFiles.length > 1 ? vf.distro + ': ' : ''}Compaction issue: ${compactRes.output}\n`);
    }
  }

  // Restart each selected distro
  appendLog('\n── Restarting WSL...\n');
  for (const distro of state.selectedDistros) {
    await window.wslCleaner.runWslCommand({ command: `wsl -d ${distro} -- echo "WSL restarted"`, taskId: 'compact' });
  }
  appendLog('   WSL is running.\n');

  // Measure after
  appendLog('\n── Measuring disk sizes after compaction...\n');
  for (const vf of state.vhdxFiles) {
    const res = await window.wslCleaner.getFileSize(vf.path);
    const sz = res.ok ? res.size : 0;
    totalAfter += sz;
    if (state.vhdxFiles.length > 1) {
      appendLog(`   ${vf.distro}: ${formatBytes(sz)}\n`);
    } else {
      appendLog(`   After: ${formatBytes(sz)}\n`);
    }
  }

  const saved = totalBefore - totalAfter;
  appendLog(`\n══ Space saved: ${formatBytes(Math.max(0, saved))} ══\n`);

  sizeBefore.textContent = formatBytes(totalBefore);
  sizeAfter.textContent = formatBytes(totalAfter);
  spaceSaved.textContent = saved > 0 ? formatBytes(saved) : '0 B (no change)';
  compactResult.classList.remove('hidden');

  // Update displayed sizes
  updateVhdxDisplay();

  state.isRunning = false;
  btnCompact.disabled = false;
  btnRunCleanup.disabled = false;
  distroPickerBtn.disabled = false;
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
  distroPickerBtn.disabled = true;
  simpleResult.classList.add('hidden');
  simpleSteps.classList.remove('hidden');
  resetSimpleSteps();

  // Measure total VHDX size before
  let totalBefore = 0;
  for (const vf of state.vhdxFiles) {
    const res = await window.wslCleaner.getFileSize(vf.path);
    totalBefore += res.ok ? res.size : 0;
  }

  // Step 1: Scan & remove stale directories on each distro
  setSimpleStep('stale', 'active');
  for (const distro of state.selectedDistros) {
    let stalePaths = [];
    try {
      const staleDirsFound = await window.wslCleaner.scanStaleDirs({ distro, days: 30 });
      stalePaths = staleDirsFound.map(d => d.path);
    } catch { /* scan failed, continue anyway */ }

    if (stalePaths.length > 0) {
      try {
        await window.wslCleaner.deleteStaleDirs({
          distro,
          paths: stalePaths,
          taskId: 'simple-stale',
        });
      } catch { /* ignore deletion errors */ }
    }
  }
  setSimpleStep('stale', 'done');

  // Step 2: Run cleanup tasks on each distro
  setSimpleStep('cleanup', 'active');
  let cleanupOk = true;
  for (const distro of state.selectedDistros) {
    const distroTools = state.toolsByDistro[distro] || {};
    const availableTasks = TASKS.filter(t => !t.aggressive && t.id !== 'fstrim' && (!t.requires || distroTools[t.requires]));
    for (const task of availableTasks) {
      const result = await window.wslCleaner.runCleanup({
        distro,
        taskId: task.id,
        command: task.command,
        asRoot: task.asRoot,
      });
      if (!result.ok) cleanupOk = false;
    }
  }
  setSimpleStep('cleanup', cleanupOk ? 'done' : 'failed');

  // Step 3: Filesystem TRIM on each distro
  setSimpleStep('fstrim', 'active');
  const fstrimTask = TASKS.find(t => t.id === 'fstrim');
  let fstrimOk = true;
  for (const distro of state.selectedDistros) {
    const fstrimResult = await window.wslCleaner.runCleanup({
      distro,
      taskId: 'fstrim',
      command: fstrimTask.command,
      asRoot: fstrimTask.asRoot,
    });
    if (!fstrimResult.ok) fstrimOk = false;
  }
  setSimpleStep('fstrim', fstrimOk ? 'done' : 'failed');

  // Step 4: Shutdown WSL (once for all distros)
  setSimpleStep('shutdown', 'active');
  await window.wslCleaner.runWslCommand({ command: 'wsl --shutdown', taskId: 'simple' });
  setSimpleStep('shutdown', 'done');

  // Step 5: Update WSL
  setSimpleStep('update', 'active');
  await window.wslCleaner.runWslCommand({ command: 'wsl --update', taskId: 'simple' });
  setSimpleStep('update', 'done');

  // Step 6: Compact all VHDX files
  setSimpleStep('compact', 'active');
  await window.wslCleaner.runWslCommand({ command: 'wsl --shutdown', taskId: 'simple' });
  let compactOk = true;
  for (const vf of state.vhdxFiles) {
    const compactRes = await window.wslCleaner.optimizeVhdx({ vhdxPath: vf.path, taskId: 'simple' });
    if (!compactRes.ok) compactOk = false;
  }
  setSimpleStep('compact', compactOk ? 'done' : 'failed');

  // Step 7: Restart each selected distro
  setSimpleStep('restart', 'active');
  for (const distro of state.selectedDistros) {
    await window.wslCleaner.runWslCommand({ command: `wsl -d ${distro} -- echo "WSL restarted"`, taskId: 'simple' });
  }
  setSimpleStep('restart', 'done');

  // Measure total VHDX size after
  let totalAfter = 0;
  for (const vf of state.vhdxFiles) {
    const res = await window.wslCleaner.getFileSize(vf.path);
    totalAfter += res.ok ? res.size : 0;
  }
  const saved = totalBefore - totalAfter;

  // Show results
  simpleSizeBefore.textContent = formatBytes(totalBefore);
  simpleSizeAfter.textContent = formatBytes(totalAfter);
  simpleSpaceSaved.textContent = saved > 0 ? formatBytes(saved) : '0 B (no change)';
  simpleResult.classList.remove('hidden');

  // Update displayed sizes
  updateVhdxDisplay();

  state.isRunning = false;
  btnSimpleGo.disabled = false;
  distroPickerBtn.disabled = false;
});

// ── About page ───────────────────────────────────────────────────────────────

function setUpdateStatus(html, className) {
  updateStatusEl.innerHTML = html;
  updateStatusEl.className = 'update-status' + (className ? ' ' + className : '');
  updateStatusEl.classList.remove('hidden');
}

// Listen for update events from main process
window.wslCleaner.onUpdateStatus((data) => {
  switch (data.status) {
    case 'checking':
      setUpdateStatus(
        `<div class="update-spinner"></div> Checking for updates...`,
        'update-checking'
      );
      btnCheckUpdates.disabled = true;
      break;

    case 'available':
      setUpdateStatus(
        `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Update v${escapeHtml(data.version)} available. Downloading...`,
        'update-available'
      );
      btnCheckUpdates.disabled = true;
      break;

    case 'downloading':
      setUpdateStatus(
        `<div class="update-progress-wrap"><div class="update-progress-bar" style="width:${data.percent}%"></div></div> Downloading update... ${data.percent}%`,
        'update-downloading'
      );
      btnCheckUpdates.disabled = true;
      break;

    case 'downloaded':
      setUpdateStatus(
        `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2.5"><polyline points="20,6 9,17 4,12"/></svg> Update v${escapeHtml(data.version)} ready to install.`,
        'update-downloaded'
      );
      btnCheckUpdates.classList.add('hidden');
      btnInstallUpdate.classList.remove('hidden');
      break;

    case 'up-to-date':
      setUpdateStatus(
        `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2.5"><polyline points="20,6 9,17 4,12"/></svg> You're on the latest version.`,
        'update-uptodate'
      );
      btnCheckUpdates.disabled = false;
      break;

    case 'error':
      setUpdateStatus(
        `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> Update check failed.`,
        'update-error'
      );
      btnCheckUpdates.disabled = false;
      break;
  }
});

btnCheckUpdates.addEventListener('click', async () => {
  btnCheckUpdates.disabled = true;
  setUpdateStatus(
    `<div class="update-spinner"></div> Checking for updates...`,
    'update-checking'
  );
  await window.wslCleaner.checkForUpdates();
});

btnInstallUpdate.addEventListener('click', () => {
  window.wslCleaner.installUpdate();
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

  state.distros = wslCheck.distros;
  state.selectedDistros = [wslCheck.defaultDistro];
  statusText.textContent = `WSL 2 Ready — ${wslCheck.distros.length} distro(s) found`;

  renderDistroPicker();
  await refreshDistroData();

  // Restore last page from localStorage
  switchPage(state.currentPage);

  showScreen(mainScreen);
}

init();
