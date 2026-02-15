# WSL Cleaner

> **WARNING: This tool permanently deletes files inside your WSL distribution.** It is designed for developers who understand what is being removed. Deleted files include caches, logs, build artifacts, and other regenerable data -- but once removed they are gone. **Use Advanced mode first** to review exactly what each task does before running Simple mode. Always ensure you have backups of anything important. The authors are not responsible for any data loss.

A lightweight Electron desktop app to clean, optimize, and compact your Windows Subsystem for Linux installation. Reclaim disk space with one click.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

![WSL Cleaner](assets/combo.png)

## Features

### Simple Mode
One-click "Clean & Compact" that runs all non-aggressive cleanup tasks, removes stale directories, runs filesystem TRIM, and compacts your virtual disk automatically. Shows before/after disk size comparison.

### Advanced Mode
Full control over individual cleanup tasks with toggles, a stale directory scanner with configurable age threshold, and manual disk compaction with automatic TRIM.

### Cleanup Tasks

#### System
- **Update System Packages** -- `apt-get update && upgrade` or `dnf upgrade` (auto-detects distro)
- **Clean Old Packages** -- `apt autoremove && clean` or `dnf clean all && autoremove`
- **Shrink Systemd Journal** -- vacuum logs to 10 MB / 2 weeks
- **Clean Temporary Files** -- clear `/tmp` and `/var/tmp`
- **Clean Old Rotated Logs** -- remove `.gz`, `.old`, `.1` files from `/var/log`
- **Truncate Active Log Files** -- empty syslog and `*.log` files without deleting
- **Clean Apt Package Lists** -- remove cached package lists (Debian/Ubuntu)
- **Clean Snap Cache** -- remove cached snap packages
- **Clean Core Dumps & Crash Reports** -- clear `/var/crash` and `/var/lib/systemd/coredump`
- **Remove Old Kernel Packages** -- purge unused `linux-image`, `linux-headers`, `linux-modules` (Debian/Ubuntu)
- **Clean Font Cache** -- clear fontconfig caches (rebuilt on demand)
- **Clean Database Logs** -- remove MySQL/MariaDB and PostgreSQL log files
- **Filesystem TRIM** -- `fstrim` (or zero-fill fallback) to make VHDX compaction dramatically more effective

#### User & Editor
- **Clean User Caches** -- npm, pip, Mozilla, and Chrome caches
- **Clean VS Code / Cursor / Windsurf Server** -- extension caches and logs (preserves extensions and settings)
- **Empty Trash** -- clear `~/.local/share/Trash`
- **Clean Thumbnail Cache** -- remove `~/.cache/thumbnails`
- **Clean Vim/Neovim Swap & Undo Files** -- swap, undo, and shada files
- **Clean Shell Completion Caches** -- Zsh compdumps, oh-my-zsh cache, Zsh sessions
- **Clean Jupyter Runtime Files** -- leftover kernel connection files
- **Clean Kubernetes & Helm Cache** -- kubectl and Helm chart caches

#### Package Manager Caches
- **Clean Yarn Cache** -- `yarn cache clean`
- **Clean pnpm Store** -- `pnpm store prune`
- **Clean Go Module Cache** -- `go clean -modcache`
- **Clean Cargo/Rust Registry Cache** -- `~/.cargo/registry` caches
- **Clean Pip Cache Directory** -- `~/.cache/pip`
- **Clean Composer Cache** -- PHP Composer download cache
- **Clean Maven Cache** -- `~/.m2/repository` (can be 5-15 GB)
- **Clean Gradle Cache** -- `~/.gradle/caches` and wrapper distributions
- **Clean Conda Cache** -- unused packages, tarballs, and downloads
- **Clean Ruby Gems Cache** -- `gem cleanup` and cached gem files
- **Clean NuGet Cache** -- .NET NuGet package caches
- **Clean Deno Cache** -- cached remote modules and compiled files
- **Clean Bun Cache** -- `~/.bun/install/cache`
- **Clean Dart/Flutter Pub Cache** -- `~/.pub-cache`
- **Clean Homebrew/Linuxbrew Cache** -- old downloads and formula
- **Clean ccache** -- C/C++ compiler cache
- **Clean Bazel Cache** -- `~/.cache/bazel` (can be 10+ GB)

#### Framework & Project
- **Clean Laravel Logs & Cache** -- finds Laravel projects and clears `storage/logs`, `storage/framework/cache/data`, and compiled views
- **Clean Framework Build Caches** -- finds and removes `node_modules/.cache`, `.next/cache`, `.angular/cache`, `.svelte-kit`, `.nuxt` caches, `.parcel-cache`, `.turbo`, and `.tsbuildinfo` files
- **Clean Docker Dangling Artifacts** -- removes only dangling images, unused networks, and stale build cache (all named images, containers, and volumes are preserved)
- **Compact Git Repositories** -- finds all repos under `/home` and runs `git reflog expire --expire=now --all` + `git gc --prune=now --aggressive` (branches, tags, and reachable commits are untouched; reflog recovery history is lost)

#### Aggressive (off by default)
These tasks are disabled by default and marked with an orange "aggressive" badge in the UI. Enable them manually in Advanced mode if you understand the trade-offs.

- **Clean All User Caches** -- blanket `~/.cache/*` removal (may break active app sessions)
- **Remove Man Pages & Docs** -- deletes `/usr/share/man`, `/usr/share/doc`, `/usr/share/info` (saves 200-400 MB; regenerated on package reinstall)
- **Remove Unused Locales** -- removes all non-English locale data from `/usr/share/locale` (saves 100+ MB; do not use if you need non-English locales)

### Stale Directory Scanner
Finds old dependency, build, and cache directories that haven't been modified in a configurable number of days. Review and delete them individually or in bulk. Scans for:

`node_modules`, `vendor`, `__pycache__`, `.next`, `.nuxt`, `.turbo`, `.yarn`, `target`, `.gradle`, `.tox`, `.pytest_cache`, `.mypy_cache`, `dist`, `.parcel-cache`, `.cache`, `.venv`, `venv`, `elm-stuff`, `.terraform`, `.serverless`, `.nx`

### Disk Compaction
Runs filesystem TRIM, shuts down WSL, updates it, then compacts the VHDX virtual disk using `Optimize-VHD` (with automatic UAC elevation). Reports space saved.

### Tool Auto-Detection
The app auto-detects which tools are installed in your WSL distribution and only shows relevant cleanup tasks. Detected tools:

`apt`, `dnf`, `npm`, `yarn`, `pnpm`, `go`, `pip`, `pip3`, `composer`, `snap`, `docker`, `mvn`, `gradle`, `conda`, `gem`, `dotnet`, `deno`, `bun`, `dart`, `brew`, `ccache`, `bazel`

### Distro Support
- **Debian/Ubuntu** -- uses `apt`
- **Fedora/RHEL** -- uses `dnf`
- Automatically skips Docker Desktop internal distros

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
  main.js          # Electron main process -- IPC handlers, WSL commands
  preload.js       # Secure bridge between main and renderer
  renderer/
    index.html     # UI structure
    app.js         # Frontend logic, task definitions, navigation
    styles.css     # Dark mode styling
  assets/
    icon.png       # Application icon
  package.json     # Dependencies and electron-builder config
```

## License

[MIT](LICENSE)
