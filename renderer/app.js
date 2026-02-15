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

/**
 * Persist the current task toggle states to disk via IPC.
 * Called whenever the user enables or disables a task.
 */
function saveTaskPreferences() {
  window.wslCleaner.saveTaskPreferences({ ...state.taskEnabled });
}

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
const simpleCleanOnlyCb = $('#simple-clean-only-cb');

// Aggressive confirmation modal
const aggressiveModal = $('#aggressive-modal');
const aggressiveModalList = $('#aggressive-modal-list');
const aggressiveModalCancel = $('#aggressive-modal-cancel');
const aggressiveModalProceed = $('#aggressive-modal-proceed');

// Size estimation (Advanced)
const btnEstimateSizes = $('#btn-estimate-sizes');
const estimateSummary = $('#estimate-summary');
const estimateTotal = $('#estimate-total');

// Size estimation (Simple)
const simpleEstimate = $('#simple-estimate');
const btnSimpleEstimate = $('#btn-simple-estimate');
const simpleEstimateResult = $('#simple-estimate-result');
const simpleEstimateTotal = $('#simple-estimate-total');

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

  // Refresh stats when navigating to the stats page
  if (pageName === 'stats') renderStatsPage();
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
  clearEstimates();
  // Show the simple estimate button now that distros are loaded
  simpleEstimate.classList.remove('hidden');
  simpleEstimateResult.classList.add('hidden');
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
      <span class="task-size-badge hidden" data-size-task="${task.id}"></span>
      <div class="task-status-slot"></div>
    `;

    card.addEventListener('click', () => {
      if (!available || state.isRunning) return;
      const cb = card.querySelector('input[type="checkbox"]');
      cb.checked = !cb.checked;
      state.taskEnabled[task.id] = cb.checked;
      saveTaskPreferences();
    });

    const cb = card.querySelector('input[type="checkbox"]');
    cb.addEventListener('change', (e) => {
      state.taskEnabled[task.id] = e.target.checked;
      saveTaskPreferences();
    });

    taskCardsEl.appendChild(card);
  }
}

// ── Size estimation ──────────────────────────────────────────────────────

/**
 * Run size estimates for all enabled tasks across all selected distros.
 * Updates task card badges and the summary total.
 * @returns {Promise<Object<string, string>>} merged size map
 */
async function runEstimates() {
  // Gather tasks that have estimate commands and are enabled + available
  const mergedSizes = {};

  for (const distro of state.selectedDistros) {
    const distroTools = state.toolsByDistro[distro] || {};
    const estimatable = TASKS.filter(t => {
      const available = !t.requires || distroTools[t.requires];
      return available && t.estimateCommand && state.taskEnabled[t.id];
    }).map(t => ({ taskId: t.id, estimateCommand: t.estimateCommand }));

    if (estimatable.length === 0) continue;

    const sizes = await window.wslCleaner.estimateTaskSizes({ distro, tasks: estimatable });
    // Merge: keep the larger value if multiple distros report for the same task
    for (const [id, val] of Object.entries(sizes)) {
      if (!mergedSizes[id]) {
        mergedSizes[id] = val;
      } else {
        // Sum sizes from multiple distros by parsing to bytes and adding
        const prev = parseSizeToBytes(mergedSizes[id]);
        const curr = parseSizeToBytes(val);
        mergedSizes[id] = formatBytes(prev + curr);
      }
    }
  }

  return mergedSizes;
}

/**
 * Parse a human-readable size string (e.g. "120M", "4.5G", "12K") to bytes.
 */
function parseSizeToBytes(sizeStr) {
  if (!sizeStr) return 0;
  const match = sizeStr.match(/^([\d.]+)\s*([KMGT])?i?B?$/i);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  const unit = (match[2] || '').toUpperCase();
  const multipliers = { K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4 };
  return num * (multipliers[unit] || 1);
}

/**
 * Update size badges on task cards and the summary total from a sizes map.
 */
function displayEstimates(sizes) {
  // Update per-task badges
  let totalBytes = 0;
  let taskCount = 0;
  for (const task of TASKS) {
    const badge = document.querySelector(`.task-size-badge[data-size-task="${task.id}"]`);
    if (!badge) continue;
    const val = sizes[task.id];
    if (val) {
      badge.textContent = '~' + val;
      badge.classList.remove('hidden');
      totalBytes += parseSizeToBytes(val);
      taskCount++;
    } else {
      badge.textContent = '';
      badge.classList.add('hidden');
    }
  }

  // Update summary
  if (taskCount > 0) {
    estimateTotal.textContent = '~' + formatBytes(totalBytes);
    estimateSummary.classList.remove('hidden');
  } else {
    estimateSummary.classList.add('hidden');
  }

  return { totalBytes, taskCount };
}

/**
 * Clear all size estimate badges and hide the summary.
 */
function clearEstimates() {
  document.querySelectorAll('.task-size-badge').forEach(b => {
    b.textContent = '';
    b.classList.add('hidden');
  });
  estimateSummary.classList.add('hidden');
}

// ── Estimate Sizes button (Advanced) ─────────────────────────────────────

btnEstimateSizes.addEventListener('click', async () => {
  if (state.isRunning) return;
  state.isRunning = true;
  btnEstimateSizes.disabled = true;
  btnRunCleanup.disabled = true;
  distroPickerBtn.disabled = true;
  clearEstimates();

  btnEstimateSizes.innerHTML = `<div class="task-spinner" style="width:18px;height:18px;border-width:2px;"></div> Estimating...`;

  try {
    const sizes = await runEstimates();
    displayEstimates(sizes);
  } catch (err) {
    appendLog(`\nEstimation error: ${err.message || err}\n`);
  }

  btnEstimateSizes.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Estimate Sizes`;
  btnEstimateSizes.disabled = false;
  btnRunCleanup.disabled = false;
  distroPickerBtn.disabled = false;
  state.isRunning = false;
});

// ── Estimate Sizes button (Simple) ───────────────────────────────────────

btnSimpleEstimate.addEventListener('click', async () => {
  if (state.isRunning) return;
  state.isRunning = true;
  btnSimpleEstimate.disabled = true;
  btnSimpleGo.disabled = true;
  distroPickerBtn.disabled = true;
  simpleEstimateResult.classList.add('hidden');

  btnSimpleEstimate.innerHTML = `<div class="task-spinner" style="width:16px;height:16px;border-width:2px;"></div> Estimating...`;

  try {
    const sizes = await runEstimates();
    // Calculate total for Simple mode
    let totalBytes = 0;
    for (const task of TASKS) {
      if (task.aggressive || task.id === 'fstrim') continue; // Simple mode skips aggressive + fstrim
      if (sizes[task.id]) {
        totalBytes += parseSizeToBytes(sizes[task.id]);
      }
    }
    if (totalBytes > 0) {
      simpleEstimateTotal.textContent = '~' + formatBytes(totalBytes);
    } else {
      simpleEstimateTotal.textContent = 'negligible';
    }
    simpleEstimateResult.classList.remove('hidden');
  } catch {
    simpleEstimateTotal.textContent = 'unavailable';
    simpleEstimateResult.classList.remove('hidden');
  }

  btnSimpleEstimate.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Estimate Reclaimable Space`;
  btnSimpleEstimate.disabled = false;
  btnSimpleGo.disabled = false;
  distroPickerBtn.disabled = false;
  state.isRunning = false;
});

// ── Streaming output listener ────────────────────────────────────────────────

window.wslCleaner.onTaskOutput(({ taskId, text }) => {
  appendLog(text);
});

// ── Aggressive task confirmation ─────────────────────────────────────────────

function getEnabledAggressiveTasks() {
  return TASKS.filter(t => {
    if (!t.aggressive) return false;
    if (!state.taskEnabled[t.id]) return false;
    const available = !t.requires || state.tools[t.requires];
    return available;
  });
}

function stripHtml(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}

function showAggressiveConfirmation(aggressiveTasks) {
  return new Promise((resolve) => {
    // Build the task list
    aggressiveModalList.innerHTML = aggressiveTasks.map(t => `
      <div class="modal-task-item">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <div class="modal-task-item-info">
          <div class="modal-task-item-name">${escapeHtml(stripHtml(t.name))}</div>
          <div class="modal-task-item-desc">${t.desc}</div>
        </div>
      </div>
    `).join('');

    aggressiveModal.classList.remove('hidden');

    function cleanup() {
      aggressiveModalCancel.removeEventListener('click', onCancel);
      aggressiveModalProceed.removeEventListener('click', onProceed);
      aggressiveModal.removeEventListener('click', onOverlay);
      document.removeEventListener('keydown', onEscape);
      aggressiveModal.classList.add('hidden');
    }

    function onCancel() { cleanup(); resolve(false); }
    function onProceed() { cleanup(); resolve(true); }
    function onOverlay(e) { if (e.target === aggressiveModal) { cleanup(); resolve(false); } }
    function onEscape(e) { if (e.key === 'Escape') { cleanup(); resolve(false); } }

    aggressiveModalCancel.addEventListener('click', onCancel);
    aggressiveModalProceed.addEventListener('click', onProceed);
    aggressiveModal.addEventListener('click', onOverlay);
    document.addEventListener('keydown', onEscape);
  });
}

// ── Run cleanup (Advanced) ───────────────────────────────────────────────────

btnRunCleanup.addEventListener('click', async () => {
  if (state.isRunning) return;

  // Check for aggressive tasks and prompt confirmation
  const aggressiveTasks = getEnabledAggressiveTasks();
  if (aggressiveTasks.length > 0) {
    const confirmed = await showAggressiveConfirmation(aggressiveTasks);
    if (!confirmed) return;
  }

  state.isRunning = true;
  btnRunCleanup.disabled = true;
  btnEstimateSizes.disabled = true;
  btnCompact.disabled = true;
  distroPickerBtn.disabled = true;
  clearEstimates();
  logOutput.textContent = '';
  logPanel.classList.remove('hidden');

  const cleanupStart = Date.now();
  let totalRun = 0, totalOk = 0, totalFail = 0;

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
      totalRun++;

      const result = await window.wslCleaner.runCleanup({
        distro,
        taskId: task.id,
        command: task.command,
        asRoot: task.asRoot,
      });

      if (result.ok) {
        setTaskState(task.id, 'completed');
        appendLog(`\n✓ ${task.name} completed.\n`);
        totalOk++;
      } else {
        setTaskState(task.id, 'failed');
        const hint = exitCodeHint(result.code);
        const detail = hint ? ` — ${hint}` : '';
        appendLog(`\n✗ ${task.name} failed (exit code ${result.code}${detail}).\n`);
        totalFail++;
      }
    }

    // Reset task card states before next distro
    if (state.selectedDistros.length > 1) {
      TASKS.forEach(t => setTaskState(t.id, null));
    }
  }

  appendLog('\n══ All tasks finished. ══\n');

  // Save cleanup session to history
  await window.wslCleaner.saveCleanupSession({
    type: 'cleanup',
    distros: [...state.selectedDistros],
    tasksRun: totalRun,
    tasksSucceeded: totalOk,
    tasksFailed: totalFail,
    durationMs: Date.now() - cleanupStart,
  });

  state.isRunning = false;
  btnRunCleanup.disabled = false;
  btnEstimateSizes.disabled = false;
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

  const staleStart = Date.now();

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

    // Save stale delete session to history
    await window.wslCleaner.saveCleanupSession({
      type: 'stale_delete',
      distros: [...state.selectedDistros],
      staleDirsFound: checkedIndices.length,
      staleDirsDeleted: successCount,
      durationMs: Date.now() - staleStart,
    });
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
    appendLog('\n✗ No VHDX file found. Cannot compact. The virtual disk may be in a non-standard location.\n');
    logPanel.classList.remove('hidden');
    return;
  }

  state.isRunning = true;
  btnCompact.disabled = true;
  btnRunCleanup.disabled = true;
  btnEstimateSizes.disabled = true;
  distroPickerBtn.disabled = true;
  compactResult.classList.add('hidden');
  logOutput.textContent = '';
  logPanel.classList.remove('hidden');

  const compactStart = Date.now();
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
      appendLog(`   ${state.vhdxFiles.length > 1 ? vf.distro + ': ' : ''}Compaction did not complete successfully. ${compactRes.output}\n`);
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

  // Save compact session to history
  await window.wslCleaner.saveCleanupSession({
    type: 'compact',
    distros: [...state.selectedDistros],
    vhdxSizeBefore: totalBefore,
    vhdxSizeAfter: totalAfter,
    spaceSaved: Math.max(0, saved),
    durationMs: Date.now() - compactStart,
  });

  state.isRunning = false;
  btnCompact.disabled = false;
  btnRunCleanup.disabled = false;
  btnEstimateSizes.disabled = false;
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

/** Show/hide step items that only apply to the full (non-clean-only) flow. */
const compactOnlySteps = ['shutdown', 'update', 'compact', 'restart'];

function applyCleanOnlyVisibility(cleanOnly) {
  compactOnlySteps.forEach(step => {
    const item = simpleSteps.querySelector(`.step-item[data-step="${step}"]`);
    if (item) item.style.display = cleanOnly ? 'none' : '';
  });
}

// Toggle button label and step visibility when "Clean only" changes
const btnSimpleGoLabel = $('#btn-simple-go-label');

simpleCleanOnlyCb.addEventListener('change', () => {
  const cleanOnly = simpleCleanOnlyCb.checked;
  btnSimpleGoLabel.textContent = cleanOnly ? 'Clean' : 'Clean & Compact';
  applyCleanOnlyVisibility(cleanOnly);
});

// ── Simple mode: Clean & Compact ─────────────────────────────────────────────

btnSimpleGo.addEventListener('click', async () => {
  if (state.isRunning) return;
  if (state.vhdxFiles.length === 0) return;

  const cleanOnly = simpleCleanOnlyCb.checked;

  state.isRunning = true;
  btnSimpleGo.disabled = true;
  simpleCleanOnlyCb.disabled = true;
  distroPickerBtn.disabled = true;
  simpleResult.classList.add('hidden');
  simpleSteps.classList.remove('hidden');
  resetSimpleSteps();
  applyCleanOnlyVisibility(cleanOnly);

  // Hide the disclaimer and button once cleanup starts
  const disclaimer = document.querySelector('.simple-disclaimer');
  if (disclaimer) disclaimer.classList.add('hidden');
  btnSimpleGo.classList.add('hidden');
  document.querySelector('.simple-mode-toggle').classList.add('hidden');

  const simpleStart = Date.now();
  let simpleTotalRun = 0, simpleTotalOk = 0, simpleTotalFail = 0;
  let simpleStaleFound = 0, simpleStaleDeleted = 0;

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
      simpleStaleFound += stalePaths.length;
    } catch { /* scan failed, continue anyway */ }

    if (stalePaths.length > 0) {
      try {
        const delResults = await window.wslCleaner.deleteStaleDirs({
          distro,
          paths: stalePaths,
          taskId: 'simple-stale',
        });
        simpleStaleDeleted += delResults.filter(r => r.ok).length;
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
      simpleTotalRun++;
      const result = await window.wslCleaner.runCleanup({
        distro,
        taskId: task.id,
        command: task.command,
        asRoot: task.asRoot,
      });
      if (result.ok) {
        simpleTotalOk++;
      } else {
        simpleTotalFail++;
        cleanupOk = false;
      }
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

  // Steps 4-7 only run when NOT in "clean only" mode
  if (!cleanOnly) {
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
  }

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

  // Save simple session to history
  await window.wslCleaner.saveCleanupSession({
    type: cleanOnly ? 'simple-clean-only' : 'simple',
    distros: [...state.selectedDistros],
    vhdxSizeBefore: totalBefore,
    vhdxSizeAfter: totalAfter,
    spaceSaved: Math.max(0, saved),
    tasksRun: simpleTotalRun,
    tasksSucceeded: simpleTotalOk,
    tasksFailed: simpleTotalFail,
    staleDirsFound: simpleStaleFound,
    staleDirsDeleted: simpleStaleDeleted,
    durationMs: Date.now() - simpleStart,
  });

  state.isRunning = false;
  btnSimpleGo.disabled = false;
  simpleCleanOnlyCb.disabled = false;
  btnSimpleGo.classList.remove('hidden');
  document.querySelector('.simple-mode-toggle').classList.remove('hidden');
  distroPickerBtn.disabled = false;
});

// ── Stats page ───────────────────────────────────────────────────────────────

const statTotalSaved = $('#stat-total-saved');
const statTotalCleanups = $('#stat-total-cleanups');
const statAvgSaved = $('#stat-avg-saved');
const statLastCleanup = $('#stat-last-cleanup');
const historyList = $('#history-list');
const historyEmpty = $('#history-empty');
const btnClearHistory = $('#btn-clear-history');
const chartDiskEmpty = $('#chart-disk-empty');
const chartSavedEmpty = $('#chart-saved-empty');

let diskSizeChart = null;
let spaceSavedChart = null;

function formatDuration(ms) {
  if (!ms || ms <= 0) return '--';
  if (ms < 1000) return `${ms}ms`;
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  return rem > 0 ? `${mins}m ${rem}s` : `${mins}m`;
}

function formatRelativeDate(isoString) {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? 's' : ''} ago`;
  return date.toLocaleDateString();
}

function typeLabel(type) {
  const map = { simple: 'Simple', cleanup: 'Cleanup', compact: 'Compact', stale_delete: 'Stale' };
  return map[type] || type;
}

const chartColors = {
  accent: '#00d4aa',
  accentDim: 'rgba(0, 212, 170, 0.15)',
  border: '#2a2a45',
  text: '#8888a8',
  textMuted: '#55556a',
  gridLine: 'rgba(42, 42, 69, 0.6)',
  barGradientTop: '#00d4aa',
  barGradientBottom: '#006b55',
};

function createChartDefaults() {
  Chart.defaults.color = chartColors.text;
  Chart.defaults.font.family = "'Segoe UI', system-ui, -apple-system, sans-serif";
  Chart.defaults.font.size = 11;
}

function buildDiskSizeChart(history) {
  const canvas = $('#chart-disk-size');
  const ctx = canvas.getContext('2d');

  // Filter records that have VHDX size data (compaction events)
  const records = history.filter(r => r.vhdxSizeBefore != null || r.vhdxSizeAfter != null);

  if (records.length === 0) {
    canvas.parentElement.style.display = 'none';
    chartDiskEmpty.classList.remove('hidden');
    if (diskSizeChart) { diskSizeChart.destroy(); diskSizeChart = null; }
    return;
  }

  canvas.parentElement.style.display = '';
  chartDiskEmpty.classList.add('hidden');

  // Build data points: show before and after as connected points
  const labels = [];
  const beforeData = [];
  const afterData = [];
  for (const r of records) {
    const d = new Date(r.timestamp);
    const label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    labels.push(label);
    beforeData.push(r.vhdxSizeBefore ? +(r.vhdxSizeBefore / (1024 * 1024 * 1024)).toFixed(2) : null);
    afterData.push(r.vhdxSizeAfter ? +(r.vhdxSizeAfter / (1024 * 1024 * 1024)).toFixed(2) : null);
  }

  if (diskSizeChart) diskSizeChart.destroy();

  diskSizeChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Before',
          data: beforeData,
          borderColor: '#ff7675',
          backgroundColor: 'rgba(255, 118, 117, 0.1)',
          borderWidth: 2,
          pointRadius: 4,
          pointBackgroundColor: '#ff7675',
          tension: 0.3,
          fill: false,
        },
        {
          label: 'After',
          data: afterData,
          borderColor: chartColors.accent,
          backgroundColor: chartColors.accentDim,
          borderWidth: 2,
          pointRadius: 4,
          pointBackgroundColor: chartColors.accent,
          tension: 0.3,
          fill: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          align: 'end',
          labels: { boxWidth: 12, padding: 16, usePointStyle: true },
        },
        tooltip: {
          backgroundColor: '#1c1c30',
          borderColor: '#2a2a45',
          borderWidth: 1,
          titleColor: '#e8e8f0',
          bodyColor: '#8888a8',
          padding: 12,
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y != null ? ctx.parsed.y.toFixed(2) + ' GB' : 'N/A'}`,
          },
        },
      },
      scales: {
        x: {
          grid: { color: chartColors.gridLine, drawBorder: false },
          ticks: { color: chartColors.textMuted },
        },
        y: {
          grid: { color: chartColors.gridLine, drawBorder: false },
          ticks: {
            color: chartColors.textMuted,
            callback: (val) => val.toFixed(1) + ' GB',
          },
        },
      },
    },
  });
}

function buildSpaceSavedChart(history) {
  const canvas = $('#chart-space-saved');
  const ctx = canvas.getContext('2d');

  const records = history.filter(r => r.spaceSaved != null && r.spaceSaved > 0);

  if (records.length === 0) {
    canvas.parentElement.style.display = 'none';
    chartSavedEmpty.classList.remove('hidden');
    if (spaceSavedChart) { spaceSavedChart.destroy(); spaceSavedChart = null; }
    return;
  }

  canvas.parentElement.style.display = '';
  chartSavedEmpty.classList.add('hidden');

  const labels = records.map(r => {
    const d = new Date(r.timestamp);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  });
  const data = records.map(r => +(r.spaceSaved / (1024 * 1024)).toFixed(1));

  if (spaceSavedChart) spaceSavedChart.destroy();

  // Create gradient
  const gradient = ctx.createLinearGradient(0, 0, 0, 240);
  gradient.addColorStop(0, 'rgba(0, 212, 170, 0.7)');
  gradient.addColorStop(1, 'rgba(0, 212, 170, 0.1)');

  spaceSavedChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Space Saved',
        data,
        backgroundColor: gradient,
        borderColor: chartColors.accent,
        borderWidth: 1,
        borderRadius: 4,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1c1c30',
          borderColor: '#2a2a45',
          borderWidth: 1,
          titleColor: '#e8e8f0',
          bodyColor: '#8888a8',
          padding: 12,
          callbacks: {
            label: (ctx) => {
              const mb = ctx.parsed.y;
              return mb >= 1024 ? `Saved: ${(mb / 1024).toFixed(2)} GB` : `Saved: ${mb.toFixed(1)} MB`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: chartColors.textMuted },
        },
        y: {
          grid: { color: chartColors.gridLine, drawBorder: false },
          ticks: {
            color: chartColors.textMuted,
            callback: (val) => val >= 1024 ? (val / 1024).toFixed(1) + ' GB' : val + ' MB',
          },
        },
      },
    },
  });
}

function renderHistoryList(history) {
  if (history.length === 0) {
    historyEmpty.classList.remove('hidden');
    historyList.innerHTML = '';
    historyList.appendChild(historyEmpty);
    return;
  }

  historyEmpty.classList.add('hidden');
  // Show most recent first
  const sorted = [...history].reverse();

  let html = '';
  for (const r of sorted) {
    const date = new Date(r.timestamp);
    const dateMain = date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    const dateTime = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

    let detailsHtml = '';

    if (r.spaceSaved != null && r.spaceSaved > 0) {
      detailsHtml += `<span class="history-detail"><span class="accent">${formatBytes(r.spaceSaved)}</span> saved</span>`;
    }
    if (r.vhdxSizeBefore != null && r.vhdxSizeAfter != null) {
      detailsHtml += `<span class="history-detail"><strong>${formatBytes(r.vhdxSizeBefore)}</strong> &rarr; <strong>${formatBytes(r.vhdxSizeAfter)}</strong></span>`;
    }
    if (r.tasksRun != null && r.tasksRun > 0) {
      detailsHtml += `<span class="history-detail">${r.tasksSucceeded || 0}/${r.tasksRun} tasks</span>`;
    }
    if (r.staleDirsDeleted != null && r.staleDirsDeleted > 0) {
      detailsHtml += `<span class="history-detail">${r.staleDirsDeleted} dirs removed</span>`;
    }
    if (!detailsHtml) {
      detailsHtml = `<span class="history-detail" style="color:var(--text-muted)">No size data</span>`;
    }

    html += `
      <div class="history-item fade-in">
        <div class="history-date">
          <div class="history-date-main">${escapeHtml(dateMain)}</div>
          <div class="history-date-time">${escapeHtml(dateTime)}</div>
        </div>
        <span class="history-type type-${escapeHtml(r.type)}">${typeLabel(r.type)}</span>
        <div class="history-details">${detailsHtml}</div>
        <span class="history-distros" title="${escapeHtml((r.distros || []).join(', '))}">${escapeHtml((r.distros || []).join(', '))}</span>
        <span class="history-duration">${formatDuration(r.durationMs)}</span>
      </div>`;
  }
  historyList.innerHTML = html;
}

function updateSummaryCards(history) {
  // Total space saved
  const totalSaved = history.reduce((sum, r) => sum + (r.spaceSaved > 0 ? r.spaceSaved : 0), 0);
  statTotalSaved.textContent = totalSaved > 0 ? formatBytes(totalSaved) : '--';

  // Total cleanups
  statTotalCleanups.textContent = history.length;

  // Average savings (only from sessions that saved space)
  const withSavings = history.filter(r => r.spaceSaved > 0);
  if (withSavings.length > 0) {
    const avg = withSavings.reduce((s, r) => s + r.spaceSaved, 0) / withSavings.length;
    statAvgSaved.textContent = formatBytes(avg);
  } else {
    statAvgSaved.textContent = '--';
  }

  // Last cleanup
  if (history.length > 0) {
    const last = history[history.length - 1];
    statLastCleanup.textContent = formatRelativeDate(last.timestamp);
  } else {
    statLastCleanup.textContent = 'Never';
  }
}

async function renderStatsPage() {
  createChartDefaults();
  const history = await window.wslCleaner.getCleanupHistory();

  updateSummaryCards(history);
  buildDiskSizeChart(history);
  buildSpaceSavedChart(history);
  renderHistoryList(history);
}

btnClearHistory.addEventListener('click', async () => {
  await window.wslCleaner.clearCleanupHistory();
  renderStatsPage();
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

  // Restore saved task preferences (overlay on top of defaults)
  try {
    const savedPrefs = await window.wslCleaner.getTaskPreferences();
    for (const [taskId, enabled] of Object.entries(savedPrefs)) {
      if (taskId in state.taskEnabled) {
        state.taskEnabled[taskId] = enabled;
      }
    }
  } catch { /* use defaults if preferences can't be loaded */ }

  renderDistroPicker();
  await refreshDistroData();

  // Restore last page from localStorage
  switchPage(state.currentPage);

  showScreen(mainScreen);
}

init();
