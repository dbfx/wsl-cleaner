# Contributing to WSL Cleaner

Thanks for your interest in contributing to WSL Cleaner! This guide will help you get set up and familiar with the project.

## Prerequisites

- **Windows 10/11** with [WSL 2](https://learn.microsoft.com/en-us/windows/wsl/install) installed and at least one Linux distro configured
- **Node.js** >= 18 (LTS recommended)
- **npm** (ships with Node.js)
- **Git**

## Project Structure

```
wsl-cleaner/
├── main.js            # Electron main process (IPC handlers, WSL/VHDX operations)
├── preload.js         # Context bridge exposing safe APIs to the renderer
├── renderer/
│   ├── index.html     # App shell and UI markup
│   ├── app.js         # Renderer logic (UI state, task orchestration)
│   └── styles.css     # All styling
├── assets/            # App icons
├── package.json
└── CONTRIBUTING.md    # You are here
```

| Layer | File(s) | Responsibility |
|-------|---------|----------------|
| Main process | `main.js` | Window lifecycle, IPC handlers, WSL/PowerShell commands, VHDX discovery & optimization, auto-updater |
| Preload | `preload.js` | `contextBridge` that exposes `window.wslCleaner` to the renderer |
| Renderer | `renderer/*` | UI rendering, user interaction, calling preload APIs |

## Getting Started

```bash
# 1. Clone the repo
git clone https://github.com/dbfx/wsl-cleaner.git
cd wsl-cleaner

# 2. Install dependencies
npm install

# 3. Start the app in development mode
npm start
```

The app will open as a native window. Hot-reload is **not** configured — restart with `npm start` after making changes.

## Development Workflow

1. **Create a branch** off `main` for your change:
   ```bash
   git checkout -b feat/my-feature
   ```
2. Make your changes (see coding standards below).
3. Test manually by running `npm start` and exercising the affected feature with a real WSL 2 distro.
4. Commit with a clear, descriptive message (see [Commit Messages](#commit-messages)).
5. Open a pull request against `main`.

## Coding Standards

### General

- **No frameworks** — the renderer is vanilla HTML/CSS/JS. Keep it that way.
- **No TypeScript** — the project uses plain CommonJS JavaScript.
- Use `const` / `let`; avoid `var`.
- Prefer `async` / `await` over raw Promise chains where possible.

### Main Process (`main.js`)

- All IPC channels are registered with `ipcMain.handle` (invoke/handle pattern) or `ipcMain.on` (fire-and-forget).
- Keep each handler focused on a single operation.
- Spawn WSL/PowerShell processes via `child_process.spawn`; avoid `execSync` for long-running tasks.
- Always pass `{ windowsHide: true }` when spawning processes to prevent console windows from flashing.
- Stream output back to the renderer with `mainWindow.webContents.send('task-output', ...)`.

### Preload (`preload.js`)

- Only expose what the renderer actually needs via `contextBridge.exposeInMainWorld`.
- Never expose raw `ipcRenderer` — always wrap calls.

### Renderer (`renderer/`)

- Access Node/Electron APIs exclusively through `window.wslCleaner` (the preload bridge).
- Keep `app.js` organized with clear section comments (e.g., `// ── Section name ──`).
- CSS lives in `styles.css`; no inline styles unless truly one-off.

### Security

- `nodeIntegration` is **off** and `contextIsolation` is **on** — do not change this.
- Validate/sanitize any data coming from WSL command output before rendering it.
- The CSP in `index.html` restricts scripts to `'self'`; do not weaken it.

## Commit Messages

Follow a conventional style:

```
feat: add support for cleaning Rust target directories
fix: handle distros with spaces in their name
docs: update CONTRIBUTING with build instructions
refactor: extract VHDX discovery into helper function
```

Keep the subject line under ~72 characters. Add a body if the "why" isn't obvious from the subject.

## Building for Distribution

```bash
npm run build
```

This uses `electron-builder` to produce an NSIS installer in the `dist/` folder. You generally don't need to build installers during development — `npm start` is sufficient.

## Adding a New Cleanup Task

Most contributions will be new cleanup tasks. Here's the typical flow:

1. **Main process** — add a tool detection entry in the `checks` array inside the `detect-tools` handler (if the task depends on a tool being installed). Then add or reuse a `run-cleanup` command.
2. **Renderer** — add a UI card/section in `index.html`, wire up the button in `app.js` to call `window.wslCleaner.runCleanup(...)` with the appropriate command.
3. **Test** — run the task against a real WSL 2 distro and verify output streams correctly.

## Reporting Issues

- Use [GitHub Issues](https://github.com/dbfx/wsl-cleaner/issues).
- Include your Windows version, WSL distro name & version, and any error output.
- Screenshots or screen recordings are very welcome.

## Pull Request Checklist

- [ ] Branch is based on latest `main`
- [ ] `npm start` runs without errors
- [ ] Tested with at least one WSL 2 distro
- [ ] No new `nodeIntegration` or CSP weakening
- [ ] Commit messages follow the conventional style above

## License

By contributing, you agree that your contributions will be licensed under the project's [MIT License](LICENSE).
