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
    name: 'Clean VS Code / Cursor / Windsurf Server',
    desc: 'Removes extension caches and log files from <code>~/.vscode-server</code>, <code>~/.cursor-server</code>, and <code>~/.windsurf-server</code>. Preserves extensions and settings.',
    command: 'rm -rf ~/.vscode-server/extensionCache ~/.vscode-server/bin/*/log ~/.vscode-server/data/logs ~/.cursor-server/extensionCache ~/.cursor-server/bin/*/log ~/.cursor-server/data/logs ~/.windsurf-server/extensionCache ~/.windsurf-server/bin/*/log ~/.windsurf-server/data/logs',
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
  {
    id: 'laravel-clean',
    name: 'Clean Laravel Logs &amp; Cache',
    desc: 'Finds Laravel projects under <code>/home</code> and <code>/var/www</code> and removes log files from <code>storage/logs</code> and disk cache from <code>storage/framework/cache/data</code> and <code>storage/framework/views</code>.',
    command: 'find /home /var/www -maxdepth 5 -name artisan -type f 2>/dev/null | while IFS= read -r artisan; do dir=$(dirname "$artisan"); if [ -d "$dir/storage/logs" ]; then find "$dir/storage/logs" -name "*.log*" -type f -delete 2>/dev/null && echo "Cleaned logs: $dir"; fi; if [ -d "$dir/storage/framework/cache/data" ]; then rm -rf "$dir/storage/framework/cache/data/"* 2>/dev/null && echo "Cleaned cache: $dir"; fi; if [ -d "$dir/storage/framework/views" ]; then find "$dir/storage/framework/views" -name "*.php" -type f -delete 2>/dev/null && echo "Cleaned views: $dir"; fi; done; echo "Laravel cleanup complete"',
    asRoot: true,
    requires: null,
  },
  {
    id: 'framework-caches',
    name: 'Clean Framework Build Caches',
    desc: 'Finds JS/TS projects and removes regenerable build caches: <code>.next/cache</code>, <code>.angular/cache</code>, <code>node_modules/.cache</code>, <code>.svelte-kit</code>, <code>.tsbuildinfo</code> files, and more.',
    command: [
      'echo "Cleaning node_modules/.cache..."',
      'find /home /var/www -maxdepth 8 -type d -name .cache -path "*/node_modules/.cache" -exec rm -rf {} + 2>/dev/null',
      'echo "Cleaning .next/cache..."',
      'find /home /var/www -maxdepth 8 -type d -name cache -path "*/.next/cache" -exec rm -rf {} + 2>/dev/null',
      'echo "Cleaning .angular/cache..."',
      'find /home /var/www -maxdepth 8 -type d -name cache -path "*/.angular/cache" -exec rm -rf {} + 2>/dev/null',
      'echo "Cleaning .svelte-kit..."',
      'find /home /var/www -maxdepth 8 -type d -name .svelte-kit -exec rm -rf {} + 2>/dev/null',
      'echo "Cleaning .nuxt caches..."',
      'find /home /var/www -maxdepth 8 -type d \\( -path "*/.nuxt/.cache" -o -path "*/.nuxt/analyze" \\) -exec rm -rf {} + 2>/dev/null',
      'echo "Cleaning .parcel-cache..."',
      'find /home /var/www -maxdepth 8 -type d -name .parcel-cache -exec rm -rf {} + 2>/dev/null',
      'echo "Cleaning .turbo..."',
      'find /home /var/www -maxdepth 8 -type d -name .turbo -exec rm -rf {} + 2>/dev/null',
      'echo "Cleaning .tsbuildinfo files..."',
      'find /home /var/www -maxdepth 8 -type f -name "*.tsbuildinfo" -delete 2>/dev/null',
      'echo "Framework build caches cleaned"',
    ].join('; '),
    asRoot: true,
    requires: null,
  },
  {
    id: 'docker-prune',
    name: 'Clean Docker Dangling Artifacts',
    desc: 'Removes dangling (untagged) images, unused networks, and stale build cache. All named/tagged images, containers, and volumes are preserved.',
    command: 'docker image prune -f 2>/dev/null && docker network prune -f 2>/dev/null && docker builder prune -f 2>/dev/null && echo "Docker dangling artifacts cleaned"',
    asRoot: false,
    requires: 'docker',
  },
  {
    id: 'pip-cache',
    name: 'Clean Pip Cache Directory',
    desc: 'Removes downloaded pip packages from <code>~/.cache/pip</code>.',
    command: 'rm -rf ~/.cache/pip/*',
    asRoot: false,
    requires: null,
  },
  {
    id: 'pnpm-cache',
    name: 'Clean pnpm Store',
    desc: 'Prunes the pnpm content-addressable store and removes temp files.',
    command: 'pnpm store prune 2>/dev/null; rm -rf ~/.local/share/pnpm/store/v3/tmp/* 2>/dev/null; echo "pnpm store pruned"',
    asRoot: false,
    requires: 'pnpm',
  },
  {
    id: 'composer-cache',
    name: 'Clean Composer Cache',
    desc: 'Clears the PHP Composer download cache from <code>~/.cache/composer</code>.',
    command: 'composer clear-cache 2>/dev/null || rm -rf ~/.cache/composer/* ~/.composer/cache/* 2>/dev/null; echo "Composer cache cleaned"',
    asRoot: false,
    requires: 'composer',
  },
  {
    id: 'maven-cache',
    name: 'Clean Maven Cache',
    desc: 'Removes cached Maven artifacts from <code>~/.m2/repository</code>. Can reclaim 5&ndash;15 GB for active Java projects.',
    command: 'rm -rf ~/.m2/repository/*; echo "Maven cache cleaned"',
    asRoot: false,
    requires: 'mvn',
  },
  {
    id: 'gradle-cache',
    name: 'Clean Gradle Cache',
    desc: 'Removes Gradle build caches and wrapper distributions from <code>~/.gradle</code>.',
    command: 'rm -rf ~/.gradle/caches/* ~/.gradle/wrapper/dists/*; echo "Gradle cache cleaned"',
    asRoot: false,
    requires: 'gradle',
  },
  {
    id: 'conda-cache',
    name: 'Clean Conda Cache',
    desc: 'Removes unused Conda packages, tarballs, and cached downloads.',
    command: 'conda clean --all -y 2>/dev/null || true; echo "Conda cache cleaned"',
    asRoot: false,
    requires: 'conda',
  },
  {
    id: 'gem-cache',
    name: 'Clean Ruby Gems Cache',
    desc: 'Runs <code>gem cleanup</code> and removes cached gem files from <code>~/.gem</code>.',
    command: 'gem cleanup 2>/dev/null; rm -rf ~/.gem/ruby/*/cache/* 2>/dev/null; echo "Gem cache cleaned"',
    asRoot: false,
    requires: 'gem',
  },
  {
    id: 'nuget-cache',
    name: 'Clean NuGet Cache',
    desc: 'Clears .NET NuGet package caches from <code>~/.nuget</code> and local share.',
    command: 'dotnet nuget locals all --clear 2>/dev/null || rm -rf ~/.nuget/packages/* ~/.local/share/NuGet/* 2>/dev/null; echo "NuGet cache cleaned"',
    asRoot: false,
    requires: 'dotnet',
  },
  {
    id: 'deno-cache',
    name: 'Clean Deno Cache',
    desc: 'Removes cached remote modules and compiled files from <code>~/.cache/deno</code> and <code>~/.deno/cache</code>.',
    command: 'rm -rf ~/.cache/deno/* ~/.deno/cache/* 2>/dev/null; echo "Deno cache cleaned"',
    asRoot: false,
    requires: 'deno',
  },
  {
    id: 'bun-cache',
    name: 'Clean Bun Cache',
    desc: 'Removes cached packages from <code>~/.bun/install/cache</code>.',
    command: 'rm -rf ~/.bun/install/cache/* 2>/dev/null; echo "Bun cache cleaned"',
    asRoot: false,
    requires: 'bun',
  },
  {
    id: 'dart-cache',
    name: 'Clean Dart/Flutter Pub Cache',
    desc: 'Clears the Dart/Flutter package cache from <code>~/.pub-cache</code>.',
    command: 'rm -rf ~/.pub-cache/hosted/pub.dev/*/.cache 2>/dev/null; dart pub cache clean -f 2>/dev/null || rm -rf ~/.pub-cache/_temp/* 2>/dev/null; echo "Pub cache cleaned"',
    asRoot: false,
    requires: 'dart',
  },
  {
    id: 'brew-cache',
    name: 'Clean Homebrew/Linuxbrew Cache',
    desc: 'Removes old downloads and formula from <code>~/.cache/Homebrew</code>.',
    command: 'brew cleanup --prune=all -s 2>/dev/null; rm -rf ~/.cache/Homebrew/* 2>/dev/null; echo "Homebrew cache cleaned"',
    asRoot: false,
    requires: 'brew',
  },
  {
    id: 'db-logs',
    name: 'Clean Database Logs',
    desc: 'Removes MySQL/MariaDB and PostgreSQL log files from <code>/var/log</code>. Safe to clean on dev instances.',
    command: 'find /var/log/mysql /var/log/postgresql -type f 2>/dev/null -delete; rm -rf /var/lib/mysql/*.log.* 2>/dev/null; echo "Database logs cleaned"',
    asRoot: true,
    requires: null,
  },
  {
    id: 'k8s-cache',
    name: 'Clean Kubernetes &amp; Helm Cache',
    desc: 'Removes kubectl API discovery cache from <code>~/.kube/cache</code> and Helm chart cache from <code>~/.cache/helm</code>.',
    command: 'rm -rf ~/.kube/cache/* ~/.cache/helm/* 2>/dev/null; echo "Kubernetes caches cleaned"',
    asRoot: false,
    requires: null,
  },
  {
    id: 'editor-swap',
    name: 'Clean Vim/Neovim Swap &amp; Undo Files',
    desc: 'Removes leftover swap, undo, and shada files from Vim and Neovim.',
    command: 'rm -rf ~/.local/share/nvim/swap/* ~/.local/share/nvim/shada/* ~/.vim/undo/* ~/.vim/swap/* 2>/dev/null; find ~ -maxdepth 1 -name ".*.swp" -delete 2>/dev/null; echo "Editor swap/undo files cleaned"',
    asRoot: false,
    requires: null,
  },
  {
    id: 'git-gc',
    name: 'Compact Git Repositories',
    desc: 'Finds all git repos under <code>/home</code> and aggressively compacts them: expires reflog entries and repacks objects with maximum compression. Branches, tags, and reachable commits are untouched. Reflog recovery history is lost.',
    command: 'find /home -maxdepth 6 -type d -name .git 2>/dev/null | while IFS= read -r gitdir; do repo=$(dirname "$gitdir"); echo "Compacting: $repo"; git -C "$repo" reflog expire --expire=now --all 2>/dev/null; git -C "$repo" gc --prune=now --aggressive 2>/dev/null; done; echo "Git compaction complete"',
    asRoot: true,
    requires: null,
  },
  {
    id: 'shell-caches',
    name: 'Clean Shell Completion Caches',
    desc: 'Removes Zsh completion dumps (<code>~/.zcompdump*</code>), oh-my-zsh cache, and Zsh session files. Rebuilt automatically.',
    command: 'rm -f ~/.zcompdump* 2>/dev/null; rm -rf ~/.oh-my-zsh/cache/* 2>/dev/null; rm -rf ~/.zsh_sessions/* 2>/dev/null; echo "Shell caches cleaned"',
    asRoot: false,
    requires: null,
  },
  {
    id: 'jupyter-runtime',
    name: 'Clean Jupyter Runtime Files',
    desc: 'Removes leftover kernel connection files and runtime data from <code>~/.local/share/jupyter/runtime</code>.',
    command: 'rm -rf ~/.local/share/jupyter/runtime/* 2>/dev/null; echo "Jupyter runtime cleaned"',
    asRoot: false,
    requires: null,
  },
  {
    id: 'ccache-clean',
    name: 'Clean ccache',
    desc: 'Clears the C/C++ compiler cache from <code>~/.ccache</code>. Can reclaim several GB.',
    command: 'ccache -C 2>/dev/null || rm -rf ~/.ccache/* 2>/dev/null; echo "ccache cleaned"',
    asRoot: false,
    requires: 'ccache',
  },
  {
    id: 'bazel-cache',
    name: 'Clean Bazel Cache',
    desc: 'Removes Bazel build cache from <code>~/.cache/bazel</code>. Can be 10+ GB.',
    command: 'rm -rf ~/.cache/bazel/* 2>/dev/null; echo "Bazel cache cleaned"',
    asRoot: false,
    requires: 'bazel',
  },
  {
    id: 'core-dumps',
    name: 'Clean Core Dumps &amp; Crash Reports',
    desc: 'Removes crash reports from <code>/var/crash</code> and coredumps from <code>/var/lib/systemd/coredump</code>.',
    command: 'rm -rf /var/crash/* /var/lib/systemd/coredump/* 2>/dev/null; echo "Core dumps cleaned"',
    asRoot: true,
    requires: null,
  },
  {
    id: 'old-kernels',
    name: 'Remove Old Kernel Packages',
    desc: 'WSL uses its own kernel, so any installed <code>linux-image</code>, <code>linux-headers</code>, or <code>linux-modules</code> packages are dead weight. (Debian/Ubuntu only)',
    command: 'dpkg -l "linux-image-*" 2>/dev/null | awk "/^ii/{print \\$2}" | xargs -r apt-get -y purge 2>/dev/null; dpkg -l "linux-headers-*" 2>/dev/null | awk "/^ii/{print \\$2}" | xargs -r apt-get -y purge 2>/dev/null; dpkg -l "linux-modules-*" 2>/dev/null | awk "/^ii/{print \\$2}" | xargs -r apt-get -y purge 2>/dev/null; echo "Old kernel packages removed"',
    asRoot: true,
    requires: 'apt',
  },
  {
    id: 'font-cache',
    name: 'Clean Font Cache',
    desc: 'Removes font cache files from <code>/var/cache/fontconfig</code> and <code>~/.cache/fontconfig</code>. Rebuilt automatically on demand.',
    command: 'rm -rf /var/cache/fontconfig/* ~/.cache/fontconfig/* 2>/dev/null; echo "Font cache cleaned"',
    asRoot: true,
    requires: null,
  },
  {
    id: 'fstrim',
    name: 'Filesystem TRIM',
    desc: 'Runs <code>fstrim</code> to inform the virtual disk which blocks are free. Makes VHDX compaction dramatically more effective. Falls back to zero-filling free space if TRIM is not supported.',
    command: 'fstrim / 2>/dev/null || (echo "fstrim not supported, zero-filling free space..." && dd if=/dev/zero of=/zero.fill bs=1M 2>/dev/null; rm -f /zero.fill); echo "TRIM complete"',
    asRoot: true,
    requires: null,
  },
  {
    id: 'general-cache',
    name: 'Clean All User Caches',
    desc: 'Blanket cleanup of the entire <code>~/.cache</code> directory. Catches miscellaneous app caches not covered by other tasks.',
    command: 'du -sh ~/.cache 2>/dev/null; rm -rf ~/.cache/*; echo "User cache cleaned"',
    asRoot: false,
    requires: null,
    aggressive: true,
  },
  {
    id: 'man-pages',
    name: 'Remove Man Pages &amp; Docs',
    desc: 'Deletes offline manual pages, documentation, and info files from <code>/usr/share</code>. Saves 200&ndash;400 MB. Regenerated when packages are reinstalled.',
    command: 'rm -rf /usr/share/man/* /usr/share/doc/* /usr/share/info/*; echo "Man pages and docs removed"',
    asRoot: true,
    requires: null,
    aggressive: true,
  },
  {
    id: 'locales',
    name: 'Remove Unused Locales',
    desc: 'Removes all locale data except English from <code>/usr/share/locale</code>. Saves 100+ MB. Do not use if you need non-English locales.',
    command: 'find /usr/share/locale -maxdepth 1 -mindepth 1 -type d ! -name "en*" -exec rm -rf {} + 2>/dev/null; echo "Unused locales removed"',
    asRoot: true,
    requires: null,
    aggressive: true,
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

  appendLog('\n── Running filesystem TRIM...\n');
  const fstrimTask = TASKS.find(t => t.id === 'fstrim');
  const fstrimRes = await window.wslCleaner.runCleanup({
    distro: state.distro,
    taskId: 'compact-fstrim',
    command: fstrimTask.command,
    asRoot: fstrimTask.asRoot,
  });
  appendLog(fstrimRes.ok ? '   TRIM complete.\n' : '   TRIM finished (may have used zero-fill fallback).\n');

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

  // Step 1: Run all available non-aggressive cleanup tasks (fstrim has its own step)
  setSimpleStep('cleanup', 'active');
  const availableTasks = TASKS.filter(t => !t.aggressive && t.id !== 'fstrim' && (!t.requires || state.tools[t.requires]));
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

  // Step 1c: Filesystem TRIM (makes VHDX compaction much more effective)
  setSimpleStep('fstrim', 'active');
  const fstrimTask = TASKS.find(t => t.id === 'fstrim');
  const fstrimResult = await window.wslCleaner.runCleanup({
    distro: state.distro,
    taskId: 'fstrim',
    command: fstrimTask.command,
    asRoot: fstrimTask.asRoot,
  });
  setSimpleStep('fstrim', fstrimResult.ok ? 'done' : 'failed');

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
