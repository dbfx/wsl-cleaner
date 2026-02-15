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
  taskSearch: '',          // search filter for task cards
  
  staleEnabled: true,     // whether stale directory cleanup is enabled
  staleDays: 30,          // stale directory age threshold in days
  compactEnabled: true,   // whether disk compaction runs after cleaning
  soundEnabled: true,     // whether whoosh sound plays on cleanup completion
  isRunning: false,
  currentPage: localStorage.getItem('wsl-cleaner-page') || 'cleaner',
  diskmapTree: null,       // parsed tree structure from disk scan
  diskmapPath: '/',        // current drill-down path
  diskmapScanning: false,  // whether a scan is in progress

  // Tray & alerts
  trayEnabled: false,
  trayCloseToTray: true,
  trayInterval: 60,
  trayDistro: '',
  alertsEnabled: false,
  alertCooldown: 30,
  alerts: {
    vhdxSize:    { enabled: true, threshold: 60 },
    memoryHigh:  { enabled: true, threshold: 80 },
    dockerSpace: { enabled: true, threshold: 10 },
    zombies:     { enabled: true, threshold: 1 },
    systemdFail: { enabled: true, threshold: 1 },
    dnsBroken:   { enabled: true, threshold: 0 },
  },
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
    _soundEnabled: state.soundEnabled,
  });
}

// ── DOM refs ─────────────────────────────────────────────────────────────────

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const errorScreen = $('#error-screen');
const loadingScreen = $('#loading-screen');
const mainScreen = $('#main-screen');
const errorMessage = $('#error-message');
const splashEl = $('#splash');
const detectingEl = $('#detecting');
const splashDetecting = $('#splash-detecting');
const statusText = $('#status-text');
const distroPickerBtn = $('#distro-picker-btn');
const distroPickerLabel = $('#distro-picker-label');
const distroDropdown = $('#distro-dropdown');

// Settings page
const taskCardsEl = $('#task-cards');
const taskSearchInput = $('#task-search');
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

// Progress tracking (Cleaner page)
const simpleProgressFill = $('#simple-progress-fill');
const simpleStepCounter = $('#simple-step-counter');
const simpleElapsed = $('#simple-elapsed');
const progressHeader = simpleSteps ? simpleSteps.querySelector('.progress-header') : null;
let elapsedInterval = null;

// Live output log (Cleaner page)
const cleanerLog = $('#cleaner-log');
const cleanerLogSection = $('#cleaner-log-section');
const cleanerLogToggle = $('#cleaner-log-toggle');
const cleanupStepSub = $('#cleanup-step-sub');

// About page
const aboutVersion = $('#about-version');
const btnCheckUpdates = $('#btn-check-updates');
const btnInstallUpdate = $('#btn-install-update');
const btnGitHub = $('#btn-github');
const updateStatusEl = $('#update-status');
const soundEnabledCb = $('#sound-enabled-cb');

// Disk Map page
const diskmapDistroSelect = $('#diskmap-distro');
const diskmapDepthSelect = $('#diskmap-depth');
const btnDiskmapScan = $('#btn-diskmap-scan');
const btnDiskmapCancel = $('#btn-diskmap-cancel');
const diskmapBreadcrumb = $('#diskmap-breadcrumb');
const diskmapStatus = $('#diskmap-status');
const diskmapTreemapEl = $('#diskmap-treemap');
const diskmapEmpty = $('#diskmap-empty');
const diskmapScanning = $('#diskmap-scanning');

// ── Window controls ──────────────────────────────────────────────────────────

$('#btn-minimize').addEventListener('click', () => window.wslCleaner.minimize());
$('#btn-maximize').addEventListener('click', () => window.wslCleaner.maximize());
$('#btn-close').addEventListener('click', () => window.wslCleaner.close());

// ── App menu (hamburger) ────────────────────────────────────────────────────

const appMenuBtn = $('#btn-app-menu');
const appMenuDropdown = $('#app-menu-dropdown');

function toggleAppMenu() {
  appMenuDropdown.classList.toggle('hidden');
}

function closeAppMenu() {
  appMenuDropdown.classList.add('hidden');
}

appMenuBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleAppMenu();
});

// Close menu when clicking outside
document.addEventListener('click', (e) => {
  if (!appMenuDropdown.classList.contains('hidden') && !appMenuDropdown.contains(e.target)) {
    closeAppMenu();
  }
});

// Close menu on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeAppMenu();
});

$('#menu-reload').addEventListener('click', () => {
  closeAppMenu();
  window.wslCleaner.reload();
});

$('#menu-toggle-fullscreen').addEventListener('click', () => {
  closeAppMenu();
  window.wslCleaner.toggleFullscreen();
});

$('#menu-about').addEventListener('click', () => {
  closeAppMenu();
  // Navigate to the About page
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const aboutNav = document.querySelector('.nav-item[data-page="about"]');
  if (aboutNav) aboutNav.classList.add('active');
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  const aboutPage = $('#page-about');
  if (aboutPage) aboutPage.classList.remove('hidden');
});

$('#menu-exit').addEventListener('click', () => {
  closeAppMenu();
  window.wslCleaner.quit();
});

// ── Helpers ──────────────────────────────────────────────────────────────────

// formatBytes is loaded from utils.js

/**
 * Launch a confetti burst over the Cleaner page.
 * Pure canvas-based — no external libraries.
 */
function launchConfetti() {
  const container = document.getElementById('page-cleaner');
  if (!container) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti-canvas';
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  function resize() {
    canvas.width = container.offsetWidth;
    canvas.height = container.offsetHeight;
  }
  resize();

  const colors = ['#00d4aa', '#00f0c0', '#2ed573', '#ffa502', '#ff6348', '#a29bfe', '#fd79a8', '#fdcb6e'];
  const particles = [];
  const count = 120;

  for (let i = 0; i < count; i++) {
    particles.push({
      x: canvas.width / 2 + (Math.random() - 0.5) * 60,
      y: canvas.height * 0.45,
      vx: (Math.random() - 0.5) * 14,
      vy: -Math.random() * 12 - 4,
      w: Math.random() * 8 + 4,
      h: Math.random() * 6 + 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.3,
      opacity: 1,
    });
  }

  const gravity = 0.25;
  const drag = 0.99;
  const fadeStart = 60; // frame at which particles begin fading
  let frame = 0;
  const totalFrames = 120;

  function tick() {
    frame++;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const p of particles) {
      p.vy += gravity;
      p.vx *= drag;
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.rotSpeed;
      if (frame > fadeStart) {
        p.opacity = Math.max(0, 1 - (frame - fadeStart) / (totalFrames - fadeStart));
      }

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.globalAlpha = p.opacity;
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }

    if (frame < totalFrames) {
      requestAnimationFrame(tick);
    } else {
      canvas.remove();
    }
  }
  requestAnimationFrame(tick);
}

/**
 * Play a short "whoosh" sound using Web Audio API.
 * No audio files needed — synthesized from filtered noise with exponential decay.
 */
function playWhoosh() {
  if (!state.soundEnabled) return;
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const duration = 0.45;
    const bufferSize = Math.ceil(ac.sampleRate * duration);
    const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
    const data = buffer.getChannelData(0);

    // Fill with white noise
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const source = ac.createBufferSource();
    source.buffer = buffer;

    // Bandpass filter for a "whoosh" character
    const filter = ac.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(800, ac.currentTime);
    filter.frequency.exponentialRampToValueAtTime(200, ac.currentTime + duration);
    filter.Q.value = 1.2;

    // Gain envelope — quick attack, smooth decay
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.6, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ac.destination);

    source.start();
    source.stop(ac.currentTime + duration);

    // Clean up after done
    source.onended = () => ac.close();
  } catch {
    // Silently ignore if Web Audio is unavailable
  }
}

function showScreen(screen) {
  [errorScreen, loadingScreen, mainScreen].forEach(s => s.classList.add('hidden'));
  screen.classList.remove('hidden');
}

function appendLog(text) {
  if (!cleanerLog || !text) return;
  cleanerLog.textContent += text;
  cleanerLog.scrollTop = cleanerLog.scrollHeight;
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

  // Run background size estimation when navigating to the settings page
  if (pageName === 'settings') refreshSettingsEstimates();

  // Render disk map when navigating to it
  if (pageName === 'diskmap') renderDiskMap();

  // Render health dashboard and start auto-refresh
  if (pageName === 'health') {
    renderHealthPage();
    startHealthAutoRefresh();
  } else {
    stopHealthAutoRefresh();
  }

  // Render distros page and start auto-refresh
  if (pageName === 'distros') {
    renderDistrosPage();
    startDistrosAutoRefresh();
  } else {
    stopDistrosAutoRefresh();
  }

  // Render tray page
  if (pageName === 'tray') renderTrayPage();

  // Render config editor page
  if (pageName === 'config') renderConfigPage();

  // Render startup manager page
  if (pageName === 'startup') renderStartupPage();

  // Render performance page
  if (pageName === 'performance') renderPerformancePage();
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

  // Re-run background size estimation if currently on the Settings page
  if (state.currentPage === 'settings') refreshSettingsEstimates();
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

// Persist collapse state per category in localStorage
const CAT_STATE_KEY = 'wsl-cleaner-cat-state';

function getCatCollapseState() {
  try {
    return JSON.parse(localStorage.getItem(CAT_STATE_KEY)) || {};
  } catch { return {}; }
}

function setCatCollapseState(catId, collapsed) {
  const s = getCatCollapseState();
  s[catId] = collapsed;
  localStorage.setItem(CAT_STATE_KEY, JSON.stringify(s));
}

/**
 * Update the enabled/total count badge on a category header.
 * Called after a task toggle changes so the badge stays in sync
 * without re-rendering the entire task list.
 */
function updateCatCount(catId) {
  const catTasks = TASKS.filter(task => task.category === catId);
  const enabledCount = catTasks.filter(task => {
    const available = !task.requires || state.tools[task.requires];
    return available && state.taskEnabled[task.id];
  }).length;
  // Find the category header in the DOM and update its count badge
  const headers = document.querySelectorAll('.category-header');
  for (const header of headers) {
    const nameEl = header.querySelector('.cat-name');
    if (nameEl && nameEl.textContent === t('category.' + catId + '.name')) {
      const countEl = header.querySelector('.cat-count');
      if (countEl) countEl.textContent = `${enabledCount}/${catTasks.length}`;
      break;
    }
  }
}

function buildTaskCard(task) {
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

  // Tooltip showing the actual shell command
  const cmd = Array.isArray(task.command) ? task.command.join('; ') : task.command;
  const truncated = cmd.length > 300 ? cmd.slice(0, 297) + '...' : cmd;
  card.title = t('task.commandTooltip', { cmd: truncated });

  card.addEventListener('click', () => {
    if (!available || state.isRunning) return;
    const cb = card.querySelector('input[type="checkbox"]');
    cb.checked = !cb.checked;
    state.taskEnabled[task.id] = cb.checked;
    saveTaskPreferences();
    updateCatCount(task.category);
  });

  const cb = card.querySelector('input[type="checkbox"]');
  cb.addEventListener('change', (e) => {
    state.taskEnabled[task.id] = e.target.checked;
    saveTaskPreferences();
    updateCatCount(task.category);
  });

  return card;
}

function renderTasks() {
  taskCardsEl.innerHTML = '';

  const query = state.taskSearch.toLowerCase().trim();

  // Filter tasks by search query
  const filtered = TASKS.filter(task => {
    // Search filter — match against localized name and description
    if (query) {
      const name = t('task.' + task.id + '.name').toLowerCase();
      const desc = t('task.' + task.id + '.desc').toLowerCase();
      if (!name.includes(query) && !desc.includes(query) && !task.id.includes(query)) return false;
    }
    return true;
  });

  // Group by category
  const groups = new Map();
  for (const cat of CATEGORIES) {
    const catTasks = filtered.filter(task => task.category === cat.id);
    if (catTasks.length > 0) {
      groups.set(cat.id, catTasks);
    }
  }

  // No results
  if (groups.size === 0) {
    const noResults = document.createElement('div');
    noResults.className = 'task-no-results';
    noResults.innerHTML = `
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <p>${t('settings.noResults')}</p>
    `;
    taskCardsEl.appendChild(noResults);
    return;
  }

  const collapseState = getCatCollapseState();
  // If searching, auto-expand all groups
  const isSearching = query.length > 0;

  for (const [catId, catTasks] of groups) {
    const catDef = CATEGORIES.find(c => c.id === catId);
    if (!catDef) continue;

    const collapsed = isSearching ? false : (collapseState[catId] !== false);

    // Category group container
    const group = document.createElement('div');
    group.className = 'category-group';

    // Header
    const header = document.createElement('div');
    header.className = 'category-header' + (collapsed ? ' collapsed' : '');
    // Count how many tasks in this category are enabled (and available)
    const enabledCount = catTasks.filter(task => {
      const available = !task.requires || state.tools[task.requires];
      return available && state.taskEnabled[task.id];
    }).length;

    header.innerHTML = `
      <span class="cat-icon">${catDef.icon}</span>
      <span class="cat-name">${t('category.' + catId + '.name')}</span>
      <span class="cat-count">${enabledCount}/${catTasks.length}</span>
      <svg class="cat-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="6,9 12,15 18,9"/>
      </svg>
    `;

    // Body
    const body = document.createElement('div');
    body.className = 'category-body' + (collapsed ? ' collapsed' : '');

    let cardIndex = 0;
    for (const task of catTasks) {
      const card = buildTaskCard(task);
      card.style.setProperty('--card-index', cardIndex++);
      body.appendChild(card);
    }

    // Toggle collapse on header click
    header.addEventListener('click', () => {
      const isCollapsed = header.classList.toggle('collapsed');
      body.classList.toggle('collapsed', isCollapsed);
      setCatCollapseState(catId, isCollapsed);
    });

    group.appendChild(header);
    group.appendChild(body);
    taskCardsEl.appendChild(group);
  }
}

// ── Task search wiring ───────────────────────────────────────────────────────

let _searchDebounce = null;
taskSearchInput.addEventListener('input', () => {
  clearTimeout(_searchDebounce);
  _searchDebounce = setTimeout(() => {
    state.taskSearch = taskSearchInput.value;
    renderTasks();
  }, 150);
});

taskSearchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    taskSearchInput.value = '';
    state.taskSearch = '';
    renderTasks();
    taskSearchInput.blur();
  }
});

// ── Size estimation ──────────────────────────────────────────────────────

/**
 * Run size estimates for tasks across all selected distros.
 * @param {Object} [opts]
 * @param {boolean} [opts.allTasks=false] When true, estimate ALL tasks with
 *   an estimateCommand (not just enabled ones). Used by the Settings page so
 *   users can see sizes before toggling tasks on.
 * @returns {Promise<Object<string, string>>} merged size map
 */
async function runEstimates({ allTasks = false } = {}) {
  // Gather tasks that have estimate commands and are available
  const mergedSizes = {};

  for (const distro of state.selectedDistros) {
    const distroTools = state.toolsByDistro[distro] || {};
    const estimatable = TASKS.filter(t => {
      const available = !t.requires || distroTools[t.requires];
      return available && t.estimateCommand && (allTasks || state.taskEnabled[t.id]);
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
    b.classList.remove('loading');
  });
}

/**
 * Populate task card size badges from a { taskId: sizeStr } map.
 */
function applyEstimateBadges(sizes) {
  for (const [taskId, sizeStr] of Object.entries(sizes)) {
    const badge = document.querySelector(`.task-size-badge[data-size-task="${taskId}"]`);
    if (badge && sizeStr) {
      badge.textContent = '~' + sizeStr;
      badge.classList.remove('hidden', 'loading');
    }
  }
}

// ── Background size estimation for Settings page ─────────────────────────

/** Counter to detect stale estimation runs (e.g. user switched distros mid-flight). */
let _estimateGeneration = 0;

/**
 * Kick off background size estimation and populate badges on task cards.
 * Called when navigating to the Settings page or after distro changes.
 * Fire-and-forget — errors are silenced so it never disrupts the UI.
 */
async function refreshSettingsEstimates() {
  // Guard: nothing to estimate if no distros are selected or a cleanup is running
  if (state.isRunning || state.selectedDistros.length === 0) return;

  const gen = ++_estimateGeneration;

  // Show loading shimmer on all estimatable task badges
  clearEstimates();
  for (const task of TASKS) {
    if (!task.estimateCommand) continue;
    const badge = document.querySelector(`.task-size-badge[data-size-task="${task.id}"]`);
    if (badge) {
      badge.textContent = t('settings.estimating');
      badge.classList.remove('hidden');
      badge.classList.add('loading');
    }
  }

  try {
    const sizes = await runEstimates({ allTasks: true });
    // Only apply if this is still the latest request
    if (gen !== _estimateGeneration) return;
    clearEstimates();
    applyEstimateBadges(sizes);
  } catch {
    // Best-effort — hide loading badges on failure
    if (gen === _estimateGeneration) clearEstimates();
  }
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

// ── Cleaner log panel toggle ─────────────────────────────────────────────────

if (cleanerLogToggle) {
  cleanerLogToggle.addEventListener('click', () => {
    cleanerLogSection.classList.toggle('collapsed');
  });
}

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

function setSimpleStep(stepName, status, errorOutput) {
  const item = simpleSteps.querySelector(`.step-item[data-step="${stepName}"]`);
  if (!item) return;

  item.classList.remove('active', 'done', 'failed');
  const iconSlot = item.querySelector('.step-icon-slot');

  // Remove any existing error detail from a previous run
  const existingDetail = item.querySelector('.step-error-detail');
  if (existingDetail) existingDetail.remove();

  if (status === 'active') {
    item.classList.add('active');
    iconSlot.innerHTML = '<div class="step-spinner"></div>';
  } else if (status === 'done') {
    item.classList.add('done');
    iconSlot.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2.5"><polyline points="20,6 9,17 4,12"/></svg>`;
  } else if (status === 'failed') {
    item.classList.add('failed');
    iconSlot.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

    // Show collapsible error detail if there is output
    if (errorOutput && errorOutput.trim()) {
      const detail = document.createElement('div');
      detail.className = 'step-error-detail';
      detail.innerHTML =
        `<button class="step-error-toggle" type="button">` +
        `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6,9 12,15 18,9"/></svg>` +
        `<span>${t('simple.viewError')}</span></button>` +
        `<pre class="step-error-output hidden">${escapeHtml(errorOutput.trim())}</pre>`;
      item.appendChild(detail);

      const toggleBtn = detail.querySelector('.step-error-toggle');
      const outputPre = detail.querySelector('.step-error-output');
      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        outputPre.classList.toggle('hidden');
        toggleBtn.classList.toggle('expanded');
      });
    }
  } else {
    iconSlot.innerHTML = '';
  }

  updateSimpleProgress();
}

/** Count visible steps and update the progress bar, step counter, and elapsed. */
function updateSimpleProgress() {
  const allSteps = simpleSteps.querySelectorAll('.step-item');
  let total = 0, done = 0, activeIdx = -1;
  let idx = 0;
  allSteps.forEach(item => {
    if (item.style.display === 'none') return;
    total++;
    if (item.classList.contains('done') || item.classList.contains('failed')) done++;
    if (item.classList.contains('active')) activeIdx = idx;
    idx++;
  });

  // Progress bar: done steps fill proportionally; active step counts as half
  const hasActive = activeIdx >= 0;
  const progress = total > 0 ? ((done + (hasActive ? 0.5 : 0)) / total) * 100 : 0;
  if (simpleProgressFill) simpleProgressFill.style.width = Math.min(progress, 100) + '%';

  // Step counter
  const current = done + (hasActive ? 1 : 0);
  if (simpleStepCounter) {
    simpleStepCounter.textContent = t('simple.stepOf', { current, total });
  }
}

/** Render numbered circles for all visible pending step items. */
function renderStepNumbers() {
  const allSteps = simpleSteps.querySelectorAll('.step-item');
  let visIdx = 0;
  allSteps.forEach(item => {
    if (item.style.display === 'none') return;
    visIdx++;
    const iconSlot = item.querySelector('.step-icon-slot');
    if (!item.classList.contains('active') && !item.classList.contains('done') && !item.classList.contains('failed')) {
      iconSlot.innerHTML = `<div class="step-number">${visIdx}</div>`;
    }
  });
}

/** Start the elapsed timer. */
function startElapsedTimer() {
  const start = Date.now();
  if (simpleElapsed) simpleElapsed.textContent = '0:00';
  elapsedInterval = setInterval(() => {
    const secs = Math.floor((Date.now() - start) / 1000);
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    if (simpleElapsed) simpleElapsed.textContent = m + ':' + String(s).padStart(2, '0');
  }, 1000);
}

/** Stop the elapsed timer. */
function stopElapsedTimer() {
  if (elapsedInterval) {
    clearInterval(elapsedInterval);
    elapsedInterval = null;
  }
}

function resetSimpleSteps() {
  simpleSteps.querySelectorAll('.step-item').forEach(item => {
    item.classList.remove('active', 'done', 'failed');
    item.querySelector('.step-icon-slot').innerHTML = '';
    const errorDetail = item.querySelector('.step-error-detail');
    if (errorDetail) errorDetail.remove();
  });
  // Reset progress UI
  if (simpleProgressFill) simpleProgressFill.style.width = '0%';
  if (simpleStepCounter) simpleStepCounter.textContent = '';
  if (simpleElapsed) simpleElapsed.textContent = '0:00';
  stopElapsedTimer();
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

  // Show and clear the live output log
  if (cleanerLog) cleanerLog.textContent = '';
  if (cleanerLogSection) {
    cleanerLogSection.classList.remove('hidden', 'collapsed');
  }
  if (cleanupStepSub) cleanupStepSub.textContent = '';

  // Hide the disclaimer, button, estimate, and hero once cleanup starts
  const disclaimer = document.querySelector('.simple-disclaimer');
  if (disclaimer) disclaimer.classList.add('hidden');
  btnSimpleGo.classList.add('hidden');
  simpleEstimate.classList.add('hidden');
  const simpleHero = document.querySelector('.simple-hero');
  if (simpleHero) simpleHero.classList.add('hidden');

  // Render numbered pending icons and start elapsed timer
  renderStepNumbers();
  startElapsedTimer();
  updateSimpleProgress();

  const simpleStart = Date.now();
  let simpleTotalRun = 0, simpleTotalOk = 0, simpleTotalFail = 0;
  let simpleStaleFound = 0, simpleStaleDeleted = 0;
  const failedTasks = [];
  const taskSavingsMap = {}; // { taskId: { name, spaceSaved } }

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
        const beforeStale = await window.wslCleaner.getAvailableSpace(distro);
        try {
          const delResults = await window.wslCleaner.deleteStaleDirs({
            distro,
            paths: stalePaths,
            taskId: 'simple-stale',
          });
          simpleStaleDeleted += delResults.filter(r => r.ok).length;
        } catch { /* ignore deletion errors */ }
        const afterStale = await window.wslCleaner.getAvailableSpace(distro);
        if (beforeStale.ok && afterStale.ok) {
          const delta = afterStale.bytes - beforeStale.bytes;
          if (delta > 0) {
            if (!taskSavingsMap['_stale']) {
              taskSavingsMap['_stale'] = { name: t('result.breakdownStale'), spaceSaved: 0 };
            }
            taskSavingsMap['_stale'].spaceSaved += delta;
          }
        }
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
  const cleanupErrors = [];
  let cleanupTaskIndex = 0;

  // Pre-compute total task count across all distros for sub-progress
  let cleanupTaskTotal = 0;
  for (const distro of state.selectedDistros) {
    const distroTools = state.toolsByDistro[distro] || {};
    cleanupTaskTotal += TASKS.filter(task => {
      if (task.id === 'fstrim') return false;
      if (!state.taskEnabled[task.id]) return false;
      return !task.requires || distroTools[task.requires];
    }).length;
  }

  for (const distro of state.selectedDistros) {
    const distroTools = state.toolsByDistro[distro] || {};
    const availableTasks = TASKS.filter(task => {
      if (task.id === 'fstrim') return false; // fstrim runs separately in step 3
      if (!state.taskEnabled[task.id]) return false;
      const available = !task.requires || distroTools[task.requires];
      return available;
    });
    for (const task of availableTasks) {
      cleanupTaskIndex++;
      const taskName = t('task.' + task.id + '.name') || task.name || task.id;
      if (cleanupStepSub) {
        cleanupStepSub.textContent = taskName + ' (' + cleanupTaskIndex + ' / ' + cleanupTaskTotal + ')';
      }
      simpleTotalRun++;
      const beforeSpace = await window.wslCleaner.getAvailableSpace(distro);
      const result = await window.wslCleaner.runCleanup({
        distro,
        taskId: task.id,
        command: task.command,
        asRoot: task.asRoot,
      });
      if (result.ok) {
        simpleTotalOk++;
        const afterSpace = await window.wslCleaner.getAvailableSpace(distro);
        if (beforeSpace.ok && afterSpace.ok) {
          const delta = afterSpace.bytes - beforeSpace.bytes;
          if (delta > 0) {
            if (!taskSavingsMap[task.id]) {
              taskSavingsMap[task.id] = {
                name: t('task.' + task.id + '.name') || task.name || task.id,
                spaceSaved: 0,
              };
            }
            taskSavingsMap[task.id].spaceSaved += delta;
          }
        }
      } else {
        simpleTotalFail++;
        cleanupOk = false;
        const taskName = t('task.' + task.id + '.name') || task.name || task.id;
        const detail = (result.output || '').trim();
        cleanupErrors.push('[' + taskName + '] ' + (detail || 'Exit code ' + result.code));
        failedTasks.push({ name: taskName, distro, output: detail, code: result.code });
      }
    }
  }
  if (cleanupStepSub) cleanupStepSub.textContent = '';
  setSimpleStep('cleanup', cleanupOk ? 'done' : 'failed', cleanupErrors.join('\n'));

  // Step 3: Filesystem TRIM on each distro
  setSimpleStep('fstrim', 'active');
  const fstrimTask = TASKS.find(t => t.id === 'fstrim');
  let fstrimOk = true;
  const fstrimErrors = [];
  for (const distro of state.selectedDistros) {
    const beforeFstrim = await window.wslCleaner.getAvailableSpace(distro);
    const fstrimResult = await window.wslCleaner.runCleanup({
      distro,
      taskId: 'fstrim',
      command: fstrimTask.command,
      asRoot: fstrimTask.asRoot,
    });
    if (fstrimResult.ok) {
      const afterFstrim = await window.wslCleaner.getAvailableSpace(distro);
      if (beforeFstrim.ok && afterFstrim.ok) {
        const delta = afterFstrim.bytes - beforeFstrim.bytes;
        if (delta > 0) {
          if (!taskSavingsMap['fstrim']) {
            taskSavingsMap['fstrim'] = {
              name: t('task.fstrim.name') || 'Filesystem TRIM',
              spaceSaved: 0,
            };
          }
          taskSavingsMap['fstrim'].spaceSaved += delta;
        }
      }
    }
    if (!fstrimResult.ok) {
      fstrimOk = false;
      const detail = (fstrimResult.output || '').trim();
      fstrimErrors.push('[' + distro + '] ' + (detail || 'Exit code ' + fstrimResult.code));
    }
  }
  setSimpleStep('fstrim', fstrimOk ? 'done' : 'failed', fstrimErrors.join('\n'));

  // Steps 4-7 only run when compaction is enabled in Settings
  if (doCompact) {
    // Step 4: Shutdown WSL (once for all distros)
    setSimpleStep('shutdown', 'active');
    const shutdownRes = await window.wslCleaner.runWslCommand({ command: 'wsl --shutdown', taskId: 'cleaner' });
    setSimpleStep('shutdown', shutdownRes.ok ? 'done' : 'failed',
      shutdownRes.ok ? '' : (shutdownRes.output || '').trim());

    // Step 5: Update WSL
    setSimpleStep('update', 'active');
    const updateRes = await window.wslCleaner.runWslCommand({ command: 'wsl --update', taskId: 'cleaner' });
    setSimpleStep('update', updateRes.ok ? 'done' : 'failed',
      updateRes.ok ? '' : (updateRes.output || '').trim());

    // Step 6: Compact all VHDX files
    setSimpleStep('compact', 'active');
    await window.wslCleaner.runWslCommand({ command: 'wsl --shutdown', taskId: 'cleaner' });
    let compactOk = true;
    const compactErrors = [];
    for (const vf of state.vhdxFiles) {
      const compactRes = await window.wslCleaner.optimizeVhdx({ vhdxPath: vf.path, taskId: 'cleaner' });
      if (!compactRes.ok) {
        compactOk = false;
        compactErrors.push((compactRes.output || '').trim());
      }
    }
    setSimpleStep('compact', compactOk ? 'done' : 'failed', compactErrors.join('\n'));

    // Step 7: Restart each selected distro
    setSimpleStep('restart', 'active');
    let restartOk = true;
    const restartErrors = [];
    for (const distro of state.selectedDistros) {
      const restartRes = await window.wslCleaner.runWslCommand({ command: `wsl -d ${distro} -- echo "WSL restarted"`, taskId: 'cleaner' });
      if (!restartRes.ok) {
        restartOk = false;
        restartErrors.push('[' + distro + '] ' + (restartRes.output || '').trim());
      }
    }
    setSimpleStep('restart', restartOk ? 'done' : 'failed', restartErrors.join('\n'));
  }

  // Finalize progress UI
  stopElapsedTimer();
  if (simpleProgressFill) simpleProgressFill.style.width = '100%';
  if (progressHeader) progressHeader.querySelector('.orbital-spinner')?.classList.add('hidden');

  // Measure total VHDX size after
  let totalAfter = 0;
  for (const vf of state.vhdxFiles) {
    const res = await window.wslCleaner.getFileSize(vf.path);
    totalAfter += res.ok ? res.size : 0;
  }
  const saved = totalBefore - totalAfter;

  const durationMs = Date.now() - simpleStart;

  // Show results
  simpleSizeBefore.textContent = formatBytes(totalBefore);
  simpleSizeAfter.textContent = formatBytes(totalAfter);
  const compactHint = $('#result-compact-hint');
  if (!doCompact) {
    simpleSpaceSaved.textContent = '—';
    compactHint.classList.remove('hidden');
  } else {
    simpleSpaceSaved.textContent = saved > 0 ? formatBytes(saved) : t('result.noChange');
    compactHint.classList.add('hidden');
  }

  // Populate stats
  const durationSecs = Math.floor(durationMs / 1000);
  const durationM = Math.floor(durationSecs / 60);
  const durationS = durationSecs % 60;
  $('#result-tasks-run').textContent = simpleTotalRun;
  $('#result-tasks-ok').textContent = simpleTotalOk;
  $('#result-tasks-fail').textContent = simpleTotalFail;

  // Make fail stat clickable when there are failures
  const failBox = $('#result-fail-box');
  if (failedTasks.length > 0) {
    failBox.classList.add('has-failures');
    failBox._failedTasks = failedTasks;
  } else {
    failBox.classList.remove('has-failures');
    failBox._failedTasks = null;
  }

  $('#result-stale-found').textContent = simpleStaleFound;
  $('#result-stale-deleted').textContent = simpleStaleDeleted;
  $('#result-duration').textContent = durationM + ':' + String(durationS).padStart(2, '0');

  // Build per-task savings breakdown
  const taskSavings = Object.values(taskSavingsMap)
    .filter(t => t.spaceSaved > 0)
    .sort((a, b) => b.spaceSaved - a.spaceSaved);
  renderTaskBreakdownChart(taskSavings);

  // Hide steps, log panel, and show completion view
  simpleSteps.classList.add('hidden');
  if (cleanerLogSection) cleanerLogSection.classList.add('hidden');
  simpleResult.classList.remove('hidden');

  // Celebration effects
  if (saved > 0) playWhoosh();
  if (saved > 1_073_741_824) launchConfetti(); // > 1 GB

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
    durationMs,
    taskBreakdown: taskSavings,
  });

  state.isRunning = false;
  distroPickerBtn.disabled = false;
});

// ── "Clean Again" button restores the initial cleaner view ────────────────
$('#btn-clean-again').addEventListener('click', () => {
  // Destroy breakdown chart if it exists
  if (taskBreakdownChart) {
    taskBreakdownChart.destroy();
    taskBreakdownChart = null;
  }
  const breakdownEl = $('#result-breakdown');
  if (breakdownEl) breakdownEl.classList.add('hidden');

  // Hide completion view
  simpleResult.classList.add('hidden');

  // Restore initial elements
  const simpleHeroEl = document.querySelector('.simple-hero');
  if (simpleHeroEl) simpleHeroEl.classList.remove('hidden');
  const disclaimer = document.querySelector('.simple-disclaimer');
  if (disclaimer) disclaimer.classList.remove('hidden');
  btnSimpleGo.classList.remove('hidden');
  btnSimpleGo.disabled = false;
  simpleEstimate.classList.remove('hidden');

  // Reset step progress for next run
  resetSimpleSteps();
  if (progressHeader) {
    const spinner = progressHeader.querySelector('.orbital-spinner');
    if (spinner) spinner.classList.remove('hidden');
  }
});

// ── Failed tasks log modal ───────────────────────────────────────────────────
const failLogModal = $('#fail-log-modal');
const failLogList = $('#fail-log-list');
const failLogClose = $('#fail-log-close');

$('#result-fail-box').addEventListener('click', () => {
  const tasks = $('#result-fail-box')._failedTasks;
  if (!tasks || tasks.length === 0) return;

  failLogList.innerHTML = tasks.map(f => {
    const output = f.output
      ? `<pre class="fail-log-output">${f.output.replace(/</g, '&lt;')}</pre>`
      : '';
    const code = f.code != null ? `<span class="fail-log-code">Exit code ${f.code}</span>` : '';
    return `<div class="fail-log-item">
      <div class="fail-log-task">${f.name.replace(/</g, '&lt;')}</div>
      <div class="fail-log-distro">${f.distro.replace(/</g, '&lt;')} ${code}</div>
      ${output}
    </div>`;
  }).join('');

  failLogModal.classList.remove('hidden');
});

failLogClose.addEventListener('click', () => {
  failLogModal.classList.add('hidden');
});

failLogModal.addEventListener('click', (e) => {
  if (e.target === failLogModal) failLogModal.classList.add('hidden');
});

// ── Disk Map page ────────────────────────────────────────────────────────────

/**
 * Populate the disk map distro selector from current state.
 */
function populateDiskmapDistros() {
  diskmapDistroSelect.innerHTML = '';
  for (const d of state.distros) {
    const opt = document.createElement('option');
    opt.value = d.name;
    opt.textContent = d.name;
    if (state.selectedDistros.includes(d.name)) opt.selected = true;
    diskmapDistroSelect.appendChild(opt);
  }
}

/**
 * Render the Disk Map page: show cached treemap or empty state.
 */
function renderDiskMap() {
  populateDiskmapDistros();

  if (state.diskmapScanning) {
    diskmapEmpty.classList.add('hidden');
    diskmapScanning.classList.remove('hidden');
    diskmapTreemapEl.classList.add('hidden');
    return;
  }

  if (state.diskmapTree) {
    diskmapEmpty.classList.add('hidden');
    diskmapScanning.classList.add('hidden');
    diskmapTreemapEl.classList.remove('hidden');
    diskmapBreadcrumb.classList.remove('hidden');
    renderDiskmapBreadcrumbs();
    renderDiskmapTreemap();
  } else {
    diskmapEmpty.classList.remove('hidden');
    diskmapScanning.classList.add('hidden');
    diskmapTreemapEl.classList.add('hidden');
    diskmapBreadcrumb.classList.add('hidden');
    diskmapStatus.classList.add('hidden');
  }
}

/**
 * Build and render the treemap for the current drill-down path.
 */
function renderDiskmapTreemap() {
  const node = Treemap.findNode(state.diskmapTree, state.diskmapPath);
  if (!node) {
    // If drill-down path is invalid, reset to root
    state.diskmapPath = state.diskmapTree.path;
    renderDiskmapBreadcrumbs();
    Treemap.renderTreemap(diskmapTreemapEl, state.diskmapTree, {
      onDrillDown: diskmapDrillDown,
      formatSize: formatBytes,
    });
    return;
  }

  // Update status bar with total size
  diskmapStatus.classList.remove('hidden');
  diskmapStatus.textContent = t('diskmap.totalSize', { size: formatBytes(node.size) });

  Treemap.renderTreemap(diskmapTreemapEl, node, {
    onDrillDown: diskmapDrillDown,
    formatSize: formatBytes,
  });
}

/**
 * Handle drill-down: navigate into a directory in the treemap.
 */
function diskmapDrillDown(path) {
  const node = Treemap.findNode(state.diskmapTree, path);
  if (!node || node.children.length === 0) return;
  state.diskmapPath = path;
  renderDiskmapBreadcrumbs();
  renderDiskmapTreemap();
}

/**
 * Render clickable breadcrumb trail for the current drill-down path.
 */
function renderDiskmapBreadcrumbs() {
  diskmapBreadcrumb.innerHTML = '';

  const rootPath = state.diskmapTree ? state.diskmapTree.path : '/';
  const segments = [];

  // Always start with root
  segments.push({ label: t('diskmap.root'), path: rootPath });

  if (state.diskmapPath !== rootPath) {
    // Build intermediate segments
    const relativePart = state.diskmapPath.slice(rootPath.length);
    const parts = relativePart.split('/').filter(Boolean);
    let accumPath = rootPath;
    for (const part of parts) {
      accumPath = accumPath === '/' ? '/' + part : accumPath + '/' + part;
      segments.push({ label: part, path: accumPath });
    }
  }

  for (let i = 0; i < segments.length; i++) {
    if (i > 0) {
      const sep = document.createElement('span');
      sep.className = 'diskmap-breadcrumb-sep';
      sep.textContent = '\u203A'; // ›
      diskmapBreadcrumb.appendChild(sep);
    }

    const crumb = document.createElement('button');
    crumb.className = 'diskmap-breadcrumb-item';
    crumb.textContent = segments[i].label;
    if (i === segments.length - 1) {
      crumb.classList.add('active');
    } else {
      const targetPath = segments[i].path;
      crumb.addEventListener('click', () => {
        state.diskmapPath = targetPath;
        renderDiskmapBreadcrumbs();
        renderDiskmapTreemap();
      });
    }
    diskmapBreadcrumb.appendChild(crumb);
  }
}

/**
 * Start a disk usage scan for the selected distro.
 */
async function startDiskScan() {
  const distro = diskmapDistroSelect.value;
  if (!distro) return;

  const depth = parseInt(diskmapDepthSelect.value, 10) || 3;

  state.diskmapScanning = true;
  state.diskmapTree = null;
  state.diskmapPath = '/';

  btnDiskmapScan.classList.add('hidden');
  btnDiskmapCancel.classList.remove('hidden');
  diskmapEmpty.classList.add('hidden');
  diskmapTreemapEl.classList.add('hidden');
  diskmapBreadcrumb.classList.add('hidden');
  diskmapStatus.classList.add('hidden');
  diskmapScanning.classList.remove('hidden');

  try {
    const result = await window.wslCleaner.scanDiskUsage({ distro, targetPath: '/', maxDepth: depth });

    if (!state.diskmapScanning) return; // cancelled

    if (result.ok && result.data && result.data.length > 0) {
      state.diskmapTree = Treemap.buildTree(result.data);
      if (state.diskmapTree) {
        state.diskmapPath = state.diskmapTree.path;
      }
    } else {
      state.diskmapTree = null;
    }
  } catch {
    state.diskmapTree = null;
  }

  state.diskmapScanning = false;
  btnDiskmapScan.classList.remove('hidden');
  btnDiskmapCancel.classList.add('hidden');
  diskmapScanning.classList.add('hidden');

  if (state.diskmapTree) {
    diskmapTreemapEl.classList.remove('hidden');
    diskmapBreadcrumb.classList.remove('hidden');
    renderDiskmapBreadcrumbs();
    renderDiskmapTreemap();
  } else {
    diskmapEmpty.classList.remove('hidden');
    diskmapStatus.classList.remove('hidden');
    diskmapStatus.textContent = t('diskmap.scanFailed');
  }
}

/**
 * Cancel a running disk scan.
 */
function cancelDiskScan() {
  state.diskmapScanning = false;
  window.wslCleaner.cancelDiskScan();
  btnDiskmapScan.classList.remove('hidden');
  btnDiskmapCancel.classList.add('hidden');
  diskmapScanning.classList.add('hidden');
  diskmapEmpty.classList.remove('hidden');
}

// Wire disk map buttons
btnDiskmapScan.addEventListener('click', startDiskScan);
btnDiskmapCancel.addEventListener('click', cancelDiskScan);

// Re-render treemap on window resize (debounced)
let _diskmapResizeTimer = null;
window.addEventListener('resize', () => {
  if (state.currentPage !== 'diskmap' || !state.diskmapTree) return;
  clearTimeout(_diskmapResizeTimer);
  _diskmapResizeTimer = setTimeout(() => {
    renderDiskmapTreemap();
  }, 200);
});

// ── Stats page ───────────────────────────────────────────────────────────────

const statTotalSaved = $('#stat-total-saved');
const statTotalCleanups = $('#stat-total-cleanups');
const statAvgSaved = $('#stat-avg-saved');
const statLastCleanup = $('#stat-last-cleanup');
const statStreak = $('#stat-streak');
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

// ── Task breakdown chart (results screen) ─────────────────────────────────────

let taskBreakdownChart = null;

/**
 * Render a horizontal bar chart showing per-task space savings on the results screen.
 * @param {Array<{ name: string, spaceSaved: number }>} taskSavings - sorted descending
 */
function renderTaskBreakdownChart(taskSavings) {
  const container = $('#result-breakdown');
  const canvas = $('#chart-task-breakdown');
  const emptyMsg = $('#result-breakdown-empty');

  if (taskBreakdownChart) {
    taskBreakdownChart.destroy();
    taskBreakdownChart = null;
  }

  if (!taskSavings || taskSavings.length === 0) {
    container.classList.remove('hidden');
    canvas.parentElement.style.display = 'none';
    emptyMsg.classList.remove('hidden');
    return;
  }

  container.classList.remove('hidden');
  canvas.parentElement.style.display = '';
  emptyMsg.classList.add('hidden');

  // Dynamic height: 36px per bar, minimum 200px
  const chartHeight = Math.max(200, taskSavings.length * 36 + 60);
  canvas.parentElement.style.height = chartHeight + 'px';

  createChartDefaults();
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
  gradient.addColorStop(0, 'rgba(0, 212, 170, 0.3)');
  gradient.addColorStop(1, 'rgba(0, 212, 170, 0.8)');

  taskBreakdownChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: taskSavings.map(t => t.name),
      datasets: [{
        label: t('result.breakdownLabel'),
        data: taskSavings.map(t => t.spaceSaved),
        backgroundColor: gradient,
        borderColor: chartColors.accent,
        borderWidth: 1,
        borderRadius: 4,
        borderSkipped: false,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1c1c30',
          borderColor: chartColors.border,
          borderWidth: 1,
          titleColor: '#e8e8f0',
          bodyColor: chartColors.text,
          padding: 12,
          callbacks: {
            label: (context) => t('chart.saved', { value: formatBytes(context.parsed.x) }),
          },
        },
      },
      scales: {
        x: {
          grid: { color: chartColors.gridLine, drawBorder: false },
          ticks: {
            color: chartColors.textMuted,
            callback: (val) => formatBytes(val),
          },
        },
        y: {
          grid: { display: false },
          ticks: {
            color: chartColors.text,
            font: { size: 11 },
          },
        },
      },
    },
  });
}

// ── Stats page charts ─────────────────────────────────────────────────────────

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

/**
 * Compute consecutive weekly cleanup streak.
 * A "streak week" = at least one cleanup in that ISO week.
 * Counts backwards from the current week.
 */
function computeStreak(history) {
  if (history.length === 0) return 0;

  // Build a Set of "year-week" strings for all sessions
  function isoWeekKey(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    // Thursday in current week decides the year
    d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
    const jan4 = new Date(d.getFullYear(), 0, 4);
    const week = 1 + Math.round(((d - jan4) / 86400000 - 3 + ((jan4.getDay() + 6) % 7)) / 7);
    return `${d.getFullYear()}-W${week}`;
  }

  const weeks = new Set();
  for (const r of history) {
    weeks.add(isoWeekKey(r.timestamp));
  }

  // Walk backwards from current week
  let streak = 0;
  const cursor = new Date();
  for (let i = 0; i < 200; i++) { // cap at ~4 years
    const key = isoWeekKey(cursor);
    if (weeks.has(key)) {
      streak++;
      cursor.setDate(cursor.getDate() - 7);
    } else {
      break;
    }
  }
  return streak;
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

  // Cleanup streak
  if (statStreak) {
    const streak = computeStreak(history);
    if (streak > 0) {
      statStreak.textContent = tp('stats.streakWeeks', streak, { count: streak });
    } else {
      statStreak.textContent = t('stats.streakNone');
    }
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

// Sound toggle
if (soundEnabledCb) {
  soundEnabledCb.addEventListener('change', (e) => {
    state.soundEnabled = e.target.checked;
    saveTaskPreferences();
  });
}

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

  // Start WSL check immediately (runs in parallel with the splash animation)
  const wslCheckPromise = window.wslCleaner.checkWsl();

  // Show "Detecting WSL 2..." inside splash after the tagline finishes animating
  await new Promise(resolve => setTimeout(resolve, 1800));
  splashDetecting.classList.remove('hidden');

  // Now await WSL check result (may already be resolved)
  const wslCheck = await wslCheckPromise;

  if (!wslCheck.ok) {
    splashEl.classList.add('fade-out');
    await new Promise(resolve => setTimeout(resolve, 500));
    splashEl.classList.add('hidden');
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
      } else if (key === '_soundEnabled') {
        state.soundEnabled = !!value;
      } else if (key === '_trayEnabled') {
        state.trayEnabled = !!value;
      } else if (key === '_trayCloseToTray') {
        state.trayCloseToTray = !!value;
      } else if (key === '_trayInterval') {
        state.trayInterval = Math.max(10, Math.min(600, parseInt(value, 10) || 60));
      } else if (key === '_trayDistro') {
        state.trayDistro = value || '';
      } else if (key === '_alertsEnabled') {
        state.alertsEnabled = !!value;
      } else if (key === '_alertCooldown') {
        state.alertCooldown = Math.max(5, Math.min(1440, parseInt(value, 10) || 30));
      } else if (key === '_alertVhdxSize') {
        state.alerts.vhdxSize.enabled = !!value;
      } else if (key === '_alertVhdxSizeThreshold') {
        state.alerts.vhdxSize.threshold = parseInt(value, 10) || 60;
      } else if (key === '_alertMemoryHigh') {
        state.alerts.memoryHigh.enabled = !!value;
      } else if (key === '_alertMemoryHighThreshold') {
        state.alerts.memoryHigh.threshold = parseInt(value, 10) || 80;
      } else if (key === '_alertDockerSpace') {
        state.alerts.dockerSpace.enabled = !!value;
      } else if (key === '_alertDockerSpaceThreshold') {
        state.alerts.dockerSpace.threshold = parseInt(value, 10) || 10;
      } else if (key === '_alertZombies') {
        state.alerts.zombies.enabled = !!value;
      } else if (key === '_alertZombiesThreshold') {
        state.alerts.zombies.threshold = parseInt(value, 10) || 1;
      } else if (key === '_alertSystemdFail') {
        state.alerts.systemdFail.enabled = !!value;
      } else if (key === '_alertSystemdFailThreshold') {
        state.alerts.systemdFail.threshold = parseInt(value, 10) || 1;
      } else if (key === '_alertDnsBroken') {
        state.alerts.dnsBroken.enabled = !!value;
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
  if (soundEnabledCb) soundEnabledCb.checked = state.soundEnabled;

  // Update Cleaner page button label to match compact setting
  if (btnSimpleGoLabel) {
    btnSimpleGoLabel.innerHTML = state.compactEnabled ? t('simple.cleanCompact') : t('simple.clean');
  }
  applyCleanOnlyVisibility(!state.compactEnabled);

  renderDistroPicker();
  await refreshDistroData();

  // Restore last page from localStorage
  switchPage(state.currentPage);

  // Fade out splash only when everything is ready
  splashEl.classList.add('fade-out');
  await new Promise(resolve => setTimeout(resolve, 500));
  splashEl.classList.add('hidden');

  showScreen(mainScreen);
}

// Listen for notification clicks to navigate to relevant page
window.wslCleaner.onNotificationNavigate((page) => {
  switchPage(page);
});

// Listen for tray stats updates to refresh preview
window.wslCleaner.onTrayStatsUpdated((snapshot) => {
  if (state.currentPage === 'tray') updateTrayPreview(snapshot);
});

init();

// ── Tray & Alerts Page ────────────────────────────────────────────────────

const ALERT_TYPES = [
  { id: 'vhdxSize',    defaultThreshold: 60,  min: 1,   max: 500 },
  { id: 'memoryHigh',  defaultThreshold: 80,  min: 10,  max: 99  },
  { id: 'dockerSpace', defaultThreshold: 10,  min: 1,   max: 100 },
  { id: 'zombies',     defaultThreshold: 1,   min: 1,   max: 50  },
  { id: 'systemdFail', defaultThreshold: 1,   min: 1,   max: 20  },
  { id: 'dnsBroken',   defaultThreshold: 0,   min: 0,   max: 0,  noThreshold: true },
];

function saveTrayPreferences() {
  const trayPrefs = {
    _trayEnabled: state.trayEnabled,
    _trayCloseToTray: state.trayCloseToTray,
    _trayInterval: state.trayInterval,
    _trayDistro: state.trayDistro,
    _alertsEnabled: state.alertsEnabled,
    _alertCooldown: state.alertCooldown,
    _alertVhdxSize: state.alerts.vhdxSize.enabled,
    _alertVhdxSizeThreshold: state.alerts.vhdxSize.threshold,
    _alertMemoryHigh: state.alerts.memoryHigh.enabled,
    _alertMemoryHighThreshold: state.alerts.memoryHigh.threshold,
    _alertDockerSpace: state.alerts.dockerSpace.enabled,
    _alertDockerSpaceThreshold: state.alerts.dockerSpace.threshold,
    _alertZombies: state.alerts.zombies.enabled,
    _alertZombiesThreshold: state.alerts.zombies.threshold,
    _alertSystemdFail: state.alerts.systemdFail.enabled,
    _alertSystemdFailThreshold: state.alerts.systemdFail.threshold,
    _alertDnsBroken: state.alerts.dnsBroken.enabled,
  };
  window.wslCleaner.saveTrayPreferences(trayPrefs);
}

function renderTrayPage() {
  const trayEnabledCb = $('#tray-enabled-cb');
  const trayCloseToTrayCb = $('#tray-close-to-tray-cb');
  const trayIntervalInput = $('#tray-interval-input');
  const trayDistroSelect = $('#tray-distro-select');
  const alertsEnabledCb = $('#alerts-enabled-cb');
  const alertCooldownInput = $('#alert-cooldown-input');
  const alertCardsEl = $('#alert-cards');

  // Populate distro dropdown
  trayDistroSelect.innerHTML = '';
  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = t('tray.defaultDistro') || '(Default)';
  trayDistroSelect.appendChild(defaultOpt);
  for (const d of state.distros) {
    const opt = document.createElement('option');
    opt.value = d.name;
    opt.textContent = d.name;
    trayDistroSelect.appendChild(opt);
  }

  // Set current values
  trayEnabledCb.checked = state.trayEnabled;
  trayCloseToTrayCb.checked = state.trayCloseToTray;
  trayIntervalInput.value = state.trayInterval;
  trayDistroSelect.value = state.trayDistro;
  alertsEnabledCb.checked = state.alertsEnabled;
  alertCooldownInput.value = state.alertCooldown;

  // Enable/disable dependent controls
  const trayDeps = [trayCloseToTrayCb, trayIntervalInput, trayDistroSelect];
  trayDeps.forEach(el => el.disabled = !state.trayEnabled);

  const alertDeps = [alertCooldownInput];
  alertDeps.forEach(el => el.disabled = !state.alertsEnabled);

  // Render alert cards
  renderAlertCards(alertCardsEl);

  // Remove old listeners by cloning
  const newTrayEnabledCb = trayEnabledCb.cloneNode(true);
  trayEnabledCb.parentNode.replaceChild(newTrayEnabledCb, trayEnabledCb);
  newTrayEnabledCb.checked = state.trayEnabled;

  const newCloseToTrayCb = trayCloseToTrayCb.cloneNode(true);
  trayCloseToTrayCb.parentNode.replaceChild(newCloseToTrayCb, trayCloseToTrayCb);
  newCloseToTrayCb.checked = state.trayCloseToTray;
  newCloseToTrayCb.disabled = !state.trayEnabled;

  const newAlertsEnabledCb = alertsEnabledCb.cloneNode(true);
  alertsEnabledCb.parentNode.replaceChild(newAlertsEnabledCb, alertsEnabledCb);
  newAlertsEnabledCb.checked = state.alertsEnabled;

  // Wire event listeners
  newTrayEnabledCb.addEventListener('change', () => {
    state.trayEnabled = newTrayEnabledCb.checked;
    trayDeps.forEach(el => el.disabled = !state.trayEnabled);
    saveTrayPreferences();
  });

  newCloseToTrayCb.addEventListener('change', () => {
    state.trayCloseToTray = newCloseToTrayCb.checked;
    saveTrayPreferences();
  });

  trayIntervalInput.addEventListener('change', () => {
    state.trayInterval = Math.max(10, Math.min(600, parseInt(trayIntervalInput.value, 10) || 60));
    trayIntervalInput.value = state.trayInterval;
    saveTrayPreferences();
  });

  trayDistroSelect.addEventListener('change', () => {
    state.trayDistro = trayDistroSelect.value;
    saveTrayPreferences();
  });

  newAlertsEnabledCb.addEventListener('change', () => {
    state.alertsEnabled = newAlertsEnabledCb.checked;
    alertDeps.forEach(el => el.disabled = !state.alertsEnabled);
    // Dim/undim alert cards
    alertCardsEl.querySelectorAll('.alert-card').forEach(card => {
      card.classList.toggle('disabled', !state.alertsEnabled);
    });
    saveTrayPreferences();
  });

  alertCooldownInput.addEventListener('change', () => {
    state.alertCooldown = Math.max(5, Math.min(1440, parseInt(alertCooldownInput.value, 10) || 30));
    alertCooldownInput.value = state.alertCooldown;
    saveTrayPreferences();
  });

  // Fetch latest stats for preview
  window.wslCleaner.getTrayLatestStats().then(snapshot => {
    updateTrayPreview(snapshot);
  }).catch(() => {});
}

function renderAlertCards(container) {
  container.innerHTML = '';

  for (const alertType of ALERT_TYPES) {
    const alertState = state.alerts[alertType.id];
    const card = document.createElement('div');
    card.className = 'alert-card' + (state.alertsEnabled ? '' : ' disabled');
    card.dataset.alert = alertType.id;

    let thresholdHtml = '';
    if (!alertType.noThreshold) {
      thresholdHtml = `
        <div class="alert-card-threshold">
          <input type="number" class="stale-days-input" data-alert-threshold="${alertType.id}"
                 value="${alertState.threshold}" min="${alertType.min}" max="${alertType.max}" />
          <span data-i18n="alerts.${alertType.id}.unit"></span>
        </div>`;
    }

    card.innerHTML = `
      <label class="toggle" onclick="event.stopPropagation()">
        <input type="checkbox" data-alert-toggle="${alertType.id}" ${alertState.enabled ? 'checked' : ''} />
        <span class="toggle-slider"></span>
      </label>
      <div class="alert-card-info">
        <div class="alert-card-title" data-i18n="alerts.${alertType.id}.title"></div>
        <div class="alert-card-desc" data-i18n="alerts.${alertType.id}.desc"></div>
      </div>
      ${thresholdHtml}`;

    // Wire toggle
    const toggle = card.querySelector(`[data-alert-toggle="${alertType.id}"]`);
    toggle.addEventListener('change', () => {
      state.alerts[alertType.id].enabled = toggle.checked;
      saveTrayPreferences();
    });

    // Wire threshold input
    if (!alertType.noThreshold) {
      const threshInput = card.querySelector(`[data-alert-threshold="${alertType.id}"]`);
      threshInput.addEventListener('change', () => {
        const val = parseInt(threshInput.value, 10);
        state.alerts[alertType.id].threshold = Math.max(alertType.min, Math.min(alertType.max, val || alertType.defaultThreshold));
        threshInput.value = state.alerts[alertType.id].threshold;
        saveTrayPreferences();
      });
    }

    container.appendChild(card);
  }

  // Apply i18n to newly created elements
  applyI18n(container);
}

function updateTrayPreview(snapshot) {
  const previewEl = $('#tray-preview-tooltip');
  if (!previewEl) return;

  if (!snapshot || !snapshot.health) {
    previewEl.textContent = t('tray.previewEmpty') || 'Enable tray mode to see a live preview.';
    return;
  }

  const parts = ['WSL Cleaner'];
  const h = snapshot.health;
  const vhdx = snapshot.vhdx;

  if (vhdx && vhdx.length > 0) {
    const totalSize = vhdx.reduce((sum, v) => sum + v.size, 0);
    parts.push('Disk: ' + formatBytes(totalSize));
  }

  if (h.memory && h.memory.total > 0) {
    const usedPercent = Math.round(
      ((h.memory.total - h.memory.available) / h.memory.total) * 100
    );
    parts.push('RAM: ' + usedPercent + '%');
  }

  if (h.docker) {
    parts.push(h.docker.total + ' containers');
  }

  previewEl.textContent = parts.join(' | ');
}

// ── Health Dashboard ──────────────────────────────────────────────────────

const healthDistroSelect = document.getElementById('health-distro');
const healthContent = document.getElementById('health-content');
const healthLoading = document.getElementById('health-loading');
const healthEmpty = document.getElementById('health-empty');
const healthError = document.getElementById('health-error');
const healthErrorMsg = document.getElementById('health-error-msg');
const btnHealthRefresh = document.getElementById('btn-health-refresh');

let _healthRefreshTimer = null;

function populateHealthDistros() {
  healthDistroSelect.innerHTML = '';
  for (const d of state.distros) {
    const opt = document.createElement('option');
    opt.value = d.name;
    opt.textContent = d.name;
    if (state.selectedDistros.includes(d.name)) opt.selected = true;
    healthDistroSelect.appendChild(opt);
  }
}

function showHealthState(which) {
  healthContent.classList.add('hidden');
  healthLoading.classList.add('hidden');
  healthEmpty.classList.add('hidden');
  healthError.classList.add('hidden');
  if (which === 'content') healthContent.classList.remove('hidden');
  else if (which === 'loading') healthLoading.classList.remove('hidden');
  else if (which === 'empty') healthEmpty.classList.remove('hidden');
  else if (which === 'error') healthError.classList.remove('hidden');
}

async function renderHealthPage() {
  populateHealthDistros();

  const distro = healthDistroSelect.value;
  if (!distro) {
    showHealthState('empty');
    return;
  }

  showHealthState('loading');

  try {
    const result = await window.wslCleaner.getHealthInfo(distro);
    if (!result.ok) {
      console.error('[Health] Backend error:', result.error);
      healthErrorMsg.textContent = t('health.error') + (result.error ? '\n' + result.error : '');
      showHealthState('error');
      return;
    }
    populateHealthData(result.data);
    showHealthState('content');
  } catch (err) {
    console.error('[Health] Exception:', err);
    healthErrorMsg.textContent = t('health.error') + '\n' + (err.message || String(err));
    showHealthState('error');
  }
}

function populateHealthData(data) {
  // Summary cards
  const kernelEl = document.getElementById('health-kernel');
  const uptimeEl = document.getElementById('health-uptime');
  const cpuLoadEl = document.getElementById('health-cpu-load');
  const memSummaryEl = document.getElementById('health-mem-summary');

  kernelEl.textContent = data.kernel;
  uptimeEl.textContent = data.uptime.formatted;
  cpuLoadEl.textContent = data.cpu.load1.toFixed(2) + ' / ' + data.cpu.cores + ' ' + t('health.cores');
  const memUsedPct = data.memory.total > 0 ? Math.round((data.memory.used / data.memory.total) * 100) : 0;
  memSummaryEl.textContent = memUsedPct + '%';

  // Memory bars
  const ramBar = document.getElementById('health-ram-bar');
  const ramText = document.getElementById('health-ram-text');
  const swapBar = document.getElementById('health-swap-bar');
  const swapText = document.getElementById('health-swap-text');

  const ramPct = data.memory.total > 0 ? Math.round((data.memory.used / data.memory.total) * 100) : 0;
  ramBar.style.width = ramPct + '%';
  ramBar.className = 'health-bar-fill' + (ramPct > 90 ? ' danger' : ramPct > 70 ? ' warning' : '');
  ramText.textContent = formatBytes(data.memory.used) + ' / ' + formatBytes(data.memory.total) + ' (' + ramPct + '%)';

  const swapPct = data.memory.swapTotal > 0 ? Math.round((data.memory.swapUsed / data.memory.swapTotal) * 100) : 0;
  swapBar.style.width = swapPct + '%';
  swapBar.className = 'health-bar-fill' + (swapPct > 90 ? ' danger' : swapPct > 70 ? ' warning' : '');
  if (data.memory.swapTotal > 0) {
    swapText.textContent = formatBytes(data.memory.swapUsed) + ' / ' + formatBytes(data.memory.swapTotal) + ' (' + swapPct + '%)';
  } else {
    swapText.textContent = t('health.noSwap');
  }

  // Disk bar
  const diskBar = document.getElementById('health-disk-bar');
  const diskText = document.getElementById('health-disk-text');

  const diskPct = data.disk.total > 0 ? Math.round((data.disk.used / data.disk.total) * 100) : 0;
  diskBar.style.width = diskPct + '%';
  diskBar.className = 'health-bar-fill' + (diskPct > 90 ? ' danger' : diskPct > 70 ? ' warning' : '');
  diskText.textContent = formatBytes(data.disk.used) + ' / ' + formatBytes(data.disk.total) + ' (' + data.disk.percent + ')';

  // Network table
  const netBody = document.getElementById('health-network-body');
  const netEmpty = document.getElementById('health-network-empty');
  const netTable = document.getElementById('health-network-table');
  netBody.innerHTML = '';

  if (data.network.length === 0) {
    netTable.classList.add('hidden');
    netEmpty.classList.remove('hidden');
  } else {
    netTable.classList.remove('hidden');
    netEmpty.classList.add('hidden');
    for (const iface of data.network) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td>' + escapeHtml(iface.iface) + '</td><td>' + formatBytes(iface.rxBytes) + '</td><td>' + formatBytes(iface.txBytes) + '</td>';
      netBody.appendChild(tr);
    }
  }

  // ── OS Release banner ──
  const osBanner = document.getElementById('health-os-banner');
  const osName = document.getElementById('health-os-name');
  if (data.osRelease && data.osRelease.name !== 'Unknown') {
    osName.textContent = data.osRelease.name;
    osBanner.classList.remove('hidden');
  } else {
    osBanner.classList.add('hidden');
  }

  // ── WSL memory limit (.wslconfig) ──
  const wslconfigRow = document.getElementById('health-wslconfig-row');
  const wslconfigText = document.getElementById('health-wslconfig-text');
  if (data.wslconfig) {
    const parts = [];
    if (data.wslconfig.memory) parts.push(t('health.wslMemLimit') + ': ' + data.wslconfig.memory);
    if (data.wslconfig.swap) parts.push(t('health.wslSwapLimit') + ': ' + data.wslconfig.swap);
    if (parts.length > 0) {
      wslconfigText.textContent = parts.join('  |  ');
      wslconfigRow.classList.remove('hidden');
    } else {
      wslconfigRow.classList.add('hidden');
    }
  } else {
    wslconfigText.textContent = t('health.noWslConfig');
    wslconfigRow.classList.remove('hidden');
  }

  // ── Listening Ports ──
  const portsBody = document.getElementById('health-ports-body');
  const portsEmpty = document.getElementById('health-ports-empty');
  const portsTable = document.getElementById('health-ports-table');
  portsBody.innerHTML = '';

  if (!data.ports || data.ports.length === 0) {
    portsTable.classList.add('hidden');
    portsEmpty.classList.remove('hidden');
  } else {
    portsTable.classList.remove('hidden');
    portsEmpty.classList.add('hidden');
    for (const port of data.ports) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td>' + escapeHtml(port.proto) + '</td><td>' + escapeHtml(port.addr) + '</td><td>' + escapeHtml(port.process) + '</td>';
      portsBody.appendChild(tr);
    }
  }

  // ── DNS Status ──
  const dnsStatus = document.getElementById('health-dns-status');
  const dnsServer = document.getElementById('health-dns-server');
  if (data.dns) {
    if (data.dns.ok) {
      dnsStatus.innerHTML = '<span class="health-status-dot health-status-ok"></span> ' + t('health.dnsOk');
    } else {
      dnsStatus.innerHTML = '<span class="health-status-dot health-status-fail"></span> ' + t('health.dnsFail');
    }
    dnsServer.textContent = data.dns.server || '--';
  }

  // ── I/O Pressure ──
  const ioCard = document.getElementById('health-io-card');
  const ioEmpty = document.getElementById('health-io-empty');
  const ioSomeBar = document.getElementById('health-io-some-bar');
  const ioSomeText = document.getElementById('health-io-some-text');
  const ioFullBar = document.getElementById('health-io-full-bar');
  const ioFullText = document.getElementById('health-io-full-text');

  if (data.ioPressure) {
    ioEmpty.classList.add('hidden');
    ioSomeBar.parentElement.parentElement.style.display = '';
    ioFullBar.parentElement.parentElement.style.display = '';

    const somePct = Math.min(100, data.ioPressure.some10);
    ioSomeBar.style.width = somePct + '%';
    ioSomeBar.className = 'health-bar-fill' + (somePct > 50 ? ' danger' : somePct > 20 ? ' warning' : '');
    ioSomeText.textContent = data.ioPressure.some10.toFixed(1) + '% (10s) / ' + data.ioPressure.some60.toFixed(1) + '% (60s)';

    const fullPct = Math.min(100, data.ioPressure.full10);
    ioFullBar.style.width = fullPct + '%';
    ioFullBar.className = 'health-bar-fill' + (fullPct > 50 ? ' danger' : fullPct > 20 ? ' warning' : '');
    ioFullText.textContent = data.ioPressure.full10.toFixed(1) + '% (10s) / ' + data.ioPressure.full60.toFixed(1) + '% (60s)';
  } else {
    ioSomeBar.parentElement.parentElement.style.display = 'none';
    ioFullBar.parentElement.parentElement.style.display = 'none';
    ioEmpty.classList.remove('hidden');
  }

  // ── Zombies ──
  const zombieBadge = document.getElementById('health-zombie-badge');
  const zombieBody = document.getElementById('health-zombie-body');
  const zombieTable = document.getElementById('health-zombie-table');
  const zombieEmpty = document.getElementById('health-zombie-empty');
  zombieBody.innerHTML = '';
  zombieBadge.textContent = data.zombies ? data.zombies.length : 0;
  zombieBadge.className = 'health-badge' + ((data.zombies && data.zombies.length > 0) ? ' health-badge-warn' : '');

  if (!data.zombies || data.zombies.length === 0) {
    zombieTable.classList.add('hidden');
    zombieEmpty.classList.remove('hidden');
  } else {
    zombieTable.classList.remove('hidden');
    zombieEmpty.classList.add('hidden');
    for (const z of data.zombies) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td>' + z.pid + '</td><td>' + escapeHtml(z.user) + '</td><td>' + escapeHtml(z.command) + '</td>';
      zombieBody.appendChild(tr);
    }
  }

  // ── Docker ──
  const dockerCard = document.getElementById('health-docker-card');
  if (data.docker) {
    dockerCard.classList.remove('hidden');
    document.getElementById('health-docker-running').textContent = data.docker.running;
    document.getElementById('health-docker-stopped').textContent = data.docker.stopped;
    document.getElementById('health-docker-total').textContent = data.docker.total;
  } else {
    dockerCard.classList.add('hidden');
  }

  // ── Systemd ──
  const systemdCard = document.getElementById('health-systemd-card');
  if (data.systemd) {
    systemdCard.classList.remove('hidden');
    const badge = document.getElementById('health-systemd-badge');
    const summaryEl = document.getElementById('health-systemd-summary');
    const failedSection = document.getElementById('health-systemd-failed');
    const failedList = document.getElementById('health-systemd-failed-list');

    const isOk = data.systemd.state === 'running';
    const stateClass = isOk ? 'health-status-ok' : 'health-status-fail';
    badge.textContent = data.systemd.state;
    badge.className = 'health-badge' + (isOk ? '' : ' health-badge-warn');

    // Summary explanation
    const ignoredNote = data.systemd.ignoredCount > 0
      ? ' ' + t('health.systemdIgnored', { count: data.systemd.ignoredCount })
      : '';
    if (isOk) {
      summaryEl.innerHTML = '<span class="health-status-dot health-status-ok"></span> ' +
        t('health.systemdRunning') + ignoredNote;
    } else if (data.systemd.state === 'degraded') {
      summaryEl.innerHTML = '<span class="health-status-dot health-status-fail"></span> ' +
        t('health.systemdDegraded', { count: data.systemd.failedUnits.length }) + ignoredNote;
    } else {
      summaryEl.innerHTML = '<span class="health-status-dot health-status-fail"></span> ' +
        t('health.systemdState') + ': ' + escapeHtml(data.systemd.state) + ignoredNote;
    }

    if (data.systemd.failedUnits.length > 0) {
      failedSection.classList.remove('hidden');
      failedList.innerHTML = data.systemd.failedUnits.map(u => {
        let html = '<div class="health-failed-unit-card">';
        html += '<div class="health-failed-unit-header">';
        html += '<span class="health-status-dot health-status-fail"></span> ';
        html += '<strong>' + escapeHtml(u.name) + '</strong>';
        html += '</div>';
        if (u.desc) {
          html += '<div class="health-failed-unit-desc">' + escapeHtml(u.desc) + '</div>';
        }
        // Detail row: result, exit code, when
        const details = [];
        if (u.result && u.result !== 'success') {
          details.push(t('health.systemdResult') + ': <code>' + escapeHtml(u.result) + '</code>');
        }
        if (u.exitCode && u.exitCode !== '0') {
          details.push(t('health.systemdExitCode') + ': <code>' + escapeHtml(u.exitCode) + '</code>');
        }
        if (u.failedAt) {
          details.push(t('health.systemdFailedAt') + ': ' + escapeHtml(u.failedAt));
        }
        if (details.length > 0) {
          html += '<div class="health-failed-unit-details">' + details.join(' &nbsp;·&nbsp; ') + '</div>';
        }
        // Actionable hint
        if (u.name) {
          html += '<div class="health-failed-unit-hint">' +
            t('health.systemdHint', { unit: u.name }) + '</div>';
        }
        html += '</div>';
        return html;
      }).join('');
    } else {
      failedSection.classList.add('hidden');
    }
  } else {
    systemdCard.classList.add('hidden');
  }

  // ── System Info ──
  const packagesEl = document.getElementById('health-packages');
  packagesEl.textContent = data.packages != null ? data.packages.toLocaleString() : '--';

  const gpuEl = document.getElementById('health-gpu');
  if (data.gpu && data.gpu.available) {
    const gpuText = data.gpu.name + (data.gpu.vram ? ' (' + data.gpu.vram + ')' : '');
    gpuEl.innerHTML = '<span class="health-status-dot health-status-ok"></span> ' + escapeHtml(gpuText);
  } else {
    gpuEl.innerHTML = '<span class="health-status-dot health-status-fail"></span> ' + t('health.gpuNone');
  }

  const interopEl = document.getElementById('health-interop');
  if (data.interop) {
    interopEl.innerHTML = '<span class="health-status-dot health-status-ok"></span> ' + t('health.interopOn');
  } else {
    interopEl.innerHTML = '<span class="health-status-dot health-status-fail"></span> ' + t('health.interopOff');
  }
}

function startHealthAutoRefresh() {
  stopHealthAutoRefresh();
  _healthRefreshTimer = setInterval(() => {
    if (state.currentPage === 'health' && healthDistroSelect.value) {
      refreshHealthSilent();
    }
  }, 10000);
}

function stopHealthAutoRefresh() {
  if (_healthRefreshTimer) {
    clearInterval(_healthRefreshTimer);
    _healthRefreshTimer = null;
  }
}

/** Silent refresh — doesn't show the loading spinner (avoids flicker). */
async function refreshHealthSilent() {
  const distro = healthDistroSelect.value;
  if (!distro) return;

  try {
    const result = await window.wslCleaner.getHealthInfo(distro);
    if (result.ok && state.currentPage === 'health') {
      populateHealthData(result.data);
      showHealthState('content');
    }
  } catch (err) {
    console.error('[Health] Auto-refresh error:', err);
  }
}

btnHealthRefresh.addEventListener('click', () => renderHealthPage());

healthDistroSelect.addEventListener('change', () => renderHealthPage());

// ── Distros page ──────────────────────────────────────────────────────────

const distrosTableContainer = document.getElementById('distros-table-container');
const distrosLoading = document.getElementById('distros-loading');
const distrosEmpty = document.getElementById('distros-empty');
const distrosLog = document.getElementById('distros-log');
const distrosImportSection = document.getElementById('distros-import-section');
const distrosLogSection = document.getElementById('distros-log-section');
const btnDistrosRefresh = document.getElementById('btn-distros-refresh');

let _distrosRefreshTimer = null;
let _distrosOutputCleanup = null;
let _distrosBusy = false;

function showDistrosState(which) {
  distrosTableContainer.classList.add('hidden');
  distrosLoading.classList.add('hidden');
  distrosEmpty.classList.add('hidden');
  if (which === 'table') distrosTableContainer.classList.remove('hidden');
  else if (which === 'loading') distrosLoading.classList.remove('hidden');
  else if (which === 'empty') distrosEmpty.classList.remove('hidden');
}

function appendDistrosLog(text) {
  distrosLog.textContent += text;
  distrosLog.scrollTop = distrosLog.scrollHeight;
}

function setupDistrosOutputStream() {
  if (_distrosOutputCleanup) _distrosOutputCleanup();
  _distrosOutputCleanup = window.wslCleaner.onTaskOutput((data) => {
    if (data.taskId && data.taskId.startsWith('distro-')) {
      appendDistrosLog(data.text);
    }
  });
}

async function renderDistrosPage() {
  setupDistrosOutputStream();

  // Refresh distro list so state (Running/Stopped) is current
  try {
    const wslResult = await window.wslCleaner.checkWsl();
    if (wslResult.ok) {
      state.distros = wslResult.distros;
      // Keep selected distros in sync (remove any that no longer exist)
      const names = wslResult.distros.map(d => d.name);
      state.selectedDistros = state.selectedDistros.filter(n => names.includes(n));
      if (state.selectedDistros.length === 0 && wslResult.distros.length > 0) {
        state.selectedDistros = [wslResult.distros[0].name];
      }
    }
  } catch { /* use cached state.distros */ }

  if (state.distros.length === 0) {
    showDistrosState('empty');
    return;
  }

  showDistrosState('loading');

  try {
    // Fetch comparison data and VHDX info in parallel
    const distroNames = state.distros.map(d => d.name);
    const [comparisonData, vhdxFiles] = await Promise.all([
      window.wslCleaner.getDistroComparison(distroNames),
      window.wslCleaner.findVhdx(),
    ]);

    renderDistroTable(comparisonData, vhdxFiles);
    showDistrosState('table');
  } catch (err) {
    console.error('[Distros] Error:', err);
    showDistrosState('empty');
  }
}

function renderDistroTable(comparisonData, vhdxFiles) {
  // Build a lookup for comparison data
  const compareMap = {};
  for (const c of comparisonData) {
    compareMap[c.distro] = c;
  }

  // Build table
  let html = '<table class="distro-table"><thead><tr>';
  html += '<th>' + t('distros.col.name') + '</th>';
  html += '<th>' + t('distros.col.state') + '</th>';
  html += '<th>' + t('distros.col.os') + '</th>';
  html += '<th>' + t('distros.col.size') + '</th>';
  html += '<th>' + t('distros.col.packages') + '</th>';
  html += '<th>' + t('distros.col.uptime') + '</th>';
  html += '<th>' + t('distros.col.actions') + '</th>';
  html += '</tr></thead><tbody>';

  for (const d of state.distros) {
    const info = compareMap[d.name] || {};
    const isRunning = d.state === 'Running';
    const stateClass = isRunning ? 'running' : 'stopped';
    const stateLabel = isRunning ? t('distros.state.running') : t('distros.state.stopped');

    // Find VHDX size for this distro (heuristic: match folder name to distro name)
    let vhdxSize = null;
    const distroLower = d.name.toLowerCase();
    for (const v of vhdxFiles) {
      if (v.folder.toLowerCase().includes(distroLower) || v.path.toLowerCase().includes(distroLower)) {
        vhdxSize = v.size;
        break;
      }
    }
    const sizeDisplay = vhdxSize !== null ? formatBytes(vhdxSize) : t('distros.sizeUnknown');

    const packages = info.packages !== null && info.packages !== undefined ? String(info.packages) : '--';
    const uptime = info.uptime ? info.uptime.formatted : '--';
    const osName = info.os || 'Unknown';

    html += '<tr>';
    // Name
    html += '<td><div class="distro-name-cell">';
    html += '<span>' + escapeHtml(d.name) + '</span>';
    if (d.isDefault) html += '<span class="distro-default-badge">' + t('distros.default') + '</span>';
    html += '</div></td>';
    // State
    html += '<td><span class="distro-state-badge"><span class="distro-state-dot ' + stateClass + '"></span>' + stateLabel + '</span></td>';
    // OS
    html += '<td>' + escapeHtml(osName) + '</td>';
    // Size
    html += '<td class="mono">' + sizeDisplay + '</td>';
    // Packages
    html += '<td class="mono">' + packages + '</td>';
    // Uptime
    html += '<td class="mono">' + escapeHtml(uptime) + '</td>';
    // Actions
    html += '<td><div class="distro-actions">';
    html += '<button class="distro-action-btn" data-action="export" data-distro="' + escapeHtml(d.name) + '" title="' + t('distros.export') + '">';
    html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17,8 12,3 7,8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>';
    html += t('distros.export') + '</button>';
    html += '<button class="distro-action-btn" data-action="clone" data-distro="' + escapeHtml(d.name) + '" title="' + t('distros.clone') + '">';
    html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
    html += t('distros.clone') + '</button>';
    html += '<button class="distro-action-btn" data-action="restart" data-distro="' + escapeHtml(d.name) + '" title="' + t('distros.restart') + '">';
    html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1,4 1,10 7,10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>';
    html += t('distros.restart') + '</button>';
    html += '<button class="distro-action-btn" data-action="migrate" data-distro="' + escapeHtml(d.name) + '" title="' + t('distros.migrate') + '">';
    html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><polyline points="9,14 12,17 15,14"/></svg>';
    html += t('distros.migrate') + '</button>';
    html += '</div></td>';
    html += '</tr>';
  }

  html += '</tbody></table>';
  distrosTableContainer.innerHTML = html;

  // Wire action buttons
  distrosTableContainer.querySelectorAll('.distro-action-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      if (_distrosBusy) return;
      const action = btn.dataset.action;
      const distro = btn.dataset.distro;
      if (action === 'export') handleExportDistro(distro);
      else if (action === 'clone') handleCloneDistro(distro);
      else if (action === 'restart') handleRestartDistro(distro);
      else if (action === 'migrate') handleMigrateDistro(distro);
    });
  });
}

async function handleExportDistro(distro) {
  const result = await window.wslCleaner.showSaveDialog({
    title: t('distros.exportTitle'),
    defaultPath: distro + '.tar',
    filters: [{ name: 'TAR Archive', extensions: ['tar'] }],
  });

  if (result.canceled || !result.filePath) return;

  _distrosBusy = true;
  setDistroActionButtonsDisabled(true);
  appendDistrosLog('\n' + t('distros.exporting', { distro }) + '\n');

  try {
    const res = await window.wslCleaner.exportDistro({
      distro,
      targetPath: result.filePath,
      taskId: 'distro-export',
    });

    if (res.ok) {
      appendDistrosLog(t('distros.exportDone', { distro }) + '\n');
    } else {
      appendDistrosLog(t('distros.exportFail', { distro }) + '\n');
    }
  } catch (err) {
    appendDistrosLog(t('distros.exportFail', { distro }) + ' ' + (err.message || '') + '\n');
  }

  _distrosBusy = false;
  setDistroActionButtonsDisabled(false);
}

async function handleCloneDistro(distro) {
  // Show clone modal
  const modal = document.getElementById('clone-modal');
  const nameInput = document.getElementById('clone-modal-name');
  const locationInput = document.getElementById('clone-modal-location');
  const descEl = document.getElementById('clone-modal-desc');
  const btnConfirm = document.getElementById('clone-modal-confirm');
  const btnCancel = document.getElementById('clone-modal-cancel');
  const btnBrowse = document.getElementById('clone-modal-browse');

  descEl.innerHTML = t('distros.cloneDesc', { distro: escapeHtml(distro) });
  nameInput.value = distro + '-Clone';
  locationInput.value = 'C:\\WSL\\' + distro + '-Clone';
  modal.classList.remove('hidden');

  return new Promise((resolve) => {
    function cleanup() {
      modal.classList.add('hidden');
      btnConfirm.removeEventListener('click', onConfirm);
      btnCancel.removeEventListener('click', onCancel);
      btnBrowse.removeEventListener('click', onBrowse);
      resolve();
    }

    async function onBrowse() {
      const result = await window.wslCleaner.showOpenDialog({
        title: t('distros.cloneLocationLabel'),
        properties: ['openDirectory', 'createDirectory'],
      });
      if (!result.canceled && result.filePaths.length > 0) {
        locationInput.value = result.filePaths[0];
      }
    }

    async function onConfirm() {
      const newName = nameInput.value.trim();
      const installLocation = locationInput.value.trim();

      if (!newName) { nameInput.focus(); return; }
      if (!installLocation) { locationInput.focus(); return; }

      modal.classList.add('hidden');

      _distrosBusy = true;
      setDistroActionButtonsDisabled(true);
      appendDistrosLog('\n' + t('distros.cloning', { distro, name: newName }) + '\n');

      try {
        const res = await window.wslCleaner.cloneDistro({
          distro,
          newName,
          installLocation,
          taskId: 'distro-clone',
        });

        if (res.ok) {
          appendDistrosLog(t('distros.cloneDone', { distro, name: newName }) + '\n');
          // Refresh distro list
          const wslResult = await window.wslCleaner.checkWsl();
          if (wslResult.ok) {
            state.distros = wslResult.distros;
            state.selectedDistros = wslResult.distros.map(d => d.name);
            renderDistroPicker();
            await renderDistrosPage();
          }
        } else {
          appendDistrosLog(t('distros.cloneFail', { distro }) + '\n');
        }
      } catch (err) {
        appendDistrosLog(t('distros.cloneFail', { distro }) + ' ' + (err.message || '') + '\n');
      }

      _distrosBusy = false;
      setDistroActionButtonsDisabled(false);
      cleanup();
    }

    function onCancel() { cleanup(); }

    btnConfirm.addEventListener('click', onConfirm);
    btnCancel.addEventListener('click', onCancel);
    btnBrowse.addEventListener('click', onBrowse);
  });
}

async function handleRestartDistro(distro) {
  _distrosBusy = true;
  setDistroActionButtonsDisabled(true);
  appendDistrosLog('\n' + t('distros.restarting', { distro }) + '\n');

  try {
    const res = await window.wslCleaner.restartDistro({
      distro,
      taskId: 'distro-restart',
    });

    if (res.ok) {
      appendDistrosLog(t('distros.restartDone', { distro }) + '\n');
    } else {
      appendDistrosLog(t('distros.restartFail', { distro }) + '\n');
    }

    // Refresh distro list to update state
    const wslResult = await window.wslCleaner.checkWsl();
    if (wslResult.ok) {
      state.distros = wslResult.distros;
      renderDistroPicker();
      await renderDistrosPage();
    }
  } catch (err) {
    appendDistrosLog(t('distros.restartFail', { distro }) + ' ' + (err.message || '') + '\n');
  }

  _distrosBusy = false;
  setDistroActionButtonsDisabled(false);
}

async function handleImportDistro() {
  const nameInput = document.getElementById('distros-import-name');
  const locationInput = document.getElementById('distros-import-location');
  const tarInput = document.getElementById('distros-import-tar');

  const name = nameInput.value.trim();
  const installLocation = locationInput.value.trim();
  const tarPath = tarInput.value.trim();

  if (!name) { nameInput.focus(); return; }
  if (!installLocation) { locationInput.focus(); return; }
  if (!tarPath) { tarInput.focus(); return; }

  _distrosBusy = true;
  setDistroActionButtonsDisabled(true);
  appendDistrosLog('\n' + t('distros.importing', { name }) + '\n');

  try {
    const res = await window.wslCleaner.importDistro({
      name,
      installLocation,
      tarPath,
      taskId: 'distro-import',
    });

    if (res.ok) {
      appendDistrosLog(t('distros.importDone', { name }) + '\n');
      nameInput.value = '';
      locationInput.value = '';
      tarInput.value = '';

      // Refresh distro list
      const wslResult = await window.wslCleaner.checkWsl();
      if (wslResult.ok) {
        state.distros = wslResult.distros;
        state.selectedDistros = wslResult.distros.map(d => d.name);
        renderDistroPicker();
        await renderDistrosPage();
      }
    } else {
      appendDistrosLog(t('distros.importFail', { name }) + '\n');
    }
  } catch (err) {
    appendDistrosLog(t('distros.importFail', { name }) + ' ' + (err.message || '') + '\n');
  }

  _distrosBusy = false;
  setDistroActionButtonsDisabled(false);
}

function setDistroActionButtonsDisabled(disabled) {
  const btns = distrosTableContainer.querySelectorAll('.distro-action-btn');
  btns.forEach(btn => { btn.disabled = disabled; });
  const importBtn = document.getElementById('distros-import-btn');
  if (importBtn) importBtn.disabled = disabled;
}

function startDistrosAutoRefresh() {
  stopDistrosAutoRefresh();
  _distrosRefreshTimer = setInterval(() => {
    if (state.currentPage === 'distros' && !_distrosBusy) {
      refreshDistrosSilent();
    }
  }, 15000);
}

function stopDistrosAutoRefresh() {
  if (_distrosRefreshTimer) {
    clearInterval(_distrosRefreshTimer);
    _distrosRefreshTimer = null;
  }
}

async function refreshDistrosSilent() {
  if (state.distros.length === 0 || _distrosBusy) return;
  try {
    // Refresh distro list so Running/Stopped state is current
    const wslResult = await window.wslCleaner.checkWsl();
    if (wslResult.ok) {
      state.distros = wslResult.distros;
    }

    const distroNames = state.distros.map(d => d.name);
    const [comparisonData, vhdxFiles] = await Promise.all([
      window.wslCleaner.getDistroComparison(distroNames),
      window.wslCleaner.findVhdx(),
    ]);
    if (state.currentPage === 'distros' && !_distrosBusy) {
      renderDistroTable(comparisonData, vhdxFiles);
      showDistrosState('table');
    }
  } catch (err) {
    console.error('[Distros] Auto-refresh error:', err);
  }
}

// Wire distros page buttons
btnDistrosRefresh.addEventListener('click', () => {
  if (!_distrosBusy) renderDistrosPage();
});

document.getElementById('distros-import-btn').addEventListener('click', () => handleImportDistro());

document.getElementById('distros-import-browse-tar').addEventListener('click', async () => {
  const result = await window.wslCleaner.showOpenDialog({
    title: t('distros.importFile'),
    filters: [{ name: 'TAR Archive', extensions: ['tar'] }],
    properties: ['openFile'],
  });
  if (!result.canceled && result.filePaths.length > 0) {
    document.getElementById('distros-import-tar').value = result.filePaths[0];
  }
});

document.getElementById('distros-import-browse-location').addEventListener('click', async () => {
  const result = await window.wslCleaner.showOpenDialog({
    title: t('distros.importLocation'),
    properties: ['openDirectory', 'createDirectory'],
  });
  if (!result.canceled && result.filePaths.length > 0) {
    document.getElementById('distros-import-location').value = result.filePaths[0];
  }
});

document.getElementById('distros-log-clear').addEventListener('click', () => {
  distrosLog.textContent = '';
});

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
  if (state.currentPage === 'diskmap') renderDiskMap();
  if (state.currentPage === 'health') renderHealthPage();
  if (state.currentPage === 'distros') renderDistrosPage();
});

// ── Migration Wizard ─────────────────────────────────────────────────────────

let _migrateState = {
  distro: null,
  vhdxPath: null,
  vhdxSize: 0,
  defaultUser: null,
  destinationPath: '',
  freeSpace: 0,
  keepBackup: false,
  currentStep: 1,
  isRunning: false,
};
let _migrateStepCleanup = null;
let _migrateOutputCleanup = null;
let _migrateElapsedInterval = null;

const migrateModal = document.getElementById('migrate-modal');
const migrateDestPath = document.getElementById('migrate-dest-path');
const migrateSpaceInfo = document.getElementById('migrate-space-info');
const migrateSpaceRequired = document.getElementById('migrate-space-required');
const migrateSpaceAvailable = document.getElementById('migrate-space-available');
const migrateSpaceWarning = document.getElementById('migrate-space-warning');
const migrateSpaceWarningText = document.getElementById('migrate-space-warning-text');
const migrateKeepBackup = document.getElementById('migrate-keep-backup');
const migrateLog = document.getElementById('migrate-log');
const migrateProgressFill = document.getElementById('migrate-progress-fill');
const migrateStepCounter = document.getElementById('migrate-step-counter');
const migrateElapsed = document.getElementById('migrate-elapsed');

async function handleMigrateDistro(distro) {
  // Reset state
  _migrateState = {
    distro,
    vhdxPath: null,
    vhdxSize: 0,
    defaultUser: null,
    destinationPath: '',
    freeSpace: 0,
    keepBackup: false,
    currentStep: 1,
    isRunning: false,
  };

  // Discover VHDX info for this distro
  try {
    const vhdxFiles = await window.wslCleaner.findVhdx();
    const distroLower = distro.toLowerCase();
    for (const v of vhdxFiles) {
      if (v.folder.toLowerCase().includes(distroLower) || v.path.toLowerCase().includes(distroLower)) {
        _migrateState.vhdxPath = v.path;
        _migrateState.vhdxSize = v.size;
        break;
      }
    }
  } catch { /* ignore */ }

  // Populate info banner
  document.getElementById('migrate-info-distro').textContent = distro;
  document.getElementById('migrate-info-path').textContent = _migrateState.vhdxPath || t('distros.sizeUnknown');
  document.getElementById('migrate-info-size').textContent = _migrateState.vhdxSize ? formatBytes(_migrateState.vhdxSize) : t('distros.sizeUnknown');

  // Reset form
  migrateDestPath.value = '';
  migrateSpaceInfo.classList.add('hidden');
  migrateSpaceWarning.classList.add('hidden');
  document.getElementById('migrate-next-1').disabled = true;
  migrateKeepBackup.checked = false;
  migrateLog.textContent = '';
  if (migrateProgressFill) migrateProgressFill.style.width = '0%';

  // Show modal at step 1
  showMigrateStep(1);
  migrateModal.classList.remove('hidden');
  applyI18n(migrateModal);
}

function showMigrateStep(stepNum) {
  _migrateState.currentStep = stepNum;
  for (let i = 1; i <= 4; i++) {
    const panel = document.getElementById('migrate-step-' + i);
    if (panel) panel.classList.toggle('hidden', i !== stepNum);
  }
  migrateModal.querySelectorAll('.migrate-stepper-step').forEach(el => {
    const step = parseInt(el.dataset.wizardStep, 10);
    el.classList.remove('active', 'completed');
    if (step === stepNum) el.classList.add('active');
    else if (step < stepNum) el.classList.add('completed');
  });
}

function closeMigrateModal() {
  if (_migrateState.isRunning) return;
  migrateModal.classList.add('hidden');
  if (_migrateStepCleanup) { _migrateStepCleanup(); _migrateStepCleanup = null; }
  if (_migrateOutputCleanup) { _migrateOutputCleanup(); _migrateOutputCleanup = null; }
  if (_migrateElapsedInterval) { clearInterval(_migrateElapsedInterval); _migrateElapsedInterval = null; }
}

let _migrateValidateTimer = null;
async function validateMigrateDestination() {
  const destPath = migrateDestPath.value.trim();
  if (!destPath) {
    migrateSpaceInfo.classList.add('hidden');
    migrateSpaceWarning.classList.add('hidden');
    document.getElementById('migrate-next-1').disabled = true;
    return;
  }

  _migrateState.destinationPath = destPath;

  // Check if same drive as current
  if (_migrateState.vhdxPath) {
    const currentDrive = _migrateState.vhdxPath.match(/^([A-Za-z]):/);
    const destDrive = destPath.match(/^([A-Za-z]):/);
    if (currentDrive && destDrive && currentDrive[1].toUpperCase() === destDrive[1].toUpperCase()) {
      migrateSpaceInfo.classList.add('hidden');
      migrateSpaceWarning.classList.remove('hidden');
      migrateSpaceWarningText.textContent = t('migrate.dest.samePath');
      document.getElementById('migrate-next-1').disabled = true;
      return;
    }
  }

  // Check drive space
  const spaceResult = await window.wslCleaner.getDriveSpace(destPath);
  migrateSpaceInfo.classList.remove('hidden');

  const requiredBytes = Math.ceil(_migrateState.vhdxSize * 1.1) || 0;
  migrateSpaceRequired.textContent = requiredBytes ? formatBytes(requiredBytes) : t('distros.sizeUnknown');

  if (spaceResult.ok) {
    _migrateState.freeSpace = spaceResult.freeBytes;
    migrateSpaceAvailable.textContent = formatBytes(spaceResult.freeBytes);

    if (requiredBytes > 0 && spaceResult.freeBytes < requiredBytes) {
      migrateSpaceWarning.classList.remove('hidden');
      migrateSpaceWarningText.textContent = t('migrate.dest.insufficientSpace');
      document.getElementById('migrate-next-1').disabled = true;
    } else {
      migrateSpaceWarning.classList.add('hidden');
      document.getElementById('migrate-next-1').disabled = false;
    }
  } else {
    migrateSpaceAvailable.textContent = t('distros.sizeUnknown');
    migrateSpaceWarning.classList.add('hidden');
    document.getElementById('migrate-next-1').disabled = false;
  }
}

async function prepareMigrateConfirmation() {
  document.getElementById('migrate-summary-distro').textContent = _migrateState.distro;
  document.getElementById('migrate-summary-current').textContent = _migrateState.vhdxPath || t('distros.sizeUnknown');
  document.getElementById('migrate-summary-dest').textContent = _migrateState.destinationPath;
  document.getElementById('migrate-summary-size').textContent = _migrateState.vhdxSize ? formatBytes(_migrateState.vhdxSize) : t('distros.sizeUnknown');

  // Detect default user
  const userEl = document.getElementById('migrate-summary-user');
  userEl.textContent = '...';
  try {
    const userResult = await window.wslCleaner.getDefaultUser(_migrateState.distro);
    if (userResult.ok) {
      _migrateState.defaultUser = userResult.user;
      userEl.textContent = userResult.user;
    } else {
      _migrateState.defaultUser = null;
      userEl.textContent = t('distros.sizeUnknown');
    }
  } catch {
    _migrateState.defaultUser = null;
    userEl.textContent = t('distros.sizeUnknown');
  }
}

function setMigrateStepState(stepName, status) {
  const container = document.getElementById('migrate-steps');
  const item = container.querySelector('.step-item[data-step="' + stepName + '"]');
  if (!item) return;

  item.classList.remove('active', 'done', 'failed');
  const iconSlot = item.querySelector('.step-icon-slot');

  if (status === 'active') {
    item.classList.add('active');
    iconSlot.innerHTML = '<div class="step-spinner"></div>';
  } else if (status === 'done') {
    item.classList.add('done');
    iconSlot.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2.5"><polyline points="20,6 9,17 4,12"/></svg>';
  } else if (status === 'failed') {
    item.classList.add('failed');
    iconSlot.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  }

  // Update progress bar
  const allSteps = container.querySelectorAll('.step-item');
  let total = allSteps.length, done = 0, hasActive = false;
  allSteps.forEach(s => {
    if (s.classList.contains('done') || s.classList.contains('failed')) done++;
    if (s.classList.contains('active')) hasActive = true;
  });
  const progress = total > 0 ? ((done + (hasActive ? 0.5 : 0)) / total) * 100 : 0;
  if (migrateProgressFill) migrateProgressFill.style.width = Math.min(progress, 100) + '%';
  if (migrateStepCounter) migrateStepCounter.textContent = t('simple.stepOf', { current: done + (hasActive ? 1 : 0), total });
}

async function startMigration() {
  _migrateState.isRunning = true;
  _migrateState.keepBackup = migrateKeepBackup.checked;

  showMigrateStep(3);

  // Clear log
  migrateLog.textContent = '';

  // Render step numbers
  const allSteps = document.querySelectorAll('#migrate-steps .step-item');
  let idx = 0;
  allSteps.forEach(item => {
    idx++;
    item.classList.remove('active', 'done', 'failed');
    item.querySelector('.step-icon-slot').innerHTML = '<div class="step-number">' + idx + '</div>';
  });

  // Start elapsed timer
  const startTime = Date.now();
  migrateElapsed.textContent = '0:00';
  _migrateElapsedInterval = setInterval(() => {
    const secs = Math.floor((Date.now() - startTime) / 1000);
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    migrateElapsed.textContent = m + ':' + String(s).padStart(2, '0');
  }, 1000);

  // Listen for step progress
  _migrateStepCleanup = window.wslCleaner.onMigrateStep((data) => {
    setMigrateStepState(data.step, data.status);
  });

  // Listen for log output
  _migrateOutputCleanup = window.wslCleaner.onTaskOutput((data) => {
    if (data.taskId === 'migrate-distro') {
      migrateLog.textContent += data.text;
      migrateLog.scrollTop = migrateLog.scrollHeight;
    }
  });

  // Invoke the migration
  const result = await window.wslCleaner.migrateDistro({
    distro: _migrateState.distro,
    destinationPath: _migrateState.destinationPath,
    defaultUser: _migrateState.defaultUser,
    keepBackup: _migrateState.keepBackup,
    taskId: 'migrate-distro',
  });

  // Stop timer
  if (_migrateElapsedInterval) {
    clearInterval(_migrateElapsedInterval);
    _migrateElapsedInterval = null;
  }

  // Remove listeners
  if (_migrateStepCleanup) { _migrateStepCleanup(); _migrateStepCleanup = null; }
  if (_migrateOutputCleanup) { _migrateOutputCleanup(); _migrateOutputCleanup = null; }

  _migrateState.isRunning = false;

  // Show result
  showMigrateResult(result);

  // Refresh distro list
  try {
    const wslResult = await window.wslCleaner.checkWsl();
    if (wslResult.ok) {
      state.distros = wslResult.distros;
      renderDistroPicker();
      if (state.currentPage === 'distros') renderDistrosPage();
    }
  } catch { /* ignore */ }
}

function showMigrateResult(result) {
  showMigrateStep(4);

  const successEl = document.getElementById('migrate-result-success');
  const failureEl = document.getElementById('migrate-result-failure');

  if (result.ok) {
    successEl.classList.remove('hidden');
    failureEl.classList.add('hidden');

    let summaryHtml = '';
    summaryHtml += '<div class="migrate-summary-row">';
    summaryHtml += '<span class="migrate-summary-label">' + t('migrate.confirm.distro') + '</span>';
    summaryHtml += '<span class="migrate-summary-value">' + escapeHtml(_migrateState.distro) + '</span>';
    summaryHtml += '</div>';
    summaryHtml += '<div class="migrate-summary-row">';
    summaryHtml += '<span class="migrate-summary-label">' + t('migrate.result.newLocation') + '</span>';
    summaryHtml += '<span class="migrate-summary-value mono">' + escapeHtml(_migrateState.destinationPath) + '</span>';
    summaryHtml += '</div>';
    document.getElementById('migrate-result-summary').innerHTML = summaryHtml;

    const backupEl = document.getElementById('migrate-result-backup');
    if (result.tarPath) {
      backupEl.classList.remove('hidden');
      document.getElementById('migrate-result-backup-path').textContent = t('migrate.result.backupKept', { path: result.tarPath });
    } else {
      backupEl.classList.add('hidden');
    }
  } else {
    successEl.classList.add('hidden');
    failureEl.classList.remove('hidden');
    document.getElementById('migrate-fail-message').textContent = result.error || t('error.unknown');

    const tarInfoEl = document.getElementById('migrate-fail-tar-info');
    if (result.tarPath) {
      tarInfoEl.style.display = '';
      document.getElementById('migrate-fail-tar-path').textContent = t('migrate.result.tarPreserved', { path: result.tarPath });
    } else {
      tarInfoEl.style.display = 'none';
    }
  }
}

// Migration wizard event wiring
document.getElementById('migrate-modal-close').addEventListener('click', closeMigrateModal);
migrateModal.addEventListener('click', (e) => {
  if (e.target === migrateModal) closeMigrateModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !migrateModal.classList.contains('hidden') && !_migrateState.isRunning) {
    closeMigrateModal();
  }
});

// Step 1: Destination
document.getElementById('migrate-browse').addEventListener('click', async () => {
  const result = await window.wslCleaner.showOpenDialog({
    title: t('migrate.dest.browseTitle'),
    properties: ['openDirectory', 'createDirectory'],
  });
  if (!result.canceled && result.filePaths.length > 0) {
    migrateDestPath.value = result.filePaths[0];
    await validateMigrateDestination();
  }
});

migrateDestPath.addEventListener('input', () => {
  clearTimeout(_migrateValidateTimer);
  _migrateValidateTimer = setTimeout(() => validateMigrateDestination(), 500);
});

document.getElementById('migrate-next-1').addEventListener('click', async () => {
  _migrateState.destinationPath = migrateDestPath.value.trim();
  await prepareMigrateConfirmation();
  showMigrateStep(2);
});

// Step 2: Confirm
document.getElementById('migrate-back-2').addEventListener('click', () => showMigrateStep(1));
document.getElementById('migrate-start').addEventListener('click', () => startMigration());

// Step 4: Reset
document.getElementById('migrate-reset').addEventListener('click', () => {
  closeMigrateModal();
});

// Log toggle
document.getElementById('migrate-log-toggle').addEventListener('click', () => {
  migrateLog.classList.toggle('hidden');
});

// ── Config Editor Page ───────────────────────────────────────────────────────

const _cfgSystemRes = { totalMemory: 0, cpuCount: 0 };

// .wslconfig field definitions: { id, section, key, type, options? }
const WSL_CONFIG_FIELDS = [
  { id: 'cfg-wsl2-memory', section: 'wsl2', key: 'memory', type: 'text' },
  { id: 'cfg-wsl2-processors', section: 'wsl2', key: 'processors', type: 'number' },
  { id: 'cfg-wsl2-swap', section: 'wsl2', key: 'swap', type: 'text' },
  { id: 'cfg-wsl2-swapFile', section: 'wsl2', key: 'swapFile', type: 'text' },
  { id: 'cfg-wsl2-kernelCommandLine', section: 'wsl2', key: 'kernelCommandLine', type: 'text' },
  { id: 'cfg-wsl2-localhostForwarding', section: 'wsl2', key: 'localhostForwarding', type: 'bool' },
  { id: 'cfg-wsl2-networkingMode', section: 'wsl2', key: 'networkingMode', type: 'select' },
  { id: 'cfg-wsl2-dnsTunneling', section: 'wsl2', key: 'dnsTunneling', type: 'bool' },
  { id: 'cfg-wsl2-dnsProxy', section: 'wsl2', key: 'dnsProxy', type: 'bool' },
  { id: 'cfg-wsl2-autoProxy', section: 'wsl2', key: 'autoProxy', type: 'bool' },
  { id: 'cfg-wsl2-firewall', section: 'wsl2', key: 'firewall', type: 'bool' },
  { id: 'cfg-wsl2-autoMemoryReclaim', section: 'wsl2', key: 'autoMemoryReclaim', type: 'select' },
  { id: 'cfg-wsl2-sparseVhd', section: 'wsl2', key: 'sparseVhd', type: 'bool' },
  { id: 'cfg-wsl2-pageReporting', section: 'wsl2', key: 'pageReporting', type: 'bool' },
  { id: 'cfg-wsl2-nestedVirtualization', section: 'wsl2', key: 'nestedVirtualization', type: 'bool' },
  { id: 'cfg-wsl2-vmIdleTimeout', section: 'wsl2', key: 'vmIdleTimeout', type: 'number' },
  { id: 'cfg-wsl2-guiApplications', section: 'wsl2', key: 'guiApplications', type: 'bool' },
  { id: 'cfg-wsl2-debugConsole', section: 'wsl2', key: 'debugConsole', type: 'bool' },
];

// wsl.conf field definitions
const WSL_CONF_FIELDS = [
  { id: 'cfg-automount-enabled', section: 'automount', key: 'enabled', type: 'bool' },
  { id: 'cfg-automount-root', section: 'automount', key: 'root', type: 'text' },
  { id: 'cfg-automount-options', section: 'automount', key: 'options', type: 'text' },
  { id: 'cfg-automount-mountFsTab', section: 'automount', key: 'mountFsTab', type: 'bool' },
  { id: 'cfg-interop-enabled', section: 'interop', key: 'enabled', type: 'bool' },
  { id: 'cfg-interop-appendWindowsPath', section: 'interop', key: 'appendWindowsPath', type: 'bool' },
  { id: 'cfg-user-default', section: 'user', key: 'default', type: 'text' },
  { id: 'cfg-boot-systemd', section: 'boot', key: 'systemd', type: 'bool' },
  { id: 'cfg-boot-command', section: 'boot', key: 'command', type: 'text' },
  { id: 'cfg-network-hostname', section: 'network', key: 'hostname', type: 'text' },
  { id: 'cfg-network-generateHosts', section: 'network', key: 'generateHosts', type: 'bool' },
  { id: 'cfg-network-generateResolvConf', section: 'network', key: 'generateResolvConf', type: 'bool' },
];

// Convert raw byte values (like 20971520000) to friendly format (like "20GB")
function cfgFriendlyMemory(val) {
  if (!val) return val;
  const str = String(val);
  // Already in friendly format like "4GB" or "512MB"
  if (/^\d+(MB|GB|TB)$/i.test(str)) return str;
  // Raw number — treat as bytes
  const n = parseInt(str, 10);
  if (isNaN(n)) return str;
  const gb = n / (1024 * 1024 * 1024);
  if (gb >= 1 && gb === Math.round(gb)) return Math.round(gb) + 'GB';
  if (gb >= 1) return gb.toFixed(1).replace(/\.0$/, '') + 'GB';
  const mb = n / (1024 * 1024);
  if (mb >= 1) return Math.round(mb) + 'MB';
  return str;
}

const MEMORY_FIELD_IDS = new Set(['cfg-wsl2-memory', 'cfg-wsl2-swap']);

function cfgSetFieldValue(id, value) {
  const el = $(`#${id}`);
  if (!el) return;
  if (el.type === 'checkbox') {
    el.checked = value === 'true' || value === true;
  } else {
    el.value = (MEMORY_FIELD_IDS.has(id) ? cfgFriendlyMemory(value) : value) ?? '';
  }
}

function cfgGetFieldValue(id, type) {
  const el = $(`#${id}`);
  if (!el) return '';
  if (type === 'bool') return el.checked ? 'true' : 'false';
  return el.value.trim();
}

function cfgPopulateFields(fields, data) {
  for (const f of fields) {
    const sectionData = data?.[f.section];
    const value = sectionData?.[f.key] ?? '';
    cfgSetFieldValue(f.id, value);
  }
}

function cfgCollectFields(fields) {
  const result = {};
  for (const f of fields) {
    const val = cfgGetFieldValue(f.id, f.type);
    // Skip empty values so they don't clutter the config file
    if (val === '' || val == null) continue;
    if (!result[f.section]) result[f.section] = {};
    result[f.section][f.key] = val;
  }
  return result;
}

function cfgShowToast(message, type = 'success') {
  // Remove any existing toast
  const existing = document.querySelector('.config-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `config-toast config-toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function cfgValidateWslConfig() {
  let valid = true;
  // Clear previous errors
  $$('.config-input-error').forEach(el => el.classList.remove('config-input-error'));
  $$('.config-field-error-msg').forEach(el => el.remove());

  const memEl = $('#cfg-wsl2-memory');
  const memVal = memEl.value.trim();
  if (memVal && !/^\d+(MB|GB)$/i.test(memVal) && !/^\d+$/.test(memVal)) {
    memEl.classList.add('config-input-error');
    const msg = document.createElement('div');
    msg.className = 'config-field-error-msg';
    msg.textContent = t('config.validation.memoryFormat');
    memEl.parentElement.appendChild(msg);
    valid = false;
  }

  const swapEl = $('#cfg-wsl2-swap');
  const swapVal = swapEl.value.trim();
  if (swapVal && swapVal !== '0' && !/^\d+(MB|GB)$/i.test(swapVal) && !/^\d+$/.test(swapVal)) {
    swapEl.classList.add('config-input-error');
    const msg = document.createElement('div');
    msg.className = 'config-field-error-msg';
    msg.textContent = t('config.validation.memoryFormat');
    swapEl.parentElement.appendChild(msg);
    valid = false;
  }

  const procEl = $('#cfg-wsl2-processors');
  if (procEl.value.trim()) {
    const n = parseInt(procEl.value, 10);
    if (isNaN(n) || n < 1 || (_cfgSystemRes.cpuCount > 0 && n > _cfgSystemRes.cpuCount)) {
      procEl.classList.add('config-input-error');
      const msg = document.createElement('div');
      msg.className = 'config-field-error-msg';
      msg.textContent = t('config.validation.processorRange', { max: _cfgSystemRes.cpuCount || '?' });
      procEl.parentElement.appendChild(msg);
      valid = false;
    }
  }

  const timeoutEl = $('#cfg-wsl2-vmIdleTimeout');
  if (timeoutEl.value.trim()) {
    const n = parseInt(timeoutEl.value, 10);
    if (isNaN(n) || n < 0) {
      timeoutEl.classList.add('config-input-error');
      const msg = document.createElement('div');
      msg.className = 'config-field-error-msg';
      msg.textContent = t('config.validation.positiveInt');
      timeoutEl.parentElement.appendChild(msg);
      valid = false;
    }
  }

  return valid;
}

function cfgOptimizeWslConfig() {
  const totalGB = Math.round(_cfgSystemRes.totalMemory / (1024 * 1024 * 1024));
  const memGB = Math.max(2, Math.round(totalGB * 0.5));
  const procs = Math.max(2, Math.round(_cfgSystemRes.cpuCount * 0.5));
  const swapGB = Math.max(1, Math.round(memGB * 0.25));

  cfgSetFieldValue('cfg-wsl2-memory', memGB + 'GB');
  cfgSetFieldValue('cfg-wsl2-processors', procs);
  cfgSetFieldValue('cfg-wsl2-swap', swapGB + 'GB');
  cfgSetFieldValue('cfg-wsl2-localhostForwarding', true);
  cfgSetFieldValue('cfg-wsl2-networkingMode', 'mirrored');
  cfgSetFieldValue('cfg-wsl2-dnsTunneling', true);
  cfgSetFieldValue('cfg-wsl2-dnsProxy', true);
  cfgSetFieldValue('cfg-wsl2-autoProxy', true);
  cfgSetFieldValue('cfg-wsl2-firewall', true);
  cfgSetFieldValue('cfg-wsl2-autoMemoryReclaim', 'gradual');
  cfgSetFieldValue('cfg-wsl2-sparseVhd', true);
  cfgSetFieldValue('cfg-wsl2-pageReporting', true);
  cfgSetFieldValue('cfg-wsl2-nestedVirtualization', false);
  cfgSetFieldValue('cfg-wsl2-guiApplications', true);
  cfgSetFieldValue('cfg-wsl2-debugConsole', false);

  cfgShowToast(t('config.optimizeApplied'));
}

function cfgOptimizeWslConf() {
  cfgSetFieldValue('cfg-automount-enabled', true);
  cfgSetFieldValue('cfg-automount-root', '/mnt/');
  cfgSetFieldValue('cfg-automount-mountFsTab', true);
  cfgSetFieldValue('cfg-interop-enabled', true);
  cfgSetFieldValue('cfg-interop-appendWindowsPath', true);
  cfgSetFieldValue('cfg-boot-systemd', true);
  cfgSetFieldValue('cfg-network-generateHosts', true);
  cfgSetFieldValue('cfg-network-generateResolvConf', true);

  cfgShowToast(t('config.optimizeApplied'));
}

let _cfgCurrentTab = 'wslconfig';
let _cfgLoaded = false;

async function renderConfigPage() {
  const loading = $('#config-loading');
  const wslconfigPanel = $('#config-wslconfig-panel');

  // Load system resources once
  if (_cfgSystemRes.totalMemory === 0) {
    try {
      const res = await window.wslCleaner.getSystemResources();
      _cfgSystemRes.totalMemory = res.totalMemory;
      _cfgSystemRes.cpuCount = res.cpuCount;
      // Set max on processor input
      const procEl = $('#cfg-wsl2-processors');
      if (procEl) procEl.max = _cfgSystemRes.cpuCount;
    } catch { /* non-critical */ }
  }

  // Show correct tab
  cfgSwitchTab(_cfgCurrentTab);

  // Load .wslconfig if on that tab and not yet loaded
  if (_cfgCurrentTab === 'wslconfig' && !_cfgLoaded) {
    loading.classList.remove('hidden');
    wslconfigPanel.classList.add('hidden');
    try {
      const result = await window.wslCleaner.readWslConfig();
      if (result.ok) {
        cfgPopulateFields(WSL_CONFIG_FIELDS, result.data);
        // Show the config path in the description
        if (result.path) {
          const descEl = $('#config-wslconfig-desc');
          if (descEl) descEl.innerHTML = t('config.wslconfigDesc', { path: result.path });
        }
        if (!result.data) {
          cfgShowToast(t('config.noFile'), 'success');
        }
      }
    } catch { /* show empty form */ }
    loading.classList.add('hidden');
    wslconfigPanel.classList.remove('hidden');
    _cfgLoaded = true;
  }

  // Populate distro selector for wsl.conf tab
  const distroSelect = $('#config-distro-select');
  if (distroSelect && distroSelect.options.length <= 0 && state.distros.length > 0) {
    for (const d of state.distros) {
      const opt = document.createElement('option');
      opt.value = d.name;
      opt.textContent = d.name + (d.isDefault ? ` (${t('distros.default')})` : '');
      distroSelect.appendChild(opt);
    }
  }
}

function cfgSwitchTab(tab) {
  _cfgCurrentTab = tab;
  const wslconfigPanel = $('#config-wslconfig-panel');
  const wslconfPanel = $('#config-wslconf-panel');

  $$('.config-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });

  if (tab === 'wslconfig') {
    wslconfigPanel.classList.remove('hidden');
    wslconfPanel.classList.add('hidden');
  } else {
    wslconfigPanel.classList.add('hidden');
    wslconfPanel.classList.remove('hidden');
  }
}

async function cfgLoadWslConf(distro) {
  if (!distro) return;
  const loading = $('#config-loading');

  loading.classList.remove('hidden');
  // Clear fields
  cfgPopulateFields(WSL_CONF_FIELDS, null);

  try {
    const result = await window.wslCleaner.readWslConf(distro);
    if (result.ok && result.data) {
      cfgPopulateFields(WSL_CONF_FIELDS, result.data);
    } else if (result.ok && !result.data) {
      cfgShowToast(t('config.noFile'), 'success');
    }
  } catch { /* show empty form */ }

  loading.classList.add('hidden');
}

// ── Config editor event wiring ──────────────────────────────────────────────

// Tab switching
$$('.config-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    cfgSwitchTab(btn.dataset.tab);
    if (btn.dataset.tab === 'wslconf') {
      const distro = $('#config-distro-select')?.value;
      if (distro) cfgLoadWslConf(distro);
    }
  });
});

// Distro selector for wsl.conf
$('#config-distro-select')?.addEventListener('change', (e) => {
  cfgLoadWslConf(e.target.value);
});

// .wslconfig Save
$('#config-wslconfig-save')?.addEventListener('click', async () => {
  if (!cfgValidateWslConfig()) return;

  const btn = $('#config-wslconfig-save');
  const origText = btn.querySelector('span').textContent;
  btn.disabled = true;
  btn.querySelector('span').textContent = t('config.saving');

  try {
    const config = cfgCollectFields(WSL_CONFIG_FIELDS);
    const result = await window.wslCleaner.writeWslConfig(config);
    if (result.ok) {
      cfgShowToast(t('config.saved'));
      $('#config-restart-banner').classList.remove('hidden');
    } else {
      cfgShowToast(t('config.saveError', { error: result.error }), 'error');
    }
  } catch (err) {
    cfgShowToast(t('config.saveError', { error: err.message }), 'error');
  }

  btn.disabled = false;
  btn.querySelector('span').textContent = origText;
});

// .wslconfig Optimize
$('#config-wslconfig-optimize')?.addEventListener('click', cfgOptimizeWslConfig);

// .wslconfig Reset
$('#config-wslconfig-reset')?.addEventListener('click', async () => {
  _cfgLoaded = false;
  await renderConfigPage();
});

// wsl.conf Save
$('#config-wslconf-save')?.addEventListener('click', async () => {
  const distro = $('#config-distro-select')?.value;
  if (!distro) return;

  const btn = $('#config-wslconf-save');
  const origText = btn.querySelector('span').textContent;
  btn.disabled = true;
  btn.querySelector('span').textContent = t('config.saving');

  try {
    const config = cfgCollectFields(WSL_CONF_FIELDS);
    const result = await window.wslCleaner.writeWslConf(distro, config);
    if (result.ok) {
      cfgShowToast(t('config.saved'));
      $('#config-restart-banner').classList.remove('hidden');
    } else {
      cfgShowToast(t('config.saveError', { error: result.error }), 'error');
    }
  } catch (err) {
    cfgShowToast(t('config.saveError', { error: err.message }), 'error');
  }

  btn.disabled = false;
  btn.querySelector('span').textContent = origText;
});

// wsl.conf Optimize
$('#config-wslconf-optimize')?.addEventListener('click', cfgOptimizeWslConf);

// wsl.conf Reset
$('#config-wslconf-reset')?.addEventListener('click', () => {
  const distro = $('#config-distro-select')?.value;
  if (distro) cfgLoadWslConf(distro);
});

// Restart WSL button
$('#config-restart-btn')?.addEventListener('click', async () => {
  const btn = $('#config-restart-btn');
  btn.disabled = true;
  try {
    // Restart the default distro (or first available)
    const distro = state.distros.find(d => d.isDefault)?.name || state.distros[0]?.name;
    if (distro) {
      await window.wslCleaner.restartDistro({ distro, taskId: 'config-restart' });
      $('#config-restart-banner').classList.add('hidden');
      cfgShowToast('WSL restarted');
    }
  } catch { /* ignore */ }
  btn.disabled = false;
});

// ── Startup Manager ─────────────────────────────────────────────────────────

const startupDistroSelect = $('#startup-distro');
const startupContent = $('#startup-content');
const startupLoading = $('#startup-loading');
const startupEmpty = $('#startup-empty');
const startupError = $('#startup-error');
const startupErrorMsg = $('#startup-error-msg');
const startupNoSystemd = $('#startup-no-systemd');
const startupServicesList = $('#startup-services-list');
const startupSearch = $('#startup-search');
const startupSummary = $('#startup-summary');
const startupRcLocal = $('#startup-rclocal');
const startupRcLocalContent = $('#startup-rclocal-content');
const startupInitName = $('#startup-init-name');
const btnStartupRefresh = $('#btn-startup-refresh');

let _startupServices = [];
let _startupFilter = 'all';
let _startupSearchDebounce = null;

function showStartupState(which) {
  startupContent.classList.add('hidden');
  startupLoading.classList.add('hidden');
  startupEmpty.classList.add('hidden');
  startupError.classList.add('hidden');
  startupNoSystemd.classList.add('hidden');
  if (which === 'content') startupContent.classList.remove('hidden');
  else if (which === 'loading') startupLoading.classList.remove('hidden');
  else if (which === 'empty') startupEmpty.classList.remove('hidden');
  else if (which === 'error') startupError.classList.remove('hidden');
  else if (which === 'no-systemd') startupNoSystemd.classList.remove('hidden');
}

function populateStartupDistros() {
  startupDistroSelect.innerHTML = '';
  for (const d of state.distros) {
    const opt = document.createElement('option');
    opt.value = d.name;
    opt.textContent = d.name;
    if (state.selectedDistros.includes(d.name)) opt.selected = true;
    startupDistroSelect.appendChild(opt);
  }
}

async function renderStartupPage() {
  populateStartupDistros();

  const distro = startupDistroSelect.value;
  if (!distro) {
    showStartupState('empty');
    return;
  }

  showStartupState('loading');

  try {
    const [servicesResult, rcResult] = await Promise.all([
      window.wslCleaner.getStartupServices(distro),
      window.wslCleaner.getRcLocal(distro),
    ]);

    if (!servicesResult.ok) {
      startupErrorMsg.textContent = servicesResult.error || t('startup.error');
      showStartupState('error');
      return;
    }

    if (servicesResult.data.initSystem !== 'systemd') {
      if (rcResult.ok && rcResult.exists) {
        startupRcLocalContent.textContent = rcResult.content;
        startupRcLocal.classList.remove('hidden');
      }
      showStartupState('no-systemd');
      return;
    }

    _startupServices = servicesResult.data.services;
    startupInitName.textContent = t('startup.initSystemd');

    renderStartupServiceList();

    if (rcResult.ok && rcResult.exists) {
      startupRcLocalContent.textContent = rcResult.content;
      startupRcLocal.classList.remove('hidden');
    } else {
      startupRcLocal.classList.add('hidden');
    }

    showStartupState('content');
  } catch (err) {
    startupErrorMsg.textContent = t('startup.error');
    showStartupState('error');
  }
}

function getStartupStateClass(unitFileState) {
  switch (unitFileState) {
    case 'enabled': return 'startup-state-enabled';
    case 'disabled': return 'startup-state-disabled';
    case 'static': return 'startup-state-static';
    case 'masked': return 'startup-state-masked';
    default: return '';
  }
}

function getStartupActiveClass(activeState) {
  switch (activeState) {
    case 'active': return 'startup-active-active';
    case 'failed': return 'startup-active-failed';
    case 'inactive': return 'startup-active-inactive';
    default: return '';
  }
}

function renderStartupServiceList() {
  const query = (startupSearch.value || '').toLowerCase().trim();
  const filter = _startupFilter;

  const filtered = _startupServices.filter(svc => {
    if (filter !== 'all' && svc.unitFileState !== filter) return false;
    if (query && !svc.unit.toLowerCase().includes(query)) return false;
    return true;
  });

  const enabledCount = _startupServices.filter(s => s.unitFileState === 'enabled').length;
  const disabledCount = _startupServices.filter(s => s.unitFileState === 'disabled').length;
  const staticCount = _startupServices.filter(s => s.unitFileState === 'static').length;
  const maskedCount = _startupServices.filter(s => s.unitFileState === 'masked').length;
  startupSummary.textContent = t('startup.summary', {
    total: _startupServices.length,
    enabled: enabledCount,
    disabled: disabledCount,
    static: staticCount,
    masked: maskedCount,
  });

  startupServicesList.innerHTML = '';

  if (filtered.length === 0) {
    startupServicesList.innerHTML = '<div class="health-table-empty">' + escapeHtml(t('startup.noResults')) + '</div>';
    return;
  }

  let html = '<table class="health-table startup-table"><thead><tr>';
  html += '<th>' + escapeHtml(t('startup.col.service')) + '</th>';
  html += '<th>' + escapeHtml(t('startup.col.state')) + '</th>';
  html += '<th>' + escapeHtml(t('startup.col.active')) + '</th>';
  html += '<th>' + escapeHtml(t('startup.col.sub')) + '</th>';
  html += '<th>' + escapeHtml(t('startup.col.toggle')) + '</th>';
  html += '<th></th>';
  html += '</tr></thead><tbody>';

  for (const svc of filtered) {
    const canToggle = svc.unitFileState === 'enabled' || svc.unitFileState === 'disabled';
    const isEnabled = svc.unitFileState === 'enabled';
    const stateClass = getStartupStateClass(svc.unitFileState);
    const activeClass = getStartupActiveClass(svc.activeState);

    html += `<tr class="startup-service-row" data-unit="${escapeHtml(svc.unit)}">`;
    html += `<td class="mono startup-unit-name">${escapeHtml(svc.unit)}</td>`;
    html += `<td><span class="startup-state-badge ${stateClass}">${escapeHtml(svc.unitFileState)}</span></td>`;
    html += `<td><span class="startup-active-badge ${activeClass}">${escapeHtml(svc.activeState || '--')}</span></td>`;
    html += `<td class="mono">${escapeHtml(svc.subState || '--')}</td>`;
    html += '<td>';
    if (canToggle) {
      html += `<label class="toggle" onclick="event.stopPropagation()">`;
      html += `<input type="checkbox" data-unit="${escapeHtml(svc.unit)}" ${isEnabled ? 'checked' : ''} />`;
      html += `<span class="toggle-slider"></span></label>`;
    } else {
      html += `<span class="startup-no-toggle">${escapeHtml(svc.unitFileState)}</span>`;
    }
    html += '</td>';
    html += `<td><button class="startup-detail-btn" data-unit="${escapeHtml(svc.unit)}" title="${escapeHtml(t('startup.viewDetails'))}">`;
    html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6,9 12,15 18,9"/></svg>';
    html += '</button></td>';
    html += '</tr>';
    html += `<tr class="startup-detail-row hidden" data-detail-for="${escapeHtml(svc.unit)}">`;
    html += `<td colspan="6"><div class="startup-detail-panel"><div class="spinner startup-detail-spinner"></div></div></td>`;
    html += '</tr>';
  }

  html += '</tbody></table>';
  startupServicesList.innerHTML = html;

  // Wire toggle change handlers
  startupServicesList.querySelectorAll('input[type="checkbox"][data-unit]').forEach(cb => {
    cb.addEventListener('change', async (e) => {
      const unit = e.target.dataset.unit;
      const enabled = e.target.checked;
      e.target.disabled = true;

      const distro = startupDistroSelect.value;
      const result = await window.wslCleaner.setServiceState({ distro, unit, enabled });

      if (!result.ok) {
        e.target.checked = !enabled;
        console.error('[Startup] Toggle failed for', unit, ':', result.output);
      } else {
        // Update cached state
        const svc = _startupServices.find(s => s.unit === unit);
        if (svc) svc.unitFileState = enabled ? 'enabled' : 'disabled';

        // Update the badge in the same row
        const row = startupServicesList.querySelector(`tr[data-unit="${unit}"]`);
        if (row) {
          const badge = row.querySelector('.startup-state-badge');
          if (badge) {
            const newState = enabled ? 'enabled' : 'disabled';
            badge.textContent = newState;
            badge.className = 'startup-state-badge ' + getStartupStateClass(newState);
          }
        }

        // Update summary counts
        const enabledCount = _startupServices.filter(s => s.unitFileState === 'enabled').length;
        const disabledCount = _startupServices.filter(s => s.unitFileState === 'disabled').length;
        const staticCount = _startupServices.filter(s => s.unitFileState === 'static').length;
        const maskedCount = _startupServices.filter(s => s.unitFileState === 'masked').length;
        startupSummary.textContent = t('startup.summary', {
          total: _startupServices.length,
          enabled: enabledCount,
          disabled: disabledCount,
          static: staticCount,
          masked: maskedCount,
        });
      }
      e.target.disabled = false;
    });
  });

  // Wire detail expand buttons
  startupServicesList.querySelectorAll('.startup-detail-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const unit = btn.dataset.unit;
      const detailRow = startupServicesList.querySelector(`tr[data-detail-for="${unit}"]`);
      if (!detailRow) return;

      const isVisible = !detailRow.classList.contains('hidden');
      if (isVisible) {
        detailRow.classList.add('hidden');
        return;
      }

      // Collapse any other open detail
      startupServicesList.querySelectorAll('.startup-detail-row').forEach(r => r.classList.add('hidden'));
      detailRow.classList.remove('hidden');

      const panel = detailRow.querySelector('.startup-detail-panel');
      panel.innerHTML = '<div class="spinner startup-detail-spinner"></div>';

      const distro = startupDistroSelect.value;
      const result = await window.wslCleaner.getServiceDetails({ distro, unit });

      if (result.ok) {
        const d = result.data;
        panel.innerHTML = `
          <div class="startup-detail-grid">
            <div class="health-kv-row"><span class="health-kv-label">${escapeHtml(t('startup.detail.description'))}</span><span class="health-kv-value">${escapeHtml(d.Description || '--')}</span></div>
            <div class="health-kv-row"><span class="health-kv-label">${escapeHtml(t('startup.detail.type'))}</span><span class="health-kv-value mono">${escapeHtml(d.Type || '--')}</span></div>
            <div class="health-kv-row"><span class="health-kv-label">${escapeHtml(t('startup.detail.mainPid'))}</span><span class="health-kv-value mono">${escapeHtml(d.MainPID || '--')}</span></div>
            <div class="health-kv-row"><span class="health-kv-label">${escapeHtml(t('startup.detail.state'))}</span><span class="health-kv-value">${escapeHtml(d.ActiveState || '--')} (${escapeHtml(d.SubState || '--')})</span></div>
            <div class="health-kv-row"><span class="health-kv-label">${escapeHtml(t('startup.detail.unitFile'))}</span><span class="health-kv-value mono">${escapeHtml(d.FragmentPath || '--')}</span></div>
            <div class="health-kv-row"><span class="health-kv-label">${escapeHtml(t('startup.detail.wantedBy'))}</span><span class="health-kv-value mono">${escapeHtml(d.WantedBy || '--')}</span></div>
            <div class="health-kv-row"><span class="health-kv-label">${escapeHtml(t('startup.detail.started'))}</span><span class="health-kv-value">${escapeHtml(d.ExecMainStartTimestamp || '--')}</span></div>
          </div>
        `;
      } else {
        panel.innerHTML = '<div class="health-table-empty">' + escapeHtml(t('startup.detailError')) + '</div>';
      }
    });
  });
}

// Search
startupSearch.addEventListener('input', () => {
  clearTimeout(_startupSearchDebounce);
  _startupSearchDebounce = setTimeout(() => renderStartupServiceList(), 150);
});

startupSearch.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    startupSearch.value = '';
    renderStartupServiceList();
    startupSearch.blur();
  }
});

// Filter buttons
$$('.startup-filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.startup-filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    _startupFilter = btn.dataset.filter;
    renderStartupServiceList();
  });
});

// Refresh & distro change
btnStartupRefresh.addEventListener('click', () => renderStartupPage());
startupDistroSelect.addEventListener('change', () => renderStartupPage());

document.addEventListener('locale-changed', () => {
  renderTasks();
  renderDistroPicker();
  updateVhdxDisplay();
  // Update Cleaner button label for new locale
  if (btnSimpleGoLabel) {
    btnSimpleGoLabel.innerHTML = state.compactEnabled ? t('simple.cleanCompact') : t('simple.clean');
  }
  if (state.currentPage === 'diskmap') renderDiskMap();
  if (state.currentPage === 'health') renderHealthPage();
  if (state.currentPage === 'distros') renderDistrosPage();
  if (state.currentPage === 'startup') renderStartupPage();
  if (state.currentPage === 'performance') renderPerformancePage();
});

// ──────────────────────────────────────────────────────────────────────────────
// ── Performance Page ─────────────────────────────────────────────────────────
// ──────────────────────────────────────────────────────────────────────────────

const perfDistroSelect = document.getElementById('perf-distro');
const perfTabBenchmark = document.getElementById('perf-tab-benchmark');
const perfTabProfiler = document.getElementById('perf-tab-profiler');
const perfPanelBenchmark = document.getElementById('perf-panel-benchmark');
const perfPanelProfiler = document.getElementById('perf-panel-profiler');

// Benchmark elements
const btnRunBenchmark = document.getElementById('btn-run-benchmark');
const perfBenchAllDistros = document.getElementById('perf-bench-all-distros');
const perfBenchContent = document.getElementById('perf-bench-content');
const perfBenchLoading = document.getElementById('perf-bench-loading');
const perfBenchEmpty = document.getElementById('perf-bench-empty');
const perfBenchError = document.getElementById('perf-bench-error');
const perfBenchErrorMsg = document.getElementById('perf-bench-error-msg');
const perfBenchResults = document.getElementById('perf-bench-results');
const perfBenchList = document.getElementById('perf-bench-list');
const perfBenchHistory = document.getElementById('perf-bench-history');
const perfBenchChart = document.getElementById('perf-bench-chart');
const perfBenchSuggest = document.getElementById('perf-bench-suggest');
const perfBenchSuggestList = document.getElementById('perf-bench-suggest-list');

// Profiler elements
const btnRunProfiler = document.getElementById('btn-run-profiler');
const perfProfContent = document.getElementById('perf-prof-content');
const perfProfLoading = document.getElementById('perf-prof-loading');
const perfProfEmpty = document.getElementById('perf-prof-empty');
const perfProfError = document.getElementById('perf-prof-error');
const perfProfErrorMsg = document.getElementById('perf-prof-error-msg');
const perfProfShellInfo = document.getElementById('perf-prof-shell-info');
const perfProfShellName = document.getElementById('perf-prof-shell-name');
const perfProfTiming = document.getElementById('perf-prof-timing');
const perfProfTotal = document.getElementById('perf-prof-total');
const perfProfBaseline = document.getElementById('perf-prof-baseline');
const perfProfOverhead = document.getElementById('perf-prof-overhead');
const perfProfItems = document.getElementById('perf-prof-items');
const perfProfItemsList = document.getElementById('perf-prof-items-list');
const perfProfFiles = document.getElementById('perf-prof-files');
const perfProfFilesList = document.getElementById('perf-prof-files-list');

let perfCurrentTab = 'benchmark';
let perfBenchChartInstance = null;

// ── Page init ────────────────────────────────────────────────────────────────

function renderPerformancePage() {
  populatePerfDistros();

  // Show the active tab's empty state
  if (perfCurrentTab === 'benchmark') {
    if (!perfBenchContent.classList.contains('hidden') || !perfBenchLoading.classList.contains('hidden')) {
      // Already has results or loading, don't reset
    } else {
      showPerfBenchmarkState('empty');
    }
  } else {
    if (!perfProfContent.classList.contains('hidden') || !perfProfLoading.classList.contains('hidden')) {
      // Already has results or loading, don't reset
    } else {
      showPerfProfilerState('empty');
    }
  }
}

function populatePerfDistros() {
  perfDistroSelect.innerHTML = '';
  for (const d of state.distros) {
    const opt = document.createElement('option');
    opt.value = d.name;
    opt.textContent = d.name + (d.isDefault ? ' \u2605' : '');
    if (state.selectedDistros.includes(d.name)) opt.selected = true;
    perfDistroSelect.appendChild(opt);
  }
}

// ── Tab switching ────────────────────────────────────────────────────────────

perfTabBenchmark.addEventListener('click', () => {
  perfCurrentTab = 'benchmark';
  perfTabBenchmark.classList.add('active');
  perfTabProfiler.classList.remove('active');
  perfPanelBenchmark.classList.remove('hidden');
  perfPanelProfiler.classList.add('hidden');
});

perfTabProfiler.addEventListener('click', () => {
  perfCurrentTab = 'profiler';
  perfTabProfiler.classList.add('active');
  perfTabBenchmark.classList.remove('active');
  perfPanelProfiler.classList.remove('hidden');
  perfPanelBenchmark.classList.add('hidden');
});

// ── Benchmark state management ───────────────────────────────────────────────

function showPerfBenchmarkState(which) {
  perfBenchContent.classList.add('hidden');
  perfBenchLoading.classList.add('hidden');
  perfBenchEmpty.classList.add('hidden');
  perfBenchError.classList.add('hidden');
  if (which === 'content') perfBenchContent.classList.remove('hidden');
  else if (which === 'loading') perfBenchLoading.classList.remove('hidden');
  else if (which === 'empty') perfBenchEmpty.classList.remove('hidden');
  else if (which === 'error') perfBenchError.classList.remove('hidden');
}

// ── Run benchmark ────────────────────────────────────────────────────────────

btnRunBenchmark.addEventListener('click', async () => {
  const benchAll = perfBenchAllDistros.checked;
  const distros = benchAll ? state.distros.map(d => d.name) : [perfDistroSelect.value];

  if (!distros.length || !distros[0]) {
    showPerfBenchmarkState('empty');
    return;
  }

  // Warn user that wsl --shutdown will kill all instances
  const msg = t('performance.shutdownWarning');
  if (!confirm(msg)) return;

  showPerfBenchmarkState('loading');

  try {
    const result = await window.wslCleaner.benchmarkStartupTime({ distros });

    if (!result.ok) {
      perfBenchErrorMsg.textContent = result.error || t('performance.benchmarkError');
      showPerfBenchmarkState('error');
      return;
    }

    populateBenchmarkResults(result.data);
    showPerfBenchmarkState('content');

    // Save to history
    try {
      await window.wslCleaner.saveBenchmarkRecord({ results: result.data.results });
    } catch (e) {
      console.warn('[Performance] Failed to save benchmark history:', e);
    }

    // Refresh history chart
    loadBenchmarkHistory();
  } catch (err) {
    perfBenchErrorMsg.textContent = (err.message || String(err));
    showPerfBenchmarkState('error');
  }
});

function populateBenchmarkResults(data) {
  perfBenchList.innerHTML = '';
  perfBenchSuggestList.innerHTML = '';

  const results = [...data.results].sort((a, b) => a.bootTimeSeconds - b.bootTimeSeconds);

  results.forEach(item => {
    const row = document.createElement('div');
    row.className = 'perf-bench-row';

    let statusClass, statusLabel;
    if (item.bootTimeSeconds < 0) {
      statusClass = 'error';
      statusLabel = t('performance.failed');
    } else if (item.bootTimeSeconds < 1) {
      statusClass = 'fast';
      statusLabel = t('performance.fast');
    } else if (item.bootTimeSeconds < 3) {
      statusClass = 'normal';
      statusLabel = t('performance.normal');
    } else {
      statusClass = 'slow';
      statusLabel = t('performance.slow');
    }

    const timeDisplay = item.bootTimeSeconds < 0
      ? '<span class="perf-bench-time perf-bench-error-text">' + escapeHtml(item.error || 'Error') + '</span>'
      : '<span class="perf-bench-time">' + item.bootTimeSeconds.toFixed(3) + 's</span>';

    row.innerHTML =
      '<div class="perf-bench-distro">' +
        '<span class="perf-bench-name">' + escapeHtml(item.distro) + '</span>' +
        '<span class="perf-bench-badge perf-bench-' + statusClass + '">' + escapeHtml(statusLabel) + '</span>' +
      '</div>' +
      timeDisplay;

    perfBenchList.appendChild(row);
  });

  perfBenchResults.classList.remove('hidden');

  // Generate suggestions for slow distros
  const slowDistros = results.filter(r => r.bootTimeSeconds >= 3);
  if (slowDistros.length > 0) {
    slowDistros.forEach(item => {
      const card = document.createElement('div');
      card.className = 'perf-suggest-card';
      card.innerHTML =
        '<div class="perf-suggest-header"><strong>' + escapeHtml(item.distro) + '</strong> \u2014 ' + item.bootTimeSeconds.toFixed(2) + 's</div>' +
        '<ul class="perf-suggest-list">' +
          '<li>' + escapeHtml(t('performance.suggestion.wslconfig')) + '</li>' +
          '<li>' + escapeHtml(t('performance.suggestion.systemd')) + '</li>' +
          '<li>' + escapeHtml(t('performance.suggestion.startupServices')) + '</li>' +
        '</ul>';
      perfBenchSuggestList.appendChild(card);
    });
    perfBenchSuggest.classList.remove('hidden');
  } else {
    perfBenchSuggest.classList.add('hidden');
  }
}

// ── Benchmark history chart ──────────────────────────────────────────────────

async function loadBenchmarkHistory() {
  try {
    const history = await window.wslCleaner.getBenchmarkHistory();
    if (!history || history.length === 0) {
      perfBenchHistory.classList.add('hidden');
      return;
    }
    renderBenchmarkHistoryChart(history);
    perfBenchHistory.classList.remove('hidden');
  } catch (err) {
    console.warn('[Performance] Failed to load history:', err);
    perfBenchHistory.classList.add('hidden');
  }
}

function renderBenchmarkHistoryChart(history) {
  // Group by distro
  const distroMap = {};
  const labels = [];

  history.forEach(record => {
    const label = new Date(record.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    labels.push(label);
    record.results.forEach(r => {
      if (!distroMap[r.distro]) distroMap[r.distro] = [];
    });
  });

  // Fill data arrays (null for missing entries)
  const distroNames = Object.keys(distroMap);
  history.forEach(record => {
    const resultMap = {};
    record.results.forEach(r => { resultMap[r.distro] = r.bootTimeSeconds; });
    distroNames.forEach(name => {
      distroMap[name].push(resultMap[name] !== undefined ? resultMap[name] : null);
    });
  });

  const colors = ['#00d4aa', '#ff6b9d', '#feca57', '#5f27cd', '#48dbfb', '#ff9f43'];
  const datasets = distroNames.map((name, idx) => ({
    label: name,
    data: distroMap[name],
    borderColor: colors[idx % colors.length],
    backgroundColor: colors[idx % colors.length] + '30',
    borderWidth: 2,
    tension: 0.2,
    pointRadius: 4,
    pointHoverRadius: 6,
    spanGaps: true,
  }));

  if (perfBenchChartInstance) {
    perfBenchChartInstance.destroy();
  }

  const ctx = perfBenchChart.getContext('2d');
  perfBenchChartInstance = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: {
          ticks: { color: 'rgba(255,255,255,0.5)', maxRotation: 45 },
          grid: { color: 'rgba(255,255,255,0.06)' },
        },
        y: {
          beginAtZero: true,
          title: { display: true, text: t('performance.chartBootTime'), color: 'rgba(255,255,255,0.5)' },
          ticks: { color: 'rgba(255,255,255,0.5)', callback: v => v + 's' },
          grid: { color: 'rgba(255,255,255,0.06)' },
        },
      },
      plugins: {
        legend: { display: true, position: 'top', labels: { color: 'rgba(255,255,255,0.7)' } },
        tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': ' + (ctx.parsed.y !== null ? ctx.parsed.y.toFixed(3) + 's' : '--') } },
      },
    },
  });
}

// ── Profiler state management ────────────────────────────────────────────────

function showPerfProfilerState(which) {
  perfProfContent.classList.add('hidden');
  perfProfLoading.classList.add('hidden');
  perfProfEmpty.classList.add('hidden');
  perfProfError.classList.add('hidden');
  if (which === 'content') perfProfContent.classList.remove('hidden');
  else if (which === 'loading') perfProfLoading.classList.remove('hidden');
  else if (which === 'empty') perfProfEmpty.classList.remove('hidden');
  else if (which === 'error') perfProfError.classList.remove('hidden');
}

// ── Run profiler ─────────────────────────────────────────────────────────────

btnRunProfiler.addEventListener('click', async () => {
  const distro = perfDistroSelect.value;
  if (!distro) {
    showPerfProfilerState('empty');
    return;
  }

  showPerfProfilerState('loading');

  try {
    const result = await window.wslCleaner.profileShellStartup({ distro });

    if (!result.ok) {
      perfProfErrorMsg.textContent = result.error || t('performance.profilerError');
      showPerfProfilerState('error');
      return;
    }

    populateProfilerResults(result.data);
    showPerfProfilerState('content');
  } catch (err) {
    perfProfErrorMsg.textContent = (err.message || String(err));
    showPerfProfilerState('error');
  }
});

function populateProfilerResults(data) {
  // Shell info banner
  perfProfShellName.textContent = data.shell + (data.shellVersion !== 'unknown' ? ' \u2014 ' + data.shellVersion : '');
  perfProfShellInfo.classList.remove('hidden');

  // Timing summary
  perfProfTotal.textContent = data.totalTimeSeconds.toFixed(3) + 's';
  perfProfBaseline.textContent = data.baselineTimeSeconds.toFixed(3) + 's';
  perfProfOverhead.textContent = data.rcOverheadSeconds.toFixed(3) + 's';
  perfProfTiming.classList.remove('hidden');

  // Slow items
  perfProfItemsList.innerHTML = '';
  if (data.slowItems.length === 0) {
    perfProfItemsList.innerHTML = '<div class="perf-prof-no-items">' + escapeHtml(t('performance.noSlowItems')) + '</div>';
  } else {
    data.slowItems.forEach(item => {
      const card = document.createElement('div');
      card.className = 'perf-prof-item-card';
      card.innerHTML =
        '<div class="perf-prof-item-header">' +
          '<span class="perf-prof-item-name">' + escapeHtml(item.name) + '</span>' +
          '<span class="perf-prof-item-file">' + escapeHtml(item.file) + '</span>' +
        '</div>' +
        (item.suggestion ? '<div class="perf-prof-item-suggestion">' + escapeHtml(item.suggestion) + '</div>' : '');
      perfProfItemsList.appendChild(card);
    });
  }
  perfProfItems.classList.remove('hidden');

  // Files analyzed
  perfProfFilesList.innerHTML = '';
  if (data.filesAnalyzed.length === 0) {
    perfProfFilesList.innerHTML = '<div class="perf-prof-no-items">' + escapeHtml(t('performance.noFiles')) + '</div>';
  } else {
    // Sort by source time descending
    const files = [...data.filesAnalyzed].sort((a, b) => b.sourceTimeMs - a.sourceTimeMs);
    files.forEach(file => {
      const row = document.createElement('div');
      row.className = 'perf-prof-file-row';
      row.innerHTML =
        '<span class="perf-prof-file-path">' + escapeHtml(file.path) + '</span>' +
        '<span class="perf-prof-file-meta">' +
          '<span class="perf-prof-file-lines">' + file.lineCount + ' ' + t('performance.lines') + '</span>' +
          '<span class="perf-prof-file-time">' + file.sourceTimeSeconds.toFixed(3) + 's</span>' +
        '</span>';
      perfProfFilesList.appendChild(row);
    });
  }
  perfProfFiles.classList.remove('hidden');
}
