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
  staleEnabled: true,     // whether stale directory cleanup is enabled
  staleDays: 30,          // stale directory age threshold in days
  compactEnabled: true,   // whether disk compaction runs after cleaning
  isRunning: false,
  currentPage: localStorage.getItem('wsl-cleaner-page') || 'cleaner',
};

// Migrate old localStorage page values to new names
(function migratePageName() {
  const saved = localStorage.getItem('wsl-cleaner-page');
  if (saved === 'simple') { state.currentPage = 'cleaner'; localStorage.setItem('wsl-cleaner-page', 'cleaner'); }
  else if (saved === 'advanced') { state.currentPage = 'settings'; localStorage.setItem('wsl-cleaner-page', 'settings'); }
})();

// Initialise toggles - all on by default, aggressive tasks off by default
TASKS.forEach(t => (state.taskEnabled[t.id] = !t.aggressive));

/**
 * Persist the current task toggle states and settings to disk via IPC.
 * Called whenever the user enables/disables a task or changes a setting.
 */
function saveTaskPreferences() {
  window.wslCleaner.saveTaskPreferences({
    ...state.taskEnabled,
    _staleEnabled: state.staleEnabled,
    _staleDays: state.staleDays,
    _compactEnabled: state.compactEnabled,
  });
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

// Settings page
const taskCardsEl = $('#task-cards');
const vhdxPathEl = $('#vhdx-path');
const vhdxSizeEl = $('#vhdx-size');
const compactEnabledCb = $('#compact-enabled-cb');

// Cleaner page
const simpleSize = $('#simple-size');
const btnSimpleGo = $('#btn-simple-go');
const simpleSteps = $('#simple-steps');
const simpleResult = $('#simple-result');
const simpleSizeBefore = $('#simple-size-before');
const simpleSizeAfter = $('#simple-size-after');
const simpleSpaceSaved = $('#simple-space-saved');

// Aggressive confirmation modal
const aggressiveModal = $('#aggressive-modal');
const aggressiveModalList = $('#aggressive-modal-list');
const aggressiveModalCancel = $('#aggressive-modal-cancel');
const aggressiveModalProceed = $('#aggressive-modal-proceed');

// Size estimation (Cleaner page)
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
  // Log panel removed in Settings/Cleaner refactor; output is silent now
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
    distroPickerLabel.textContent = t('distro.none');
  } else if (sel.length === 1) {
    distroPickerLabel.textContent = sel[0];
  } else {
    distroPickerLabel.textContent = t('distro.count', { count: sel.length });
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
      ${d.isDefault ? `<span class="distro-item-default">${t('distro.default')}</span>` : ''}
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
      vhdxPathEl.textContent = t('compact.multiDisk', { count: state.vhdxFiles.length, distros: state.selectedDistros.join(', ') });
      vhdxPathEl.title = state.vhdxFiles.map(f => `${f.distro}: ${f.path}`).join('\n');
      vhdxSizeEl.textContent = formatBytes(totalSize);
    }
    const totalSize = state.vhdxFiles.reduce((sum, f) => sum + f.size, 0);
    simpleSize.textContent = formatBytes(totalSize);
  } else {
    vhdxPathEl.textContent = t('compact.notFound');
    vhdxSizeEl.textContent = '--';
    simpleSize.textContent = '--';
  }
}

// ── Build task cards (Settings) ──────────────────────────────────────────────

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
          ${t('task.' + task.id + '.name')}
          ${!available ? `<span class="chip-unavailable">${t('task.notFound', { tool: task.requires })}</span>` : ''}
          ${task.aggressive ? `<span class="chip-aggressive">${t('task.aggressive')}</span>` : ''}
        </div>
        <div class="task-desc">${t('task.' + task.id + '.desc')}</div>
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
 * Clear all size estimate badges on task cards.
 */
function clearEstimates() {
  document.querySelectorAll('.task-size-badge').forEach(b => {
    b.textContent = '';
    b.classList.add('hidden');
  });
}

// ── Estimate Sizes button (Cleaner) ──────────────────────────────────────

btnSimpleEstimate.addEventListener('click', async () => {
  if (state.isRunning) return;
  state.isRunning = true;
  btnSimpleEstimate.disabled = true;
  btnSimpleGo.disabled = true;
  distroPickerBtn.disabled = true;
  simpleEstimateResult.classList.add('hidden');

  btnSimpleEstimate.innerHTML = `<div class="task-spinner" style="width:16px;height:16px;border-width:2px;"></div> ${t('simple.estimating')}`;

  try {
    const sizes = await runEstimates();
    // Calculate total for enabled tasks (excluding fstrim which doesn't free space directly)
    let totalBytes = 0;
    for (const task of TASKS) {
      if (task.id === 'fstrim') continue;
      if (!state.taskEnabled[task.id]) continue;
      if (sizes[task.id]) {
        totalBytes += parseSizeToBytes(sizes[task.id]);
      }
    }
    if (totalBytes > 0) {
      simpleEstimateTotal.textContent = '~' + formatBytes(totalBytes);
    } else {
      simpleEstimateTotal.textContent = t('simple.negligible');
    }
    simpleEstimateResult.classList.remove('hidden');
  } catch {
    simpleEstimateTotal.textContent = t('simple.unavailable');
    simpleEstimateResult.classList.remove('hidden');
  }

  btnSimpleEstimate.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> ${t('simple.estimateBtn')}`;
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
    aggressiveModalList.innerHTML = aggressiveTasks.map(task => `
      <div class="modal-task-item">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <div class="modal-task-item-info">
          <div class="modal-task-item-name">${escapeHtml(stripHtml(t('task.' + task.id + '.name')))}</div>
          <div class="modal-task-item-desc">${t('task.' + task.id + '.desc')}</div>
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

// ── Settings page: stale & compact toggle wiring ─────────────────────────────

const staleEnabledCb = $('#stale-enabled-cb');
const staleDaysInput = $('#stale-days-input');

// Stale directory toggle
staleEnabledCb.addEventListener('change', () => {
  state.staleEnabled = staleEnabledCb.checked;
  staleDaysInput.disabled = !state.staleEnabled;
  saveTaskPreferences();
});

// Stale days input
staleDaysInput.addEventListener('change', () => {
  state.staleDays = Math.max(1, parseInt(staleDaysInput.value, 10) || 30);
  saveTaskPreferences();
});

// Compact toggle
compactEnabledCb.addEventListener('change', () => {
  state.compactEnabled = compactEnabledCb.checked;
  // Update Cleaner page button label
  const btnLabel = $('#btn-simple-go-label');
  if (btnLabel) btnLabel.innerHTML = state.compactEnabled ? t('simple.cleanCompact') : t('simple.clean');
  // Update step visibility
  applyCleanOnlyVisibility(!state.compactEnabled);
  saveTaskPreferences();
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

// Button label ref
const btnSimpleGoLabel = $('#btn-simple-go-label');

// ── Cleaner mode: Clean & Compact ────────────────────────────────────────────

btnSimpleGo.addEventListener('click', async () => {
  if (state.isRunning) return;
  if (state.vhdxFiles.length === 0) return;

  // Check for aggressive tasks and prompt confirmation
  const aggressiveTasks = getEnabledAggressiveTasks();
  if (aggressiveTasks.length > 0) {
    const confirmed = await showAggressiveConfirmation(aggressiveTasks);
    if (!confirmed) return;
  }

  const doCompact = state.compactEnabled;

  state.isRunning = true;
  btnSimpleGo.disabled = true;
  distroPickerBtn.disabled = true;
  simpleResult.classList.add('hidden');
  simpleSteps.classList.remove('hidden');
  resetSimpleSteps();
  applyCleanOnlyVisibility(!doCompact);

  // Hide the disclaimer, button, and estimate once cleanup starts
  const disclaimer = document.querySelector('.simple-disclaimer');
  if (disclaimer) disclaimer.classList.add('hidden');
  btnSimpleGo.classList.add('hidden');
  simpleEstimate.classList.add('hidden');

  const simpleStart = Date.now();
  let simpleTotalRun = 0, simpleTotalOk = 0, simpleTotalFail = 0;
  let simpleStaleFound = 0, simpleStaleDeleted = 0;

  // Measure total VHDX size before
  let totalBefore = 0;
  for (const vf of state.vhdxFiles) {
    const res = await window.wslCleaner.getFileSize(vf.path);
    totalBefore += res.ok ? res.size : 0;
  }

  // Step 1: Scan & remove stale directories on each distro (if enabled in Settings)
  const staleStepItem = simpleSteps.querySelector('.step-item[data-step="stale"]');
  if (state.staleEnabled) {
    if (staleStepItem) staleStepItem.style.display = '';
    setSimpleStep('stale', 'active');
    for (const distro of state.selectedDistros) {
      let stalePaths = [];
      try {
        const staleDirsFound = await window.wslCleaner.scanStaleDirs({ distro, days: state.staleDays });
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
  } else {
    // Hide stale step when disabled in Settings
    if (staleStepItem) staleStepItem.style.display = 'none';
  }

  // Step 2: Run cleanup tasks on each distro (respects task toggles from Settings)
  setSimpleStep('cleanup', 'active');
  let cleanupOk = true;
  for (const distro of state.selectedDistros) {
    const distroTools = state.toolsByDistro[distro] || {};
    const availableTasks = TASKS.filter(task => {
      if (task.id === 'fstrim') return false; // fstrim runs separately in step 3
      if (!state.taskEnabled[task.id]) return false;
      const available = !task.requires || distroTools[task.requires];
      return available;
    });
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

  // Steps 4-7 only run when compaction is enabled in Settings
  if (doCompact) {
    // Step 4: Shutdown WSL (once for all distros)
    setSimpleStep('shutdown', 'active');
    await window.wslCleaner.runWslCommand({ command: 'wsl --shutdown', taskId: 'cleaner' });
    setSimpleStep('shutdown', 'done');

    // Step 5: Update WSL
    setSimpleStep('update', 'active');
    await window.wslCleaner.runWslCommand({ command: 'wsl --update', taskId: 'cleaner' });
    setSimpleStep('update', 'done');

    // Step 6: Compact all VHDX files
    setSimpleStep('compact', 'active');
    await window.wslCleaner.runWslCommand({ command: 'wsl --shutdown', taskId: 'cleaner' });
    let compactOk = true;
    for (const vf of state.vhdxFiles) {
      const compactRes = await window.wslCleaner.optimizeVhdx({ vhdxPath: vf.path, taskId: 'cleaner' });
      if (!compactRes.ok) compactOk = false;
    }
    setSimpleStep('compact', compactOk ? 'done' : 'failed');

    // Step 7: Restart each selected distro
    setSimpleStep('restart', 'active');
    for (const distro of state.selectedDistros) {
      await window.wslCleaner.runWslCommand({ command: `wsl -d ${distro} -- echo "WSL restarted"`, taskId: 'cleaner' });
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
  simpleSpaceSaved.textContent = saved > 0 ? formatBytes(saved) : t('result.noChange');
  simpleResult.classList.remove('hidden');

  // Update displayed sizes
  updateVhdxDisplay();

  // Save cleaner session to history
  await window.wslCleaner.saveCleanupSession({
    type: doCompact ? 'cleaner' : 'cleaner-clean-only',
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
  btnSimpleGo.classList.remove('hidden');
  simpleEstimate.classList.remove('hidden');
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
  if (diffDays === 0) return t('stats.today');
  if (diffDays === 1) return t('stats.yesterday');
  if (diffDays < 7) return t('stats.daysAgo', { count: diffDays });
  if (diffDays < 30) { const weeks = Math.floor(diffDays / 7); return tp('stats.weeksAgo', weeks, { count: weeks }); }
  return date.toLocaleDateString();
}

function typeLabel(type) {
  return t('type.' + type);
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
          label: t('chart.before'),
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
          label: t('chart.after'),
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
        label: t('chart.spaceSaved'),
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
              return mb >= 1024 ? t('chart.saved', { value: (mb / 1024).toFixed(2) + ' GB' }) : t('chart.saved', { value: mb.toFixed(1) + ' MB' });
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
      detailsHtml += `<span class="history-detail">${t('history.saved', { size: formatBytes(r.spaceSaved) })}</span>`;
    }
    if (r.vhdxSizeBefore != null && r.vhdxSizeAfter != null) {
      detailsHtml += `<span class="history-detail">${t('history.sizeChange', { before: formatBytes(r.vhdxSizeBefore), after: formatBytes(r.vhdxSizeAfter) })}</span>`;
    }
    if (r.tasksRun != null && r.tasksRun > 0) {
      detailsHtml += `<span class="history-detail">${t('history.tasks', { success: r.tasksSucceeded || 0, total: r.tasksRun })}</span>`;
    }
    if (r.staleDirsDeleted != null && r.staleDirsDeleted > 0) {
      detailsHtml += `<span class="history-detail">${t('history.dirsRemoved', { count: r.staleDirsDeleted })}</span>`;
    }
    if (!detailsHtml) {
      detailsHtml = `<span class="history-detail" style="color:var(--text-muted)">${t('history.noSizeData')}</span>`;
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
    statLastCleanup.textContent = t('stats.never');
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
        `<div class="update-spinner"></div> ${t('update.checking')}`,
        'update-checking'
      );
      btnCheckUpdates.disabled = true;
      break;

    case 'available':
      setUpdateStatus(
        `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> ${t('update.available', { version: escapeHtml(data.version) })}`,
        'update-available'
      );
      btnCheckUpdates.disabled = true;
      break;

    case 'downloading':
      setUpdateStatus(
        `<div class="update-progress-wrap"><div class="update-progress-bar" style="width:${data.percent}%"></div></div> ${t('update.downloading', { percent: data.percent })}`,
        'update-downloading'
      );
      btnCheckUpdates.disabled = true;
      break;

    case 'downloaded':
      setUpdateStatus(
        `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2.5"><polyline points="20,6 9,17 4,12"/></svg> ${t('update.ready', { version: escapeHtml(data.version) })}`,
        'update-downloaded'
      );
      btnCheckUpdates.classList.add('hidden');
      btnInstallUpdate.classList.remove('hidden');
      break;

    case 'up-to-date':
      setUpdateStatus(
        `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2.5"><polyline points="20,6 9,17 4,12"/></svg> ${t('update.upToDate')}`,
        'update-uptodate'
      );
      btnCheckUpdates.disabled = false;
      break;

    case 'error':
      setUpdateStatus(
        `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> ${t('update.failed')}`,
        'update-error'
      );
      btnCheckUpdates.disabled = false;
      break;
  }
});

btnCheckUpdates.addEventListener('click', async () => {
  btnCheckUpdates.disabled = true;
  setUpdateStatus(
    `<div class="update-spinner"></div> ${t('update.checking')}`,
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
  // Load saved locale preference and i18n strings
  let savedLocale = 'en';
  try { savedLocale = await window.wslCleaner.getLocalePreference(); } catch {}
  await loadLocale(savedLocale);
  applyI18n();

  showScreen(loadingScreen);

  // Load app version for About page
  try {
    const version = await window.wslCleaner.getAppVersion();
    aboutVersion.textContent = `v${version}`;
  } catch { /* keep default */ }

  const wslCheck = await window.wslCleaner.checkWsl();

  if (!wslCheck.ok) {
    errorMessage.textContent = tError(wslCheck.error);
    showScreen(errorScreen);
    return;
  }

  state.distros = wslCheck.distros;
  state.selectedDistros = [wslCheck.defaultDistro];
  statusText.textContent = t('status.readyCount', { count: wslCheck.distros.length });

  // Restore saved task preferences and settings (overlay on top of defaults)
  try {
    const savedPrefs = await window.wslCleaner.getTaskPreferences();
    for (const [key, value] of Object.entries(savedPrefs)) {
      if (key === '_staleEnabled') {
        state.staleEnabled = !!value;
      } else if (key === '_staleDays') {
        state.staleDays = Math.max(1, parseInt(value, 10) || 30);
      } else if (key === '_compactEnabled') {
        state.compactEnabled = !!value;
      } else if (key in state.taskEnabled) {
        state.taskEnabled[key] = value;
      }
    }
  } catch { /* use defaults if preferences can't be loaded */ }

  // Apply restored settings to UI controls
  staleEnabledCb.checked = state.staleEnabled;
  staleDaysInput.value = state.staleDays;
  staleDaysInput.disabled = !state.staleEnabled;
  compactEnabledCb.checked = state.compactEnabled;

  // Update Cleaner page button label to match compact setting
  if (btnSimpleGoLabel) {
    btnSimpleGoLabel.innerHTML = state.compactEnabled ? t('simple.cleanCompact') : t('simple.clean');
  }
  applyCleanOnlyVisibility(!state.compactEnabled);

  renderDistroPicker();
  await refreshDistroData();

  // Restore last page from localStorage
  switchPage(state.currentPage);

  showScreen(mainScreen);
}

init();

// ── Language selector ──────────────────────────────────────────────────────

const localeSelect = document.getElementById('locale-select');
(async () => {
  try {
    const languages = await window.wslCleaner.getLanguages();
    for (const lang of languages.locales) {
      const opt = document.createElement('option');
      opt.value = lang.code;
      opt.textContent = lang.nativeName;
      if (lang.code === getLocale()) opt.selected = true;
      localeSelect.appendChild(opt);
    }
  } catch {}
})();
localeSelect.addEventListener('change', async () => {
  await setLocale(localeSelect.value);
  // Re-render dynamic content
  renderTasks();
  renderDistroPicker();
  updateVhdxDisplay();
  if (state.currentPage === 'stats') renderStatsPage();
});

document.addEventListener('locale-changed', () => {
  renderTasks();
  renderDistroPicker();
  updateVhdxDisplay();
  // Update Cleaner button label for new locale
  if (btnSimpleGoLabel) {
    btnSimpleGoLabel.innerHTML = state.compactEnabled ? t('simple.cleanCompact') : t('simple.clean');
  }
});
