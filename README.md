# WSL Cleaner

> **WARNING: This tool permanently deletes files inside your WSL distribution.** It is designed for developers who understand what is being removed. Deleted files include caches, logs, build artifacts, and other regenerable data -- but once removed they are gone. **Use Settings** to review exactly what each task does before running the cleaner. Always ensure you have backups of anything important. The authors are not responsible for any data loss.

Designed for developers who use Windows 10/11 with WSL2, and have large WSL2 volumes that need cleaning and compacting. Can often save 10-100+ GB of space on your SSD.

[![Download](https://img.shields.io/badge/Download-Latest%20Release-brightgreen?style=for-the-badge)](https://github.com/dbfx/wsl-cleaner/releases)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

![WSL Cleaner](assets/combo.png)

## Features

### Cleaner

One-click "Clean & Compact" that runs all enabled cleanup tasks, removes stale directories, runs filesystem TRIM, and compacts your virtual disk automatically. Shows step-by-step progress with a live timer and before/after disk size comparison. Failed steps show expandable error details so you can see exactly what went wrong. Celebration effects play when space is saved (confetti for 1 GB+).

You can also run "Clean only" mode (without compaction) for a faster pass that skips the WSL shutdown/restart cycle.

### Settings

Full control over every cleanup task. Each task has a toggle, a description explaining exactly what it does, and shows estimated reclaimable space. Tasks are organized into collapsible categories and can be searched with the filter bar.

#### Cleanup Tasks (60+)

**System**
- Update System Packages -- `apt-get update && upgrade` or `dnf upgrade` (auto-detects distro)
- Clean Old Packages -- `apt autoremove && clean` or `dnf clean all && autoremove`
- Shrink Systemd Journal -- vacuum logs to 10 MB / 2 weeks
- Clean Temporary Files -- clear `/tmp` and `/var/tmp`
- Clean Old Rotated Logs -- remove `.gz`, `.old`, `.1` files from `/var/log`
- Truncate Active Log Files -- empty syslog and `*.log` files without deleting
- Clean Apt Package Lists -- remove cached package lists (Debian/Ubuntu)
- Clean Snap Cache -- remove cached snap packages
- Remove Old Snap Revisions -- purge disabled snap versions (can save several GB)
- Clean Core Dumps & Crash Reports -- clear `/var/crash` and `/var/lib/systemd/coredump`
- Remove Old Kernel Packages -- purge unused `linux-image`, `linux-headers`, `linux-modules` (Debian/Ubuntu)
- Clean Font Cache -- clear fontconfig caches (rebuilt on demand)
- Clean Database Logs -- remove MySQL/MariaDB and PostgreSQL log files
- Filesystem TRIM -- `fstrim` (or zero-fill fallback) to make VHDX compaction dramatically more effective

**User & Editor**
- Clean User Caches -- npm, pip, Mozilla, and Chrome caches
- Clean VS Code / Cursor / Windsurf Server -- extension caches and logs (preserves extensions and settings)
- Clean Old VS Code / Cursor / Windsurf Server Binaries -- keep latest only
- Empty Trash -- clear `~/.local/share/Trash`
- Clean Thumbnail Cache -- remove `~/.cache/thumbnails`
- Clean Vim/Neovim Swap & Undo Files -- swap, undo, and shada files
- Clean Shell Completion Caches -- Zsh compdumps, oh-my-zsh cache, Zsh sessions
- Clean Jupyter Runtime Files -- leftover kernel connection files
- Clean Kubernetes & Helm Cache -- kubectl and Helm chart caches

**Package Manager Caches**
- Clean Yarn Cache -- `yarn cache clean`
- Clean pnpm Store -- `pnpm store prune`
- Clean Go Module Cache -- `go clean -modcache`
- Clean Cargo/Rust Registry Cache -- `~/.cargo/registry` caches
- Clean Pip Cache Directory -- `~/.cache/pip`
- Clean Composer Cache -- PHP Composer download cache
- Clean Maven Cache -- `~/.m2/repository` (can be 5-15 GB)
- Clean Gradle Cache -- `~/.gradle/caches` and wrapper distributions
- Clean sbt/Ivy Cache -- Scala build caches
- Clean Conda Cache -- unused packages, tarballs, and downloads
- Clean Ruby Gems Cache -- `gem cleanup` and cached gem files
- Clean NuGet Cache -- .NET NuGet package caches
- Clean Deno Cache -- cached remote modules and compiled files
- Clean Bun Cache -- `~/.bun/install/cache`
- Clean Dart/Flutter Pub Cache -- `~/.pub-cache`
- Clean Homebrew/Linuxbrew Cache -- old downloads and formula
- Clean ccache -- C/C++ compiler cache
- Clean Conan C++ Cache -- Conan package manager cache
- Clean Bazel Cache -- `~/.cache/bazel` (can be 10+ GB)

**Framework & Project**
- Clean Laravel Logs & Cache -- finds Laravel projects and clears `storage/logs`, `storage/framework/cache/data`, and compiled views
- Clean Framework Build Caches -- finds and removes `node_modules/.cache`, `.next/cache`, `.angular/cache`, `.svelte-kit`, `.nuxt` caches, `.parcel-cache`, `.turbo`, and `.tsbuildinfo` files
- Clean Rust Build Artifacts -- `cargo target/` directories
- Clean Android SDK & Gradle Build Cache
- Clean Python Bytecode -- `__pycache__` directories
- Clean Docker Dangling Artifacts -- removes only dangling images, unused networks, and stale build cache (all named images, containers, and volumes are preserved)
- Clean Terraform Plugin Cache
- Clean Minikube Cache
- Compact Git Repositories -- finds all repos under `/home` and runs `git reflog expire --expire=now --all` + `git gc --prune=now --aggressive`

**Aggressive (off by default)**

These tasks are disabled by default and marked with an orange badge. Enable them in Settings if you understand the trade-offs. A confirmation modal appears before they run.

- Trim Shell History -- truncate bash, zsh, and fish histories over 10 MB
- Clean All User Caches -- blanket `~/.cache/*` removal (may break active app sessions)
- Remove Man Pages & Docs -- deletes `/usr/share/man`, `/usr/share/doc`, `/usr/share/info` (saves 200-400 MB; regenerated on package reinstall)
- Remove Unused Locales -- removes all non-English locale data from `/usr/share/locale` (saves 100+ MB; do not use if you need non-English locales)

#### Stale Directory Scanner

Toggle on to automatically find and remove old dependency, build, and cache directories that haven't been modified in a configurable number of days. Scans for:

`node_modules`, `vendor`, `__pycache__`, `.next`, `.nuxt`, `.turbo`, `.yarn`, `target`, `.gradle`, `.tox`, `.pytest_cache`, `.mypy_cache`, `dist`, `.parcel-cache`, `.cache`, `.venv`, `venv`, `elm-stuff`, `.terraform`, `.serverless`, `.nx`

#### Disk Compaction Toggle

Enable or disable automatic VHDX compaction after cleanup. When enabled, the cleaner will shut down WSL, update it, compact all virtual disks using `Optimize-VHD` (with automatic UAC elevation), and restart your distros. When disabled, the cleaner runs cleanup tasks only -- faster, with no WSL restart required.

### Stats

Track your cleanup history over time with charts and statistics:

- **Total space saved** across all sessions
- **Cleanups performed** count
- **Average space saved** per session
- **Cleanup streak** (consecutive days)
- **Disk size over time** line chart
- **Space saved per session** bar chart
- **Session history list** with date, space saved, task counts, and duration
- Clear history button to reset all data

### Disk Map

Interactive treemap visualizer (WinDirStat-style) that shows exactly what's consuming space inside your WSL filesystem. Select a distro, choose scan depth (2-5 levels), and click Scan. Renders a color-coded, clickable chart with:

- Drill-down navigation -- click any block to zoom in
- Breadcrumb trail to navigate back up
- Hover tooltips with full path, size, and percentage
- Small items auto-grouped as "Other" for clarity
- Cancel button to abort long-running scans
- Automatically excludes Windows mounts (`/mnt`)

### Health

Real-time system health dashboard for your WSL distributions. Auto-refreshes every 10 seconds. Monitors:

- **Core metrics** -- kernel version, distro OS, uptime, CPU load, memory/swap usage with visual bars
- **Disk & I/O** -- filesystem usage bar, I/O pressure (some/full percentages)
- **Networking** -- interface RX/TX stats table, listening ports table, DNS resolution status (green/red indicator with server address)
- **Processes** -- top 20 by CPU, zombie process detection with count and PID table
- **Services** -- Docker container counts (running/stopped), systemd state with failed unit listing (filters out known-harmless WSL failures)
- **System info** -- installed package count, GPU/CUDA availability, WSL interop status
- **WSL config** -- reads `.wslconfig` memory/swap limits and displays alongside actual usage

### Distros

Centralized management panel for all your WSL distributions:

- **Comparison table** showing every distro's state, OS, VHDX size, package count, and uptime side by side
- **Export** any distro to a `.tar` backup with a file picker
- **Import** a distro from a `.tar` archive, choosing name and install location
- **Clone** a distro in one click (export + import under a new name)
- **One-click restart** -- terminates and re-launches a distro instantly
- **Activity log** showing real-time command output from operations
- Auto-refreshes every 15 seconds while the page is active

### Tray & Alerts

Background monitoring via the Windows system tray, with smart desktop notifications:

**System Tray**
- Tray icon with live tooltip showing disk size, RAM usage, and Docker container count
- Right-click context menu with quick stats and "Open Window" / "Quit" actions
- Minimize-to-tray option so closing the window keeps the app running in the background
- Configurable monitoring interval (10-600 seconds)
- Choose which distro to monitor

**Smart Alerts**
- Desktop toast notifications that navigate to the relevant page when clicked
- Configurable cooldown between repeat alerts (5-1440 minutes)
- Six alert types, each individually toggleable with adjustable thresholds:
  - **VHDX Size** -- disk exceeds N GB (default 60)
  - **Memory High** -- RAM usage exceeds N% (default 80)
  - **Docker Space** -- container count exceeds N (default 10)
  - **Zombie Processes** -- zombie count exceeds N (default 1)
  - **Systemd Failed Units** -- failed unit count exceeds N (default 1)
  - **DNS Broken** -- DNS resolution is failing

### About

Version info, auto-update system, language selector, and sound effects toggle.

## Multi-Distro Support

Select one or more distros from the picker in the status bar. Cleanup tasks, tool detection, VHDX discovery, and size estimation all run per-distro. The health dashboard, disk map, and tray monitor each have their own distro selector.

## Tool Auto-Detection

The app auto-detects which tools are installed in your WSL distribution and only shows relevant cleanup tasks. Detected tools:

`apt`, `dnf`, `npm`, `yarn`, `pnpm`, `go`, `pip`, `pip3`, `composer`, `snap`, `docker`, `mvn`, `gradle`, `conda`, `gem`, `dotnet`, `deno`, `bun`, `dart`, `brew`, `ccache`, `bazel`

## Distro Support

- **Debian/Ubuntu** -- uses `apt`
- **Fedora/RHEL** -- uses `dnf`
- Automatically skips Docker Desktop internal distros

## Internationalization

Available in 7 languages with real-time switching from the About page:

English, Fran&ccedil;ais, Deutsch, Espa&ntilde;ol, Portugu&ecirc;s, &#20013;&#25991;, &#2361;&#2367;&#2344;&#2381;&#2342;&#2368;

## CLI

A standalone command-line interface for scripting and automation:

```
node cli.js [options]

Options:
  --list               Show available WSL distros
  --clean              Run cleanup tasks
  --scan-stale         Find old directories
  --compact            Compact VHDX files
  --list-tasks         Show all 60+ task IDs
  --distro, -d <name>  Target distribution
  --tasks, -t <ids>    Comma-separated task IDs
  --exclude <ids>      Skip specific tasks
  --days <n>           Stale directory age threshold
  --dry-run            Preview without executing
  --json               Machine-readable output
  --no-aggressive      Skip destructive tasks
  --verbose, -v        Detailed output
  --quiet, -q          Suppress output
  --help, -h           Usage info
  --version            Show version
```

## Requirements

- Windows 10 or 11
- WSL 2 with at least one installed distribution
- Hyper-V enabled (required for `Optimize-VHD` disk compaction)

## Download

Grab the latest installer from [GitHub Releases](https://github.com/dbfx/wsl-cleaner/releases).

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later recommended)
- npm (comes with Node.js)

### Setup

```bash
git clone https://github.com/dbfx/wsl-cleaner.git
cd wsl-cleaner
npm install
```

### Run

```bash
npm start
```

### Build

To create a Windows installer:

```bash
npm run build
```

The installer will be output to the `dist/` directory.

## Project Structure

```
wsl-cleaner/
  main.js              # Electron main process — IPC handlers, auto-updater, tray
  preload.js           # Secure bridge (contextBridge -> window.wslCleaner)
  cli.js               # Standalone CLI (node cli.js --help)
  lib/
    wsl-ops.js         # WSL commands, VHDX discovery, stale scanning, health info, distro management
    tray-manager.js    # System tray icon, context menu, background health polling
    utils.js           # Pure helpers — parseWslOutput, friendlyError, etc.
    stats-db.js        # Cleanup history persistence (JSON)
    preferences.js     # Task toggle & locale preference persistence
  renderer/
    index.html         # App shell with data-i18n attributes
    app.js             # UI logic, state management, task orchestration
    tasks.js           # TASKS array (60+ cleanup task definitions)
    treemap.js         # Squarified treemap algorithm & DOM renderer
    i18n.js            # Lightweight i18n runtime (t, tp, tError, applyI18n)
    utils.js           # formatBytes, escapeHtml, estimateTotalSize
    styles.css         # Dark-mode stylesheet
  locales/
    en.json            # Source-of-truth English strings
    languages.json     # Language registry (code, name, nativeName)
    *.json             # Translated locale files (fr, de, es, zh, hi, pt)
  scripts/
    translate.js       # OpenAI-powered translation generator
    release.js         # Version bump helper
  tests/               # Vitest test suite
  assets/              # App icons (icon.png, icon.ico)
  package.json         # Dependencies and electron-builder config
```

## License

[MIT](LICENSE)
