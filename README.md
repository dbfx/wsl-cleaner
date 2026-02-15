# WSL Cleaner

A lightweight Electron desktop app to clean, optimize, and compact your Windows Subsystem for Linux installation. Reclaim disk space with one click.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Features

### Simple Mode
One-click "Clean & Compact" that runs all cleanup tasks, removes stale directories, and compacts your virtual disk automatically. Shows before/after disk size comparison.

### Advanced Mode
Full control over individual cleanup tasks with toggles, a stale directory scanner with configurable age threshold, and manual disk compaction.

### Cleanup Tasks
- **Update System Packages** -- `apt-get update && upgrade` or `dnf upgrade` (auto-detects distro)
- **Clean Old Packages** -- `apt autoremove && clean` or `dnf clean all && autoremove`
- **Shrink Systemd Journal** -- vacuum logs to 10MB / 2 weeks
- **Clean Temporary Files** -- clear `/tmp` and `/var/tmp`
- **Clean User Caches** -- npm, pip, Mozilla, and Chrome caches
- **Clean Old Rotated Logs** -- remove `.gz`, `.old`, `.1` files from `/var/log`
- **Truncate Active Log Files** -- empty syslog and `*.log` files without deleting
- **Clean Apt Package Lists** -- remove cached package lists (Debian/Ubuntu)
- **Clean Snap Cache** -- remove cached snap packages
- **Clean VS Code / Cursor Server** -- remove extension caches and logs
- **Empty Trash** -- clear `~/.local/share/Trash`
- **Clean Thumbnail Cache** -- remove `~/.cache/thumbnails`
- **Clean Yarn Cache** -- `yarn cache clean`
- **Clean Go Module Cache** -- `go clean -modcache`
- **Clean Cargo/Rust Registry Cache** -- remove `~/.cargo/registry` caches

### Stale Directory Scanner
Finds old `node_modules`, `vendor`, `__pycache__`, `.next`, `.nuxt`, `.turbo`, and `.yarn` directories that haven't been modified in a configurable number of days. Review and delete them individually or in bulk.

### Disk Compaction
Shuts down WSL, updates it, then compacts the VHDX virtual disk using `Optimize-VHD` (with automatic UAC elevation). Reports space saved.

### Distro Support
- **Debian/Ubuntu** -- uses `apt`
- **Fedora/RHEL** -- uses `dnf`
- Auto-detects installed tools and hides unavailable tasks

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
    app.js         # Frontend logic, task execution, navigation
    styles.css     # Dark mode styling
  assets/
    icon.png       # Application icon
  package.json     # Dependencies and electron-builder config
```

## License

[MIT](LICENSE)
