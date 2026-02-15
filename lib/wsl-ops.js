// ── Shared WSL operations (used by both Electron main process and CLI) ───────

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { filterNoise, parseWslOutput, STALE_DIR_NAMES, friendlyError } = require('./utils');

// Suppress "bogus screen size" warnings from WSL
const wslEnv = { ...process.env, TERM: 'dumb', COLUMNS: '120', LINES: '40' };

// ── WSL detection ────────────────────────────────────────────────────────────

/**
 * List WSL 2 distributions.
 * @returns {{ ok: boolean, distros?: Array, defaultDistro?: string, error?: string }}
 */
function checkWsl() {
  try {
    const output = execSync('wsl -l -v', { encoding: 'utf16le', stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
    const { distros, defaultDistro } = parseWslOutput(output);

    if (distros.length === 0) {
      return { ok: false, error: 'No WSL 2 distributions found. Please install a WSL 2 distro first.' };
    }

    return { ok: true, distros, defaultDistro };
  } catch (err) {
    return { ok: false, error: friendlyError(err.message) || 'WSL 2 is not installed or not available. Please install WSL 2 first.' };
  }
}

// ── Tool detection ───────────────────────────────────────────────────────────

const TOOL_CHECKS = [
  { name: 'composer', cmd: 'which composer' },
  { name: 'npm', cmd: 'which npm' },
  { name: 'snap', cmd: 'which snap' },
  { name: 'yarn', cmd: 'which yarn' },
  { name: 'go', cmd: 'which go' },
  { name: 'pip', cmd: 'which pip' },
  { name: 'pip3', cmd: 'which pip3' },
  { name: 'apt', cmd: 'which apt' },
  { name: 'dnf', cmd: 'which dnf' },
  { name: 'docker', cmd: 'which docker' },
  { name: 'pnpm', cmd: 'which pnpm' },
  { name: 'mvn', cmd: 'which mvn' },
  { name: 'gradle', cmd: 'which gradle' },
  { name: 'conda', cmd: 'which conda' },
  { name: 'gem', cmd: 'which gem' },
  { name: 'dotnet', cmd: 'which dotnet' },
  { name: 'deno', cmd: 'which deno' },
  { name: 'bun', cmd: 'which bun' },
  { name: 'dart', cmd: 'which dart' },
  { name: 'brew', cmd: 'which brew' },
  { name: 'ccache', cmd: 'which ccache' },
  { name: 'bazel', cmd: 'which bazel' },
];

/**
 * Detect which cleanup tools are available inside a WSL distribution.
 * @param {string} distro
 * @returns {Object<string, boolean>}
 */
function detectTools(distro) {
  const tools = {};
  for (const check of TOOL_CHECKS) {
    try {
      execSync(`wsl -d ${distro} -- bash -lc "${check.cmd} 2>/dev/null"`, {
        encoding: 'utf8', timeout: 10000, env: wslEnv,
        stdio: ['pipe', 'pipe', 'pipe'],  // suppress stderr (bogus screen-size warnings)
      });
      tools[check.name] = true;
    } catch {
      tools[check.name] = false;
    }
  }
  return tools;
}

// ── Cleanup task execution ───────────────────────────────────────────────────

/**
 * Run a single cleanup command inside WSL.
 * @param {Object} opts
 * @param {string} opts.distro
 * @param {string} opts.taskId
 * @param {string} opts.command
 * @param {boolean} opts.asRoot
 * @param {function} [opts.onOutput] - Streaming callback: ({ taskId, text }) => void
 * @returns {Promise<{ ok: boolean, output: string, code: number }>}
 */
function runCleanupTask({ distro, taskId, command, asRoot, onOutput }) {
  return new Promise((resolve) => {
    const args = ['-d', distro];
    if (asRoot) args.push('-u', 'root');
    args.push('--', 'bash', '-lc', command);

    const proc = spawn('wsl', args, { windowsHide: true, env: wslEnv });
    let fullOutput = '';

    proc.stdout.on('data', (data) => {
      const text = filterNoise(data.toString());
      if (!text) return;
      fullOutput += text;
      if (onOutput) onOutput({ taskId, text });
    });

    proc.stderr.on('data', (data) => {
      const text = filterNoise(data.toString());
      if (!text) return;
      fullOutput += text;
      if (onOutput) onOutput({ taskId, text });
    });

    proc.on('close', (code) => {
      resolve({ ok: code === 0, output: fullOutput, code });
    });

    proc.on('error', (err) => {
      resolve({ ok: false, output: friendlyError(err.message), code: -1 });
    });
  });
}

// ── VHDX file discovery ──────────────────────────────────────────────────────

/**
 * Find ext4.vhdx files on the host filesystem.
 * @returns {Array<{ path: string, size: number, folder: string }>}
 */
function findVhdx() {
  const results = [];
  const localAppData = process.env.LOCALAPPDATA;
  const userProfile = process.env.USERPROFILE;

  if (localAppData) {
    const packagesDir = path.join(localAppData, 'Packages');
    try {
      const entries = fs.readdirSync(packagesDir);
      for (const entry of entries) {
        const localStatePath = path.join(packagesDir, entry, 'LocalState', 'ext4.vhdx');
        if (fs.existsSync(localStatePath)) {
          const stats = fs.statSync(localStatePath);
          results.push({ path: localStatePath, size: stats.size, folder: entry });
        }
      }
    } catch { /* ignore */ }
  }

  // Also check Docker Desktop WSL paths
  if (localAppData) {
    const dockerDir = path.join(localAppData, 'Docker', 'wsl');
    try {
      if (fs.existsSync(dockerDir)) {
        const walkDir = (dir) => {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              walkDir(fullPath);
            } else if (entry.name === 'ext4.vhdx') {
              const stats = fs.statSync(fullPath);
              results.push({ path: fullPath, size: stats.size, folder: 'Docker' });
            }
          }
        };
        walkDir(dockerDir);
      }
    } catch { /* ignore */ }
  }

  // Custom install locations in user profile
  if (userProfile) {
    const customPaths = [
      path.join(userProfile, 'AppData', 'Local', 'Packages'),
      path.join(userProfile, '.wsl'),
    ];
    for (const dir of customPaths) {
      try {
        if (fs.existsSync(dir) && !dir.includes('Packages')) {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory()) {
              const vhdxPath = path.join(dir, entry.name, 'ext4.vhdx');
              if (fs.existsSync(vhdxPath)) {
                const stats = fs.statSync(vhdxPath);
                results.push({ path: vhdxPath, size: stats.size, folder: entry.name });
              }
            }
          }
        }
      } catch { /* ignore */ }
    }
  }

  return results;
}

// ── File size ────────────────────────────────────────────────────────────────

/**
 * Get size of a file in bytes.
 * @param {string} filePath
 * @returns {{ ok: boolean, size?: number, error?: string }}
 */
function getFileSize(filePath) {
  try {
    const stats = fs.statSync(filePath);
    return { ok: true, size: stats.size };
  } catch (err) {
    return { ok: false, error: friendlyError(err.message) };
  }
}

// ── Windows-side WSL commands ────────────────────────────────────────────────

/**
 * Run a Windows-side command (e.g. "wsl --shutdown", "wsl --update").
 * @param {Object} opts
 * @param {string} opts.command
 * @param {string} [opts.taskId]
 * @param {function} [opts.onOutput] - Streaming callback: ({ taskId, text }) => void
 * @returns {Promise<{ ok: boolean, output: string, code: number }>}
 */
function runWslCommand({ command, taskId, onOutput }) {
  return new Promise((resolve) => {
    const parts = command.split(' ');
    const proc = spawn(parts[0], parts.slice(1), { windowsHide: true, shell: true });
    let fullOutput = '';

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      fullOutput += text;
      if (taskId && onOutput) onOutput({ taskId, text });
    });

    proc.stderr.on('data', (data) => {
      const text = data.toString();
      fullOutput += text;
      if (taskId && onOutput) onOutput({ taskId, text });
    });

    proc.on('close', (code) => {
      resolve({ ok: code === 0, output: fullOutput, code });
    });

    proc.on('error', (err) => {
      resolve({ ok: false, output: friendlyError(err.message), code: -1 });
    });
  });
}

// ── Stale directory scanning ─────────────────────────────────────────────────

/**
 * Scan for stale directories inside WSL (node_modules, vendor, etc.).
 * @param {Object} opts
 * @param {string} opts.distro
 * @param {number} [opts.days=30]
 * @returns {Promise<Array<{ path: string, size: string, name: string }>>}
 */
function scanStaleDirs({ distro, days }) {
  const staleDays = Math.max(1, parseInt(days, 10) || 30);
  return new Promise((resolve) => {
    const nameTests = STALE_DIR_NAMES.map(n => `-name ${n}`).join(' -o ');

    // Write script to temp file to avoid Windows argument escaping issues
    const tempDir = process.env.TEMP || '.';
    const tempScript = path.join(tempDir, 'wsl-cleaner-scan.sh');
    const scriptContent = [
      '#!/bin/bash',
      `find /home /root /var /tmp /opt -maxdepth 8 -type d \\( ${nameTests} \\) -mtime +${staleDays} -prune -print 2>/dev/null | while IFS= read -r dir; do`,
      '  size=$(du -sh "$dir" 2>/dev/null | cut -f1)',
      '  echo -e "$size\\t$dir"',
      'done',
    ].join('\n');
    fs.writeFileSync(tempScript, scriptContent.replace(/\r\n/g, '\n'), 'utf8');

    // Convert Windows path to WSL path for the script
    const wslScriptPath = tempScript.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, d) => `/mnt/${d.toLowerCase()}`);
    const args = ['-d', distro, '-u', 'root', '--', 'bash', wslScriptPath];
    const proc = spawn('wsl', args, { windowsHide: true, env: wslEnv });
    let output = '';

    proc.stdout.on('data', (data) => { output += data.toString(); });
    proc.stderr.on('data', () => {}); // discard stderr

    proc.on('close', () => {
      fs.unlink(tempScript, () => {});

      const results = [];
      const lines = output.trim().split('\n').filter(l => l.trim());
      for (const line of lines) {
        const parts = line.split('\t');
        if (parts.length >= 2) {
          const size = parts[0].trim();
          const dirPath = parts.slice(1).join('\t').trim();
          const name = path.basename(dirPath);
          results.push({ path: dirPath, size, name });
        }
      }
      resolve(results);
    });

    proc.on('error', () => {
      fs.unlink(tempScript, () => {});
      resolve([]);
    });
  });
}

// ── Delete stale directories ─────────────────────────────────────────────────

/**
 * Delete stale directories inside WSL one at a time.
 * @param {Object} opts
 * @param {string} opts.distro
 * @param {string[]} opts.paths
 * @param {string} [opts.taskId]
 * @param {function} [opts.onOutput] - Streaming callback: ({ taskId, text }) => void
 * @returns {Promise<Array<{ ok: boolean, path: string, output: string }>>}
 */
async function deleteStaleDirs({ distro, paths, taskId, onOutput }) {
  const results = [];
  for (const dirPath of paths) {
    const result = await new Promise((resolve) => {
      const cmd = `rm -rf "${dirPath}" && echo "Deleted: ${dirPath}"`;
      const args = ['-d', distro, '-u', 'root', '--', 'bash', '-c', cmd];
      const proc = spawn('wsl', args, { windowsHide: true, env: wslEnv });
      let output = '';

      proc.stdout.on('data', (data) => {
        const text = filterNoise(data.toString());
        if (text) {
          output += text;
          if (onOutput) onOutput({ taskId, text });
        }
      });
      proc.stderr.on('data', (data) => {
        const text = filterNoise(data.toString());
        if (text) {
          output += text;
          if (onOutput) onOutput({ taskId, text });
        }
      });

      proc.on('close', (code) => resolve({ ok: code === 0, path: dirPath, output }));
      proc.on('error', (err) => resolve({ ok: false, path: dirPath, output: friendlyError(err.message) }));
    });
    results.push(result);
  }
  return results;
}

// ── Optimize VHDX ────────────────────────────────────────────────────────────

/**
 * Compact a VHDX file via elevated PowerShell (Optimize-VHD).
 * @param {Object} opts
 * @param {string} opts.vhdxPath
 * @param {string} [opts.taskId]
 * @param {function} [opts.onOutput] - Streaming callback: ({ taskId, text }) => void
 * @returns {Promise<{ ok: boolean, output: string, code: number }>}
 */
function optimizeVhdx({ vhdxPath, taskId, onOutput }) {
  return new Promise((resolve) => {
    const tempDir = process.env.TEMP || '.';
    const tempScript = path.join(tempDir, 'wsl-cleaner-optimize.ps1');
    const tempOut = path.join(tempDir, 'wsl-cleaner-optimize.log');

    const scriptContent = [
      'try {',
      `  Optimize-VHD -Path '${vhdxPath.replace(/'/g, "''")}' -Mode Full`,
      `  'SUCCESS' | Out-File -FilePath '${tempOut.replace(/'/g, "''")}' -Encoding utf8`,
      '} catch {',
      `  $_.Exception.Message | Out-File -FilePath '${tempOut.replace(/'/g, "''")}' -Encoding utf8`,
      '}',
    ].join('\r\n');

    try { fs.unlinkSync(tempOut); } catch { /* ignore */ }
    fs.writeFileSync(tempScript, scriptContent, 'utf8');

    const args = [
      '-NoProfile',
      '-Command',
      `Start-Process powershell -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','${tempScript.replace(/'/g, "''")}'`
    ];

    const proc = spawn('powershell', args, { windowsHide: true, shell: false });
    let fullOutput = '';

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      fullOutput += text;
      if (taskId && onOutput) onOutput({ taskId, text });
    });

    proc.stderr.on('data', (data) => {
      const text = data.toString();
      fullOutput += text;
      if (taskId && onOutput) onOutput({ taskId, text });
    });

    proc.on('close', (code) => {
      try { fs.unlinkSync(tempScript); } catch { /* ignore */ }

      try {
        const result = fs.readFileSync(tempOut, 'utf8').trim();
        fs.unlinkSync(tempOut);
        if (result === 'SUCCESS') {
          resolve({ ok: true, output: 'Optimize-VHD completed successfully.', code: 0 });
        } else {
          resolve({ ok: false, output: friendlyError(result || fullOutput), code: code || 1 });
        }
      } catch {
        resolve({ ok: code === 0, output: fullOutput, code });
      }
    });

    proc.on('error', (err) => {
      try { fs.unlinkSync(tempScript); } catch { /* ignore */ }
      try { fs.unlinkSync(tempOut); } catch { /* ignore */ }
      resolve({ ok: false, output: friendlyError(err.message), code: -1 });
    });
  });
}

// ── Estimate task sizes ──────────────────────────────────────────────────────

/**
 * Run size estimation commands for multiple tasks inside WSL in a single
 * batched script.  Returns a map of taskId → human-readable size string.
 *
 * @param {Object} opts
 * @param {string} opts.distro
 * @param {Array<{ taskId: string, estimateCommand: string }>} opts.tasks
 * @returns {Promise<Object<string, string>>}  e.g. { "pip-cache": "120M", "tmp": "4.0K" }
 */
function estimateTaskSizes({ distro, tasks }) {
  return new Promise((resolve) => {
    if (!tasks || tasks.length === 0) return resolve({});

    // Build a bash script that runs every estimate and outputs taskId=size lines
    const scriptLines = ['#!/bin/bash'];
    for (const t of tasks) {
      // Each line: echo "taskId=$(estimateCommand)"
      // If the estimate command fails / returns empty, the value will be blank
      scriptLines.push(`echo "${t.taskId}=$(${t.estimateCommand})"`);
    }

    const tempDir = process.env.TEMP || '.';
    const tempScript = path.join(tempDir, 'wsl-cleaner-estimate.sh');
    fs.writeFileSync(tempScript, scriptLines.join('\n').replace(/\r\n/g, '\n'), 'utf8');

    // Convert Windows path → WSL path
    const wslScriptPath = tempScript.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, d) => `/mnt/${d.toLowerCase()}`);
    const args = ['-d', distro, '-u', 'root', '--', 'bash', wslScriptPath];
    const proc = spawn('wsl', args, { windowsHide: true, env: wslEnv });
    let output = '';

    proc.stdout.on('data', (data) => { output += data.toString(); });
    proc.stderr.on('data', () => {}); // discard stderr

    proc.on('close', () => {
      fs.unlink(tempScript, () => {});

      const sizes = {};
      const lines = output.trim().split('\n');
      for (const line of lines) {
        const eqIdx = line.indexOf('=');
        if (eqIdx === -1) continue;
        const id = line.substring(0, eqIdx).trim();
        const val = line.substring(eqIdx + 1).trim();
        if (id && val) sizes[id] = val;
      }
      resolve(sizes);
    });

    proc.on('error', () => {
      fs.unlink(tempScript, () => {});
      resolve({});
    });
  });
}

module.exports = {
  wslEnv,
  checkWsl,
  detectTools,
  runCleanupTask,
  findVhdx,
  getFileSize,
  runWslCommand,
  scanStaleDirs,
  deleteStaleDirs,
  optimizeVhdx,
  estimateTaskSizes,
};
