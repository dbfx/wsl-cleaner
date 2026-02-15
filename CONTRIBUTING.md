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
├── main.js              # Electron main process — IPC handlers, auto-updater
├── preload.js           # contextBridge exposing window.wslCleaner API
├── cli.js               # Standalone CLI (node cli.js --help)
├── lib/
│   ├── wsl-ops.js       # WSL commands, VHDX discovery, stale scanning, health info, distro management, config editor
│   ├── utils.js         # Pure helpers — parseWslOutput, friendlyError, etc.
│   ├── stats-db.js      # Cleanup history persistence (JSON)
│   └── preferences.js   # Task toggle & locale preference persistence
├── renderer/
│   ├── index.html       # App shell with data-i18n attributes
│   ├── app.js           # UI logic, state management, task orchestration
│   ├── tasks.js         # TASKS array (40+ cleanup task definitions)
│   ├── treemap.js       # Squarified treemap algorithm & DOM renderer
│   ├── i18n.js          # Lightweight i18n runtime (t, tp, tError, applyI18n)
│   ├── utils.js         # formatBytes, escapeHtml, estimateTotalSize
│   └── styles.css       # Dark-mode stylesheet
├── locales/             # i18n locale files (en, fr, de, es, zh, hi, pt)
├── scripts/             # translate.js, release.js
├── tests/               # Vitest test suite
├── assets/              # App icons (icon.png, icon.ico)
└── package.json
```

| Layer | File(s) | Responsibility |
|-------|---------|----------------|
| Main process | `main.js` | Window lifecycle, IPC handlers, auto-updater events |
| Libraries | `lib/wsl-ops.js` | WSL command execution, VHDX discovery & optimization, stale scanning, health info, distro export/import/clone/restart/comparison, config editor (read/write .wslconfig and wsl.conf) |
| Libraries | `lib/utils.js` | Pure utility functions — output parsing, error mapping |
| Libraries | `lib/stats-db.js`, `lib/preferences.js` | JSON-backed persistence for history and preferences |
| Preload | `preload.js` | `contextBridge` that exposes `window.wslCleaner` to the renderer |
| Renderer | `renderer/app.js` | All UI logic — navigation, task cards, cleanup execution, health dashboard, config editor, charts |
| Renderer | `renderer/tasks.js` | `TASKS` array defining all 40+ cleanup tasks |
| Renderer | `renderer/treemap.js` | Squarified treemap layout algorithm and DOM-based renderer |
| Renderer | `renderer/i18n.js` | i18n runtime — `t()`, `tp()`, `tError()`, `applyI18n()` |
| Renderer | `renderer/utils.js` | `formatBytes`, `escapeHtml`, `estimateTotalSize` |
| CLI | `cli.js` | Headless CLI for scripting (`wsl-cleaner --clean -d Ubuntu`) |

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

## Running Tests

```bash
npm test          # Run all tests once
npm run test:watch  # Watch mode
```

Tests cover `lib/utils.js`, `lib/stats-db.js`, `lib/preferences.js`, `lib/wsl-ops.js` (distro management exports), `renderer/utils.js`, `renderer/i18n.js`, `renderer/tasks.js`, and `cli.js`.

## Adding a New Cleanup Task

Most contributions will be new cleanup tasks. Here's the typical flow:

1. **Task definition** — add a task object to the `TASKS` array in `renderer/tasks.js`:
   ```js
   {
     id: 'my-task',
     name: 'My Task Name',           // English fallback
     desc: 'Description with <code>paths</code>.',
     command: 'bash command here',
     asRoot: true,                    // run as root?
     requires: 'toolname',           // or null if always available
     estimateCommand: 'du -sh ...',  // optional size estimation
     aggressive: false,              // true = off by default, shows warning
   }
   ```
2. **Tool detection** — if the task depends on a tool not already in the `TOOL_CHECKS` array in `lib/wsl-ops.js`, add a `{ name: 'toolname', cmd: 'which toolname' }` entry.
3. **i18n** — add keys to `locales/en.json`:
   ```json
   "task.my-task.name": "My Task Name",
   "task.my-task.desc": "Description with <code>paths</code>."
   ```
   Then run `npm run translate` to generate translations for all languages.
4. **Test** — run `npm test` to verify task array integrity, then run the app with `npm start` and test the task against a real WSL 2 distro.

## Reporting Issues

- Use [GitHub Issues](https://github.com/dbfx/wsl-cleaner/issues).
- Include your Windows version, WSL distro name & version, and any error output.
- Screenshots or screen recordings are very welcome.

## Pull Request Checklist

- [ ] Branch is based on latest `main`
- [ ] `npm test` passes
- [ ] `npm start` runs without errors
- [ ] Tested with at least one WSL 2 distro
- [ ] No new `nodeIntegration` or CSP weakening
- [ ] Commit messages follow the conventional style above

## License

By contributing, you agree that your contributions will be licensed under the project's [MIT License](LICENSE).
