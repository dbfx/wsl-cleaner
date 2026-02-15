// ── Shared WSL operations (used by both Electron main process and CLI) ───────

const { spawn, execSync, execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);
const fs = require('fs');
const os = require('os');
const path = require('path');
const { filterNoise, parseWslOutput, STALE_DIR_NAMES, friendlyError } = require('./utils');

// Suppress "bogus screen size" warnings from WSL and prevent BASH_ENV from
// sourcing init scripts that may hijack the bash process (e.g. systemd
// namespace wrappers that exec into nsenter, swallowing script output).
const wslEnv = { ...process.env, TERM: 'dumb', COLUMNS: '120', LINES: '40', BASH_ENV: '' };

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
  { name: 'terraform', cmd: 'which terraform' },
  { name: 'minikube', cmd: 'which minikube' },
  { name: 'sbt', cmd: 'which sbt' },
  { name: 'conan', cmd: 'which conan' },
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

// ── Available space measurement ──────────────────────────────────────────────

/**
 * Get available space (in bytes) on the root filesystem inside a WSL distro.
 * Uses `df --output=avail /` which returns available 1K-blocks.
 * @param {string} distro
 * @returns {Promise<{ ok: boolean, bytes?: number, error?: string }>}
 */
function getAvailableSpace(distro) {
  return new Promise((resolve) => {
    const args = ['-d', distro, '--', 'bash', '-lc', 'df --output=avail / 2>/dev/null | tail -1'];
    const proc = spawn('wsl', args, { windowsHide: true, env: wslEnv });
    let output = '';

    proc.stdout.on('data', (data) => { output += data.toString(); });
    proc.stderr.on('data', () => {});

    proc.on('close', (code) => {
      const kb = parseInt(output.trim(), 10);
      if (code === 0 && !isNaN(kb)) {
        resolve({ ok: true, bytes: kb * 1024 });
      } else {
        resolve({ ok: false, error: 'Failed to read available space (exit ' + code + ')' });
      }
    });

    proc.on('error', (err) => {
      resolve({ ok: false, error: friendlyError(err.message) });
    });
  });
}

/**
 * Get the default login user for a WSL distro.
 * @param {string} distro
 * @returns {Promise<{ ok: boolean, user?: string, error?: string }>}
 */
function getDefaultUser(distro) {
  return new Promise((resolve) => {
    const args = ['-d', distro, '--', 'whoami'];
    const proc = spawn('wsl', args, { windowsHide: true, env: wslEnv });
    let output = '';

    proc.stdout.on('data', (data) => { output += data.toString(); });
    proc.stderr.on('data', () => {});

    proc.on('close', (code) => {
      const user = output.trim();
      if (code === 0 && user) {
        resolve({ ok: true, user });
      } else {
        resolve({ ok: false, error: 'Failed to detect default user (exit ' + code + ')' });
      }
    });

    proc.on('error', (err) => {
      resolve({ ok: false, error: friendlyError(err.message) });
    });
  });
}

/**
 * Get free space on a Windows drive.
 * @param {string} drivePath  Any path on the target drive (e.g. "D:\\WSL\\Ubuntu")
 * @returns {Promise<{ ok: boolean, freeBytes?: number, totalBytes?: number, error?: string }>}
 */
function getDriveSpace(drivePath) {
  return new Promise((resolve) => {
    const driveMatch = drivePath.match(/^([A-Za-z]):/);
    if (!driveMatch) {
      resolve({ ok: false, error: 'Invalid drive path: ' + drivePath });
      return;
    }
    const driveLetter = driveMatch[1].toUpperCase();
    const cmd = `(Get-PSDrive ${driveLetter}).Free; (Get-PSDrive ${driveLetter}).Used + (Get-PSDrive ${driveLetter}).Free`;
    const proc = spawn('powershell', ['-NoProfile', '-Command', cmd], { windowsHide: true });
    let output = '';

    proc.stdout.on('data', (data) => { output += data.toString(); });
    proc.stderr.on('data', () => {});

    proc.on('close', (code) => {
      const lines = output.trim().split(/\r?\n/).filter(l => l.trim());
      const freeBytes = parseInt(lines[0], 10);
      const totalBytes = parseInt(lines[1], 10);
      if (code === 0 && !isNaN(freeBytes)) {
        resolve({ ok: true, freeBytes, totalBytes: isNaN(totalBytes) ? 0 : totalBytes });
      } else {
        resolve({ ok: false, error: 'Failed to get drive space (exit ' + code + ')' });
      }
    });

    proc.on('error', (err) => {
      resolve({ ok: false, error: friendlyError(err.message) });
    });
  });
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
    const proc = spawn(parts[0], parts.slice(1), { windowsHide: true });
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

// ── Disk usage scanning (treemap) ─────────────────────────────────────────────

/** Reference to a running disk-scan process so it can be cancelled. */
let _diskScanProc = null;

/**
 * Scan disk usage inside a WSL distro using `du`.
 * Returns a flat array of { path, sizeKB } sorted largest-first.
 *
 * The `-x` flag keeps the scan on the root ext4 filesystem, which
 * automatically excludes /mnt, /proc, /sys, /dev, and other mount points.
 *
 * @param {Object} opts
 * @param {string} opts.distro
 * @param {string} [opts.targetPath='/']  Directory to scan
 * @param {number} [opts.maxDepth=3]      Maximum directory depth
 * @returns {Promise<{ ok: boolean, data?: Array<{ path: string, sizeKB: number }>, error?: string }>}
 */
function scanDiskUsage({ distro, targetPath = '/', maxDepth = 3 }) {
  return new Promise((resolve) => {
    const depth = Math.max(1, Math.min(8, parseInt(maxDepth, 10) || 3));
    const target = targetPath || '/';

    const scriptContent = [
      '#!/bin/bash',
      `du -xk --max-depth=${depth} ${target} 2>/dev/null | sort -rn | head -2000`,
    ].join('\n');

    const tempDir = process.env.TEMP || '.';
    const tempScript = path.join(tempDir, 'wsl-cleaner-diskusage.sh');
    fs.writeFileSync(tempScript, scriptContent.replace(/\r\n/g, '\n'), 'utf8');

    const wslScriptPath = tempScript.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, d) => `/mnt/${d.toLowerCase()}`);
    const args = ['-d', distro, '-u', 'root', '--', 'bash', wslScriptPath];
    const proc = spawn('wsl', args, { windowsHide: true, env: wslEnv });
    _diskScanProc = proc;
    let output = '';

    proc.stdout.on('data', (data) => { output += data.toString(); });
    proc.stderr.on('data', () => {}); // discard stderr

    proc.on('close', (code) => {
      _diskScanProc = null;
      fs.unlink(tempScript, () => {});

      if (code !== 0 && output.trim() === '') {
        resolve({ ok: false, error: 'Disk scan failed (exit code ' + code + ').' });
        return;
      }

      const data = [];
      const lines = output.trim().split('\n').filter(l => l.trim());
      for (const line of lines) {
        const match = line.match(/^\s*(\d+)\s+(.+)$/);
        if (match) {
          data.push({ path: match[2].trim(), sizeKB: parseInt(match[1], 10) });
        }
      }
      resolve({ ok: true, data });
    });

    proc.on('error', (err) => {
      _diskScanProc = null;
      fs.unlink(tempScript, () => {});
      resolve({ ok: false, error: friendlyError(err.message) });
    });
  });
}

/**
 * Cancel a running disk-usage scan if one is in progress.
 */
function cancelDiskScan() {
  if (_diskScanProc) {
    try { _diskScanProc.kill(); } catch { /* ignore */ }
    _diskScanProc = null;
  }
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

// ── Health info collection ────────────────────────────────────────────────────

/**
 * Collect system health metrics from a running WSL distro in a single
 * batched bash invocation.
 *
 * @param {string} distro
 * @returns {Promise<{ ok: boolean, data?: Object, error?: string }>}
 */
function getHealthInfo(distro) {
  return new Promise((resolve) => {
    // NOTE: Every command uses `|| true` or `2>/dev/null` to prevent non-zero
    // exit codes from affecting the script.  Commands that may hang (DNS lookup,
    // Docker CLI, /mnt/c access) are wrapped with `timeout` to guarantee the
    // script finishes in bounded time.
    const scriptContent = [
      '#!/bin/bash',
      'echo "---KERNEL---"',
      'uname -r 2>/dev/null || true',
      'echo "---UPTIME---"',
      'cat /proc/uptime 2>/dev/null || true',
      'echo "---MEMORY---"',
      'cat /proc/meminfo 2>/dev/null || true',
      'echo "---CPU---"',
      'nproc 2>/dev/null || true',
      'cat /proc/loadavg 2>/dev/null || true',
      'echo "---DISK---"',
      'df -B1 / 2>/dev/null || true',
      'echo "---NETWORK---"',
      'cat /proc/net/dev 2>/dev/null || true',
      'echo "---OSRELEASE---"',
      'cat /etc/os-release 2>/dev/null || true',
      'echo "---PORTS---"',
      'ss -tlnp 2>/dev/null || true',
      'echo "---DNS---"',
      'timeout 5 nslookup google.com 2>&1 | head -10; echo "EXIT=$?"',
      'echo "---IOPRESSURE---"',
      'cat /proc/pressure/io 2>/dev/null || true',
      'echo "---ZOMBIES---"',
      'ps -eo pid,user,stat,comm --no-headers 2>/dev/null | grep " Z" || true',
      'echo "---DOCKER---"',
      'timeout 5 docker ps -a --format "{{.Status}}" 2>/dev/null || true',
      'echo "---SYSTEMD---"',
      'systemctl is-system-running 2>/dev/null || true',
      'systemctl list-units --type=service --state=failed --no-legend --full 2>/dev/null || true',
      'echo "---SYSTEMDSTATUS---"',
      'FAILED_UNITS=$(systemctl list-units --type=service --state=failed --no-legend --plain 2>/dev/null | awk "{print \\$1}")',
      'if [ -n "$FAILED_UNITS" ]; then for u in $FAILED_UNITS; do echo "UNIT=$u"; systemctl show "$u" --property=Description,Result,ExecMainStatus,ActiveEnterTimestamp,InactiveEnterTimestamp,SubState --no-pager 2>/dev/null || true; echo "END_UNIT"; done; fi',
      'echo "---PACKAGES---"',
      '(dpkg -l 2>/dev/null | tail -n+6 | wc -l || rpm -qa 2>/dev/null | wc -l) || true',
      'echo "---GPU---"',
      'ls /dev/dxg 2>/dev/null && echo "DXG=yes" || echo "DXG=no"',
      'nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>/dev/null || echo "NVML=no"',
      'echo "---INTEROP---"',
      'cat /proc/sys/fs/binfmt_misc/WSLInterop 2>/dev/null | head -1 || true',
      'echo "---WSLCONFIG---"',
      'timeout 3 cat /mnt/c/Users/*/.wslconfig 2>/dev/null || true',
      'exit 0',
    ].join('\n');

    // Write script to a temp file and pass the WSL-translated path to bash.
    // Using bash -c doesn't work for complex scripts (Windows CreateProcess
    // mangles single quotes and $() subshells in arguments).
    const tempDir = process.env.TEMP || '.';
    const tempScript = path.join(tempDir, 'wsl-cleaner-health.sh');
    fs.writeFileSync(tempScript, scriptContent.replace(/\r\n/g, '\n'), 'utf8');

    const wslScriptPath = tempScript.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, d) => `/mnt/${d.toLowerCase()}`);
    const args = ['-d', distro, '--', 'bash', wslScriptPath];
    const proc = spawn('wsl', args, { windowsHide: true, env: wslEnv });
    let output = '';

    proc.stdout.on('data', (data) => { output += data.toString(); });
    proc.stderr.on('data', () => {}); // discard stderr

    proc.on('close', (code) => {
      fs.unlink(tempScript, () => {});

      if (code !== 0 && output.trim() === '') {
        resolve({ ok: false, error: 'Health script exited with code ' + code + ' and no output.' });
        return;
      }

      try {
        const data = parseHealthOutput(output);
        resolve({ ok: true, data });
      } catch (err) {
        resolve({ ok: false, error: 'Failed to parse health data: ' + err.message });
      }
    });

    proc.on('error', (err) => {
      fs.unlink(tempScript, () => {});
      resolve({ ok: false, error: friendlyError(err.message) });
    });
  });
}

/**
 * Parse the combined health-info script output into structured data.
 * @param {string} raw
 * @returns {Object}
 */
function parseHealthOutput(raw) {
  const sections = {};
  let currentSection = null;
  const lines = raw.split('\n');

  for (const line of lines) {
    const sectionMatch = line.match(/^---(\w+)---$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      sections[currentSection] = [];
    } else if (currentSection) {
      sections[currentSection].push(line);
    }
  }

  // Kernel
  const kernel = (sections.KERNEL || []).filter(l => l.trim()).join('').trim() || 'Unknown';

  // Uptime
  const uptimeRaw = (sections.UPTIME || []).join('').trim();
  const uptimeSeconds = parseFloat(uptimeRaw.split(/\s+/)[0]) || 0;
  const uptimeFormatted = formatUptime(uptimeSeconds);

  // Memory (/proc/meminfo)
  const memLines = (sections.MEMORY || []);
  const mem = {};
  for (const ml of memLines) {
    const m = ml.match(/^(\w+):\s+(\d+)\s+kB/);
    if (m) mem[m[1]] = parseInt(m[2], 10) * 1024; // kB → bytes
  }
  const memory = {
    total: mem.MemTotal || 0,
    free: mem.MemFree || 0,
    available: mem.MemAvailable || 0,
    cached: (mem.Cached || 0) + (mem.Buffers || 0),
    used: (mem.MemTotal || 0) - (mem.MemFree || 0) - (mem.Cached || 0) - (mem.Buffers || 0),
    swapTotal: mem.SwapTotal || 0,
    swapFree: mem.SwapFree || 0,
    swapUsed: (mem.SwapTotal || 0) - (mem.SwapFree || 0),
  };

  // CPU
  const cpuLines = (sections.CPU || []).filter(l => l.trim());
  const cores = parseInt(cpuLines[0], 10) || 0;
  const loadParts = (cpuLines[1] || '').split(/\s+/);
  const cpu = {
    cores,
    load1: parseFloat(loadParts[0]) || 0,
    load5: parseFloat(loadParts[1]) || 0,
    load15: parseFloat(loadParts[2]) || 0,
  };

  // Disk (df -B1 /)
  const diskLines = (sections.DISK || []).filter(l => l.trim());
  let disk = { total: 0, used: 0, free: 0, percent: '0%' };
  if (diskLines.length >= 2) {
    const parts = diskLines[1].split(/\s+/);
    // Filesystem 1B-blocks Used Available Use% Mounted
    if (parts.length >= 5) {
      disk = {
        total: parseInt(parts[1], 10) || 0,
        used: parseInt(parts[2], 10) || 0,
        free: parseInt(parts[3], 10) || 0,
        percent: parts[4] || '0%',
      };
    }
  }

  // Network (/proc/net/dev)
  const netLines = (sections.NETWORK || []).filter(l => l.trim());
  const network = [];
  for (const nl of netLines) {
    const m = nl.match(/^\s*(\S+):\s*(\d+)\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+(\d+)/);
    if (m) {
      const iface = m[1];
      if (iface === 'lo') continue; // skip loopback
      network.push({ iface, rxBytes: parseInt(m[2], 10), txBytes: parseInt(m[3], 10) });
    }
  }

  // OS Release (/etc/os-release)
  const osLines = (sections.OSRELEASE || []);
  const osKv = {};
  for (const ol of osLines) {
    const m = ol.match(/^(\w+)=(.*)$/);
    if (m) osKv[m[1]] = m[2].replace(/^"|"$/g, '');
  }
  const osRelease = {
    name: osKv.PRETTY_NAME || osKv.NAME || 'Unknown',
    version: osKv.VERSION || osKv.VERSION_ID || '',
    id: osKv.ID || '',
  };

  // Listening Ports (ss -tlnp)
  const portLines = (sections.PORTS || []).filter(l => l.trim());
  const ports = [];
  for (const pl of portLines) {
    // Skip the header line
    if (pl.match(/^State\s/i) || pl.match(/^Recv-Q/i)) continue;
    const parts = pl.trim().split(/\s+/);
    // State Recv-Q Send-Q Local_Address:Port Peer_Address:Port Process
    if (parts.length >= 5) {
      const addr = parts[3] || '';
      const processInfo = parts.slice(5).join(' ');
      const procMatch = processInfo.match(/users:\(\("([^"]+)"/);
      ports.push({
        proto: 'tcp',
        addr,
        process: procMatch ? procMatch[1] : '',
      });
    }
  }

  // DNS
  const dnsLines = (sections.DNS || []).filter(l => l.trim());
  let dns = { ok: false, server: '' };
  const exitLine = dnsLines.find(l => l.startsWith('EXIT='));
  const exitCode = exitLine ? parseInt(exitLine.replace('EXIT=', ''), 10) : 1;
  const serverLine = dnsLines.find(l => l.match(/Server:/i));
  dns = {
    ok: exitCode === 0,
    server: serverLine ? serverLine.replace(/.*Server:\s*/i, '').trim() : '',
  };

  // I/O Pressure (/proc/pressure/io)
  const ioLines = (sections.IOPRESSURE || []).filter(l => l.trim());
  let ioPressure = null;
  if (ioLines.length > 0) {
    ioPressure = { some10: 0, some60: 0, full10: 0, full60: 0 };
    for (const il of ioLines) {
      const avgMatch = il.match(/avg10=(\d+\.?\d*)\s+avg60=(\d+\.?\d*)/);
      if (avgMatch) {
        if (il.startsWith('some')) {
          ioPressure.some10 = parseFloat(avgMatch[1]);
          ioPressure.some60 = parseFloat(avgMatch[2]);
        } else if (il.startsWith('full')) {
          ioPressure.full10 = parseFloat(avgMatch[1]);
          ioPressure.full60 = parseFloat(avgMatch[2]);
        }
      }
    }
  }

  // Zombies
  const zombieLines = (sections.ZOMBIES || []).filter(l => l.trim());
  const zombies = [];
  for (const zl of zombieLines) {
    const parts = zl.trim().split(/\s+/);
    if (parts.length >= 4) {
      zombies.push({ pid: parseInt(parts[0], 10), user: parts[1], command: parts.slice(3).join(' ') });
    }
  }

  // Docker
  const dockerLines = (sections.DOCKER || []).filter(l => l.trim());
  let docker = null;
  if (dockerLines.length > 0) {
    let running = 0;
    let stopped = 0;
    for (const dl of dockerLines) {
      if (dl.match(/^Up\s/i)) running++;
      else stopped++;
    }
    docker = { running, stopped, total: running + stopped };
  }

  // Systemd
  const systemdLines = (sections.SYSTEMD || []).filter(l => l.trim());
  let systemd = null;
  if (systemdLines.length > 0) {
    const state = systemdLines[0].trim(); // "running", "degraded", "offline", etc.
    if (state !== '' && !state.includes('Failed to connect')) {
      // Parse failed unit names + descriptions from list-units output
      const failedUnits = systemdLines.slice(1).filter(l => l.trim()).map(l => {
        // Format: "● unit.service loaded failed failed Description text here"
        const cleaned = l.trim().replace(/^●\s*/, '');
        const parts = cleaned.split(/\s+/);
        const name = (parts[0] || '').replace(/^●\s*/, '');
        // Skip load/active/sub columns (loaded, failed, failed) → rest is description
        const desc = parts.length > 4 ? parts.slice(4).join(' ') : '';
        return { name, desc };
      });

      // Parse detailed status from SYSTEMD-STATUS section
      const statusLines = (sections.SYSTEMDSTATUS || []);
      const unitDetails = {};
      let currentUnit = null;
      for (const sl of statusLines) {
        if (sl.startsWith('UNIT=')) {
          currentUnit = sl.replace('UNIT=', '').trim();
          unitDetails[currentUnit] = {};
        } else if (sl.trim() === 'END_UNIT') {
          currentUnit = null;
        } else if (currentUnit) {
          const eqIdx = sl.indexOf('=');
          if (eqIdx > 0) {
            const key = sl.substring(0, eqIdx).trim();
            const val = sl.substring(eqIdx + 1).trim();
            unitDetails[currentUnit][key] = val;
          }
        }
      }

      // Merge details into failed units
      for (const unit of failedUnits) {
        const details = unitDetails[unit.name] || {};
        if (details.Description) unit.desc = details.Description;
        unit.result = details.Result || '';
        unit.exitCode = details.ExecMainStatus || '';
        unit.subState = details.SubState || '';
        if (details.InactiveEnterTimestamp && details.InactiveEnterTimestamp !== '0') {
          unit.failedAt = details.InactiveEnterTimestamp;
        }
      }

      // Filter out units that always fail on WSL and are harmless
      const WSL_IGNORED_UNITS = [
        'systemd-remount-fs.service',
        'multipathd.service',
      ];
      const filtered = failedUnits.filter(u => !WSL_IGNORED_UNITS.includes(u.name));
      const ignored = failedUnits.length - filtered.length;

      // If the only failures were ignored units, report the effective state as "running"
      const effectiveState = (state === 'degraded' && filtered.length === 0) ? 'running' : state;

      systemd = { state: effectiveState, failedUnits: filtered, ignoredCount: ignored };
    }
  }

  // Packages
  const pkgLines = (sections.PACKAGES || []).filter(l => l.trim());
  const packages = pkgLines.length > 0 ? (parseInt(pkgLines[0].trim(), 10) || null) : null;

  // GPU
  const gpuLines = (sections.GPU || []).filter(l => l.trim());
  let gpu = { available: false, name: '', vram: '' };
  const hasDxg = gpuLines.some(l => l.includes('DXG=yes'));
  const nvmlLine = gpuLines.find(l => !l.startsWith('DXG=') && !l.startsWith('NVML=') && l.includes(','));
  if (nvmlLine) {
    const nvParts = nvmlLine.split(',').map(s => s.trim());
    gpu = { available: true, name: nvParts[0] || '', vram: nvParts[1] || '' };
  } else {
    gpu = { available: hasDxg, name: hasDxg ? 'DirectX GPU (WSLg)' : '', vram: '' };
  }

  // Interop
  const interopLines = (sections.INTEROP || []).filter(l => l.trim());
  const interop = interopLines.length > 0 && interopLines[0].toLowerCase().includes('enabled');

  // .wslconfig
  const wslconfigLines = (sections.WSLCONFIG || []).filter(l => l.trim());
  let wslconfig = null;
  if (wslconfigLines.length > 0) {
    const cfg = {};
    for (const cl of wslconfigLines) {
      const m = cl.match(/^\s*(\w+)\s*=\s*(.+)$/);
      if (m) cfg[m[1].toLowerCase()] = m[2].trim();
    }
    if (Object.keys(cfg).length > 0) wslconfig = cfg;
  }

  return {
    kernel, uptime: { seconds: uptimeSeconds, formatted: uptimeFormatted },
    memory, cpu, disk, network,
    osRelease, ports, dns, ioPressure, zombies, docker, systemd, packages, gpu, interop, wslconfig,
  };
}

/**
 * Format uptime seconds into a human-readable string.
 * @param {number} totalSeconds
 * @returns {string}
 */
function formatUptime(totalSeconds) {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  const parts = [];
  if (days > 0) parts.push(days + 'd');
  if (hours > 0) parts.push(hours + 'h');
  if (minutes > 0) parts.push(minutes + 'm');
  if (parts.length === 0) parts.push(seconds + 's');
  return parts.join(' ');
}

// ── Distro management ─────────────────────────────────────────────────────────

/**
 * Export a WSL distro to a .tar file.
 * @param {Object} opts
 * @param {string} opts.distro
 * @param {string} opts.targetPath  Full path for the output .tar file
 * @param {string} [opts.taskId]
 * @param {function} [opts.onOutput]
 * @returns {Promise<{ ok: boolean, output: string, code: number }>}
 */
function exportDistro({ distro, targetPath, taskId, onOutput }) {
  return new Promise((resolve) => {
    const args = ['--export', distro, targetPath];
    const proc = spawn('wsl', args, { windowsHide: true });
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

/**
 * Import a WSL distro from a .tar file.
 * @param {Object} opts
 * @param {string} opts.name           Name for the new distro
 * @param {string} opts.installLocation  Directory to install into
 * @param {string} opts.tarPath         Path to the .tar archive
 * @param {string} [opts.taskId]
 * @param {function} [opts.onOutput]
 * @returns {Promise<{ ok: boolean, output: string, code: number }>}
 */
function importDistro({ name, installLocation, tarPath, taskId, onOutput }) {
  return new Promise((resolve) => {
    const args = ['--import', name, installLocation, tarPath];
    const proc = spawn('wsl', args, { windowsHide: true });
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

/**
 * Clone a WSL distro by exporting to a temp .tar and importing with a new name.
 * @param {Object} opts
 * @param {string} opts.distro          Source distro name
 * @param {string} opts.newName         Name for the cloned distro
 * @param {string} opts.installLocation Directory to install the clone into
 * @param {string} [opts.taskId]
 * @param {function} [opts.onOutput]
 * @returns {Promise<{ ok: boolean, output: string, code: number }>}
 */
async function cloneDistro({ distro, newName, installLocation, taskId, onOutput }) {
  const tempTar = path.join(os.tmpdir(), `wsl-clone-${Date.now()}.tar`);

  if (onOutput) onOutput({ taskId, text: `Exporting ${distro} to temporary archive...\n` });
  const exportResult = await exportDistro({ distro, targetPath: tempTar, taskId, onOutput });
  if (!exportResult.ok) {
    try { fs.unlinkSync(tempTar); } catch { /* ignore */ }
    return { ok: false, output: 'Export failed: ' + exportResult.output, code: exportResult.code };
  }

  if (onOutput) onOutput({ taskId, text: `Importing as ${newName}...\n` });
  const importResult = await importDistro({ name: newName, installLocation, tarPath: tempTar, taskId, onOutput });

  // Clean up temp file
  try { fs.unlinkSync(tempTar); } catch { /* ignore */ }

  if (!importResult.ok) {
    return { ok: false, output: 'Import failed: ' + importResult.output, code: importResult.code };
  }

  return { ok: true, output: exportResult.output + importResult.output, code: 0 };
}

/**
 * Restart a WSL distro by terminating it and then starting it again.
 * @param {Object} opts
 * @param {string} opts.distro
 * @param {string} [opts.taskId]
 * @param {function} [opts.onOutput]
 * @returns {Promise<{ ok: boolean, output: string, code: number }>}
 */
async function restartDistro({ distro, taskId, onOutput }) {
  if (onOutput) onOutput({ taskId, text: `Terminating ${distro}...\n` });
  const termResult = await runWslCommand({ command: `wsl --terminate ${distro}`, taskId, onOutput });

  // Brief pause to let the distro fully stop
  await new Promise(r => setTimeout(r, 1500));

  if (onOutput) onOutput({ taskId, text: `Starting ${distro}...\n` });
  const startResult = await runWslCommand({ command: `wsl -d ${distro} -- echo "WSL restarted"`, taskId, onOutput });

  const output = (termResult.output || '') + (startResult.output || '');
  return { ok: startResult.ok, output, code: startResult.code };
}

/**
 * Unregister (delete) a WSL distro.
 * @param {Object} opts
 * @param {string} opts.distro
 * @param {string} [opts.taskId]
 * @param {function} [opts.onOutput]
 * @returns {Promise<{ ok: boolean, output: string, code: number }>}
 */
function unregisterDistro({ distro, taskId, onOutput }) {
  return new Promise((resolve) => {
    const args = ['--unregister', distro];
    const proc = spawn('wsl', args, { windowsHide: true });
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

/**
 * Set the default user for a WSL distro by writing /etc/wsl.conf.
 * Merges with any existing wsl.conf content, preserving other sections.
 * @param {string} distro
 * @param {string} user
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function setDefaultUser(distro, user) {
  const existing = await readWslConf(distro);
  const config = (existing.ok && existing.data) ? existing.data : {};
  if (!config.user) config.user = {};
  config.user.default = user;
  return writeWslConf(distro, config);
}

/**
 * Migrate a WSL distro to a new location.
 * Steps: export → terminate → unregister → import → set default user → verify → cleanup.
 *
 * @param {Object} opts
 * @param {string} opts.distro          Distro name to migrate
 * @param {string} opts.destinationPath Target directory on new drive
 * @param {string} opts.defaultUser     Username to restore after import
 * @param {boolean} [opts.keepBackup=false]  If true, preserve the tar file
 * @param {string} [opts.taskId]
 * @param {function} [opts.onOutput]
 * @param {function} [opts.onStep]     Step progress callback: ({ step, status }) => void
 * @returns {Promise<{ ok: boolean, output: string, tarPath?: string, error?: string }>}
 */
async function migrateDistro({ distro, destinationPath, defaultUser, keepBackup, taskId, onOutput, onStep }) {
  const tempTar = path.join(os.tmpdir(), `wsl-migrate-${distro}-${Date.now()}.tar`);
  let fullOutput = '';

  const log = (text) => {
    fullOutput += text;
    if (onOutput) onOutput({ taskId, text });
  };

  const step = (name, status) => {
    if (onStep) onStep({ step: name, status });
  };

  try {
    // Step 1: Export
    step('export', 'active');
    log(`Exporting ${distro}...\n`);
    const exportResult = await exportDistro({ distro, targetPath: tempTar, taskId, onOutput });
    if (!exportResult.ok) {
      step('export', 'failed');
      try { fs.unlinkSync(tempTar); } catch { /* ignore */ }
      return { ok: false, output: fullOutput, error: 'Export failed: ' + exportResult.output };
    }
    step('export', 'done');

    // Step 2: Terminate
    step('terminate', 'active');
    log(`Terminating ${distro}...\n`);
    await runWslCommand({ command: `wsl --terminate ${distro}`, taskId, onOutput });
    await new Promise(r => setTimeout(r, 2000));
    step('terminate', 'done');

    // Step 3: Unregister (point of no return — tar is the safety net)
    step('unregister', 'active');
    log(`Unregistering ${distro}...\n`);
    const unregResult = await unregisterDistro({ distro, taskId, onOutput });
    if (!unregResult.ok) {
      step('unregister', 'failed');
      log(`\nWARNING: Unregister failed. Your backup tar is preserved at: ${tempTar}\n`);
      return { ok: false, output: fullOutput, tarPath: tempTar, error: 'Unregister failed. Tar preserved.' };
    }
    step('unregister', 'done');

    // Step 4: Import at new location
    step('import', 'active');
    log(`Importing ${distro} to ${destinationPath}...\n`);
    const importResult = await importDistro({
      name: distro,
      installLocation: destinationPath,
      tarPath: tempTar,
      taskId,
      onOutput,
    });
    if (!importResult.ok) {
      step('import', 'failed');
      log(`\nIMPORT FAILED. Your backup tar is preserved at: ${tempTar}\n`);
      log(`To recover manually: wsl --import ${distro} "${destinationPath}" "${tempTar}"\n`);
      return { ok: false, output: fullOutput, tarPath: tempTar, error: 'Import failed. Tar preserved for manual recovery.' };
    }
    step('import', 'done');

    // Step 5: Restore default user
    step('user', 'active');
    if (defaultUser && defaultUser !== 'root') {
      log(`Restoring default user: ${defaultUser}...\n`);
      const userResult = await setDefaultUser(distro, defaultUser);
      if (!userResult.ok) {
        log('WARNING: Could not restore default user. You may need to set it manually in /etc/wsl.conf\n');
      }
      // Terminate and restart to apply wsl.conf changes
      await runWslCommand({ command: `wsl --terminate ${distro}` });
      await new Promise(r => setTimeout(r, 1500));
    }
    step('user', 'done');

    // Step 6: Verify
    step('verify', 'active');
    log('Verifying migration...\n');
    const verifyResult = await runCleanupTask({
      distro,
      taskId: taskId || 'migrate-verify',
      command: 'echo "Migration verified: $(whoami)@$(hostname)"',
      asRoot: false,
    });
    if (verifyResult.ok) {
      log(`Verification passed: ${verifyResult.output.trim()}\n`);
    } else {
      log('WARNING: Verification command failed, but import succeeded. The distro should still work.\n');
    }
    step('verify', 'done');

    // Step 7: Cleanup tar
    step('cleanup', 'active');
    if (!keepBackup) {
      try {
        fs.unlinkSync(tempTar);
        log('Temporary archive removed.\n');
      } catch {
        log(`Note: Could not remove temporary archive at ${tempTar}\n`);
      }
    } else {
      log(`Backup archive preserved at: ${tempTar}\n`);
    }
    step('cleanup', 'done');

    return { ok: true, output: fullOutput, tarPath: keepBackup ? tempTar : null };
  } catch (err) {
    log(`\nUnexpected error: ${err.message}\n`);
    log(`Backup tar may be at: ${tempTar}\n`);
    return { ok: false, output: fullOutput, tarPath: tempTar, error: err.message };
  }
}

/**
 * Collect lightweight comparison data for multiple distros in parallel.
 * For each distro, gathers: uptime, package count, OS name/version.
 *
 * @param {string[]} distros  Array of distro names
 * @returns {Promise<Array<{ distro: string, uptime: { seconds: number, formatted: string }, packages: number|null, os: string }>>}
 */
function getDistroComparison(distros) {
  const promises = distros.map(distro => {
    return new Promise((resolve) => {
      const scriptContent = [
        '#!/bin/bash',
        'echo "---UPTIME---"',
        'cat /proc/uptime 2>/dev/null || true',
        'echo "---PACKAGES---"',
        '(dpkg -l 2>/dev/null | tail -n+6 | wc -l || rpm -qa 2>/dev/null | wc -l || pacman -Q 2>/dev/null | wc -l) || true',
        'echo "---OS---"',
        '. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME" || echo "Unknown"',
        'exit 0',
      ].join('\n');

      const tempDir = process.env.TEMP || os.tmpdir();
      const tempScript = path.join(tempDir, `wsl-cleaner-compare-${distro.replace(/[^a-zA-Z0-9]/g, '_')}.sh`);
      fs.writeFileSync(tempScript, scriptContent.replace(/\r\n/g, '\n'), 'utf8');

      const wslScriptPath = tempScript.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, d) => `/mnt/${d.toLowerCase()}`);
      const args = ['-d', distro, '--', 'bash', wslScriptPath];
      const proc = spawn('wsl', args, { windowsHide: true, env: wslEnv });
      let output = '';

      proc.stdout.on('data', (data) => { output += data.toString(); });
      proc.stderr.on('data', () => {}); // discard

      proc.on('close', () => {
        fs.unlink(tempScript, () => {});

        // Parse sections
        const sections = {};
        let currentSection = null;
        for (const line of output.split('\n')) {
          const m = line.match(/^---(\w+)---$/);
          if (m) { currentSection = m[1]; sections[currentSection] = []; }
          else if (currentSection) sections[currentSection].push(line);
        }

        // Uptime
        const uptimeRaw = (sections.UPTIME || []).join('').trim();
        const uptimeSeconds = parseFloat(uptimeRaw.split(/\s+/)[0]) || 0;

        // Packages
        const pkgLines = (sections.PACKAGES || []).filter(l => l.trim());
        const packages = pkgLines.length > 0 ? (parseInt(pkgLines[0].trim(), 10) || null) : null;

        // OS
        const osName = (sections.OS || []).filter(l => l.trim()).join('').trim() || 'Unknown';

        resolve({
          distro,
          uptime: { seconds: uptimeSeconds, formatted: formatUptime(uptimeSeconds) },
          packages,
          os: osName,
        });
      });

      proc.on('error', () => {
        fs.unlink(tempScript, () => {});
        resolve({ distro, uptime: { seconds: 0, formatted: '--' }, packages: null, os: 'Unknown' });
      });
    });
  });

  return Promise.all(promises);
}

// ── INI parser / serializer ──────────────────────────────────────────────────

function parseIni(text) {
  const result = {};
  let currentSection = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;
    const secMatch = line.match(/^\[(.+)\]$/);
    if (secMatch) {
      currentSection = secMatch[1].toLowerCase();
      if (!result[currentSection]) result[currentSection] = {};
      continue;
    }
    const kvMatch = line.match(/^\s*([^=]+?)\s*=\s*(.*?)\s*$/);
    if (kvMatch && currentSection) {
      result[currentSection][kvMatch[1]] = kvMatch[2];
    }
  }
  return result;
}

function serializeIni(obj) {
  const lines = [];
  for (const [section, entries] of Object.entries(obj)) {
    if (!entries || typeof entries !== 'object') continue;
    const keys = Object.entries(entries).filter(([, v]) => v !== '' && v != null);
    if (keys.length === 0) continue;
    lines.push(`[${section}]`);
    for (const [key, value] of keys) {
      lines.push(`${key}=${value}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

// ── WSL Config Editor ────────────────────────────────────────────────────────

function getSystemResources() {
  return { totalMemory: os.totalmem(), cpuCount: os.cpus().length };
}

function readWslConfig() {
  try {
    const configPath = path.join(os.homedir(), '.wslconfig');
    if (!fs.existsSync(configPath)) {
      return { ok: true, data: null, path: configPath };
    }
    const raw = fs.readFileSync(configPath, 'utf8');
    const data = parseIni(raw);
    return { ok: true, data, path: configPath };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function writeWslConfig(config) {
  try {
    const configPath = path.join(os.homedir(), '.wslconfig');
    // Backup existing file
    if (fs.existsSync(configPath)) {
      fs.copyFileSync(configPath, configPath + '.bak');
    }
    const content = serializeIni(config);
    fs.writeFileSync(configPath, content, 'utf8');
    return { ok: true, backupPath: configPath + '.bak' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function readWslConf(distro) {
  return new Promise((resolve) => {
    const proc = spawn('wsl', ['-d', distro, '--', 'bash', '-c', 'cat /etc/wsl.conf 2>/dev/null'], {
      windowsHide: true,
      env: wslEnv,
    });
    let output = '';

    proc.stdout.on('data', (chunk) => { output += chunk.toString(); });
    proc.stderr.on('data', () => {});

    proc.on('close', () => {
      if (!output.trim()) {
        resolve({ ok: true, data: null });
        return;
      }
      const data = parseIni(output);
      resolve({ ok: true, data: Object.keys(data).length > 0 ? data : null });
    });

    proc.on('error', () => {
      resolve({ ok: true, data: null });
    });
  });
}

function writeWslConf(distro, config) {
  return new Promise((resolve) => {
    const content = serializeIni(config);
    // Backup existing file, then write new content — all via bash to avoid cmd.exe issues
    const script = 'cp /etc/wsl.conf /etc/wsl.conf.bak 2>/dev/null; cat > /etc/wsl.conf';
    const proc = spawn('wsl', ['-d', distro, '-u', 'root', '--', 'bash', '-c', script], {
      windowsHide: true,
      env: wslEnv,
    });

    proc.stdin.write(content);
    proc.stdin.end();

    let stderr = '';
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ ok: true });
      } else {
        resolve({ ok: false, error: stderr.trim() || `Write exited with code ${code}` });
      }
    });

    proc.on('error', (err) => {
      resolve({ ok: false, error: err.message });
    });
  });
}

// ── Startup Manager ─────────────────────────────────────────────────────────

const SAFE_UNIT_RE = /^[a-zA-Z0-9@._-]+\.service$/;

/**
 * List all systemd service unit files and their states for a distro.
 * Also detects the init system (systemd vs init).
 *
 * @param {string} distro
 * @returns {Promise<{ ok: boolean, data?: { initSystem: string, services: Array }, error?: string }>}
 */
function getStartupServices(distro) {
  return new Promise((resolve) => {
    const scriptContent = [
      '#!/bin/bash',
      'echo "---INIT---"',
      'cat /proc/1/comm 2>/dev/null || echo "unknown"',
      'echo "---UNITFILES---"',
      'systemctl list-unit-files --type=service --no-pager --no-legend 2>/dev/null || true',
      'echo "---ACTIVEUNITS---"',
      'systemctl list-units --type=service --all --no-pager --no-legend 2>/dev/null || true',
      'exit 0',
    ].join('\n');

    const tempDir = process.env.TEMP || '.';
    const tempScript = path.join(tempDir, 'wsl-cleaner-startup.sh');
    fs.writeFileSync(tempScript, scriptContent.replace(/\r\n/g, '\n'), 'utf8');

    const wslScriptPath = tempScript.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, d) => `/mnt/${d.toLowerCase()}`);
    const args = ['-d', distro, '--', 'bash', wslScriptPath];
    const proc = spawn('wsl', args, { windowsHide: true, env: wslEnv });
    let output = '';

    proc.stdout.on('data', (data) => { output += data.toString(); });
    proc.stderr.on('data', () => {});

    proc.on('close', (code) => {
      fs.unlink(tempScript, () => {});

      if (code !== 0 && output.trim() === '') {
        resolve({ ok: false, error: 'Startup script exited with code ' + code + ' and no output.' });
        return;
      }

      try {
        const data = parseStartupOutput(output);
        resolve({ ok: true, data });
      } catch (err) {
        resolve({ ok: false, error: 'Failed to parse startup data: ' + err.message });
      }
    });

    proc.on('error', (err) => {
      fs.unlink(tempScript, () => {});
      resolve({ ok: false, error: friendlyError(err.message) });
    });
  });
}

/**
 * Parse the combined startup script output into structured data.
 * @param {string} raw
 * @returns {{ initSystem: string, services: Array }}
 */
function parseStartupOutput(raw) {
  const sections = {};
  let currentSection = null;
  const lines = raw.split('\n');

  for (const line of lines) {
    const sectionMatch = line.match(/^---(\w+)---$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      sections[currentSection] = [];
    } else if (currentSection) {
      sections[currentSection].push(line);
    }
  }

  // Init system
  const initLine = (sections.INIT || []).filter(l => l.trim()).join('').trim();
  const initSystem = initLine === 'systemd' ? 'systemd' : (initLine === 'init' ? 'init' : 'unknown');

  // Unit files: each line is "unit.service  STATE  PRESET"
  const unitFileMap = new Map();
  for (const line of (sections.UNITFILES || [])) {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 2 && parts[0].endsWith('.service')) {
      unitFileMap.set(parts[0], {
        unit: parts[0],
        unitFileState: parts[1],
        preset: parts[2] || '',
        activeState: '',
        subState: '',
      });
    }
  }

  // Active units: each line like "● unit.service  loaded  active  running  Description..."
  for (const line of (sections.ACTIVEUNITS || [])) {
    const cleaned = line.replace(/^[●\s]+/, '');
    const parts = cleaned.split(/\s+/);
    if (parts.length >= 4 && parts[0].endsWith('.service')) {
      const unitName = parts[0];
      const activeState = parts[2] || '';
      const subState = parts[3] || '';
      if (unitFileMap.has(unitName)) {
        const entry = unitFileMap.get(unitName);
        entry.activeState = activeState;
        entry.subState = subState;
      } else {
        unitFileMap.set(unitName, {
          unit: unitName,
          unitFileState: 'unknown',
          preset: '',
          activeState,
          subState,
        });
      }
    }
  }

  const services = Array.from(unitFileMap.values());
  services.sort((a, b) => a.unit.localeCompare(b.unit));

  return { initSystem, services };
}

/**
 * Enable or disable a systemd service unit.
 * Runs as the default user (inside the systemd namespace) using sudo,
 * so that systemctl can communicate with the daemon for reload.
 *
 * @param {string} distro
 * @param {string} unit - Service unit name (e.g. "ssh.service")
 * @param {boolean} enabled - true to enable, false to disable
 * @returns {Promise<{ ok: boolean, output: string, code: number }>}
 */
function setServiceState(distro, unit, enabled) {
  if (!SAFE_UNIT_RE.test(unit)) {
    return Promise.resolve({ ok: false, output: 'Invalid unit name.', code: -1 });
  }

  return new Promise((resolve) => {
    const action = enabled ? 'enable' : 'disable';
    const scriptContent = [
      '#!/bin/bash',
      `sudo systemctl ${action} ${unit} 2>&1`,
      'exit $?',
    ].join('\n');

    const tempDir = process.env.TEMP || '.';
    const tempScript = path.join(tempDir, 'wsl-cleaner-svc-toggle.sh');
    fs.writeFileSync(tempScript, scriptContent.replace(/\r\n/g, '\n'), 'utf8');

    const wslScriptPath = tempScript.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, d) => `/mnt/${d.toLowerCase()}`);
    const args = ['-d', distro, '--', 'bash', wslScriptPath];
    const proc = spawn('wsl', args, { windowsHide: true, env: wslEnv });
    let fullOutput = '';

    proc.stdout.on('data', (data) => { fullOutput += data.toString(); });
    proc.stderr.on('data', (data) => { fullOutput += data.toString(); });

    proc.on('close', (code) => {
      fs.unlink(tempScript, () => {});
      resolve({ ok: code === 0, output: fullOutput.trim(), code });
    });

    proc.on('error', (err) => {
      fs.unlink(tempScript, () => {});
      resolve({ ok: false, output: friendlyError(err.message), code: -1 });
    });
  });
}

/**
 * Get detailed properties for a single systemd service unit.
 * Runs as the default user (no root needed for read-only query)
 * so that systemctl can talk to the systemd daemon via D-Bus.
 *
 * @param {string} distro
 * @param {string} unit
 * @returns {Promise<{ ok: boolean, data?: Object, error?: string }>}
 */
function getServiceDetails(distro, unit) {
  if (!SAFE_UNIT_RE.test(unit)) {
    return Promise.resolve({ ok: false, error: 'Invalid unit name.' });
  }

  return new Promise((resolve) => {
    const scriptContent = [
      '#!/bin/bash',
      `systemctl show ${unit} -p ActiveState,SubState,UnitFileState,Description,Type,MainPID,ExecMainStartTimestamp,FragmentPath,WantedBy --no-pager 2>/dev/null`,
      'exit 0',
    ].join('\n');

    const tempDir = process.env.TEMP || '.';
    const tempScript = path.join(tempDir, 'wsl-cleaner-svc-detail.sh');
    fs.writeFileSync(tempScript, scriptContent.replace(/\r\n/g, '\n'), 'utf8');

    const wslScriptPath = tempScript.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, d) => `/mnt/${d.toLowerCase()}`);
    const args = ['-d', distro, '--', 'bash', wslScriptPath];
    const proc = spawn('wsl', args, { windowsHide: true, env: wslEnv });
    let output = '';

    proc.stdout.on('data', (data) => { output += data.toString(); });
    proc.stderr.on('data', () => {});

    proc.on('close', () => {
      fs.unlink(tempScript, () => {});
      const data = {};
      for (const line of output.split('\n')) {
        const eqIdx = line.indexOf('=');
        if (eqIdx > 0) {
          data[line.substring(0, eqIdx).trim()] = line.substring(eqIdx + 1).trim();
        }
      }
      resolve({ ok: true, data });
    });

    proc.on('error', (err) => {
      fs.unlink(tempScript, () => {});
      resolve({ ok: false, error: friendlyError(err.message) });
    });
  });
}

/**
 * Check for the existence and content of /etc/rc.local.
 *
 * @param {string} distro
 * @returns {Promise<{ ok: boolean, exists: boolean, content: string, error?: string }>}
 */
function getRcLocal(distro) {
  return new Promise((resolve) => {
    const cmd = 'if [ -f /etc/rc.local ]; then echo "EXISTS=yes"; cat /etc/rc.local 2>/dev/null; else echo "EXISTS=no"; fi';
    const args = ['-d', distro, '-u', 'root', '--', 'bash', '-lc', cmd];
    const proc = spawn('wsl', args, { windowsHide: true, env: wslEnv });
    let output = '';

    proc.stdout.on('data', (data) => { output += data.toString(); });
    proc.stderr.on('data', () => {});

    proc.on('close', () => {
      const exists = output.includes('EXISTS=yes');
      const content = exists ? output.replace(/^EXISTS=yes\n?/, '') : '';
      resolve({ ok: true, exists, content });
    });

    proc.on('error', (err) => {
      resolve({ ok: false, exists: false, content: '', error: friendlyError(err.message) });
    });
  });
}

// ── Performance Benchmarking ─────────────────────────────────────────────────

/**
 * Benchmark WSL cold-boot startup time for one or more distros.
 * Runs from the Node.js side because `wsl --shutdown` kills all WSL instances.
 * @param {Object} opts
 * @param {Array<string>} opts.distros - Distro names to benchmark
 * @returns {Promise<{ ok: boolean, data?: object, error?: string }>}
 */
async function benchmarkStartupTime({ distros }) {
  const results = [];

  for (const distro of distros) {
    try {
      // Shutdown WSL completely
      await execFileAsync('wsl', ['--shutdown'], { windowsHide: true, timeout: 15000 });

      // Wait for clean shutdown
      await new Promise(r => setTimeout(r, 2000));

      // Time the cold boot
      const start = process.hrtime.bigint();
      await execFileAsync('wsl', ['-d', distro, '--', 'echo', 'ready'], {
        windowsHide: true,
        timeout: 60000,
        env: wslEnv,
      });
      const end = process.hrtime.bigint();

      const ms = Number(end - start) / 1_000_000;
      results.push({
        distro,
        bootTimeMs: Math.round(ms),
        bootTimeSeconds: ms / 1000,
      });
    } catch (err) {
      results.push({
        distro,
        bootTimeMs: -1,
        bootTimeSeconds: -1,
        error: err.message,
      });
    }
  }

  return { ok: true, data: { results } };
}

// ── Shell Startup Profiling ─────────────────────────────────────────────────

/**
 * Profile shell startup time for a WSL distro.
 * Detects shell type, measures total vs baseline startup, identifies slow items.
 * @param {Object} opts
 * @param {string} opts.distro
 * @returns {Promise<{ ok: boolean, data?: object, error?: string }>}
 */
function profileShellStartup({ distro }) {
  return new Promise((resolve) => {
    const scriptContent = [
      '#!/bin/bash',

      // Detect default shell
      'echo "---SHELL---"',
      'SHELL_NAME=$(basename "$SHELL" 2>/dev/null || echo "bash")',
      'echo "$SHELL_NAME"',

      // Shell version
      'echo "---SHELL_VERSION---"',
      'if [ "$SHELL_NAME" = "zsh" ]; then',
      '  zsh --version 2>/dev/null | head -1 || echo "unknown"',
      'elif [ "$SHELL_NAME" = "bash" ]; then',
      '  bash --version 2>/dev/null | head -1 || echo "unknown"',
      'elif [ "$SHELL_NAME" = "fish" ]; then',
      '  fish --version 2>/dev/null | head -1 || echo "unknown"',
      'else',
      '  echo "unknown"',
      'fi',

      // Total interactive login shell startup time
      'echo "---TOTAL_TIME---"',
      'if [ "$SHELL_NAME" = "zsh" ]; then',
      '  START=$(date +%s%N)',
      '  zsh -l -i -c exit 2>/dev/null',
      '  END=$(date +%s%N)',
      'elif [ "$SHELL_NAME" = "fish" ]; then',
      '  START=$(date +%s%N)',
      '  fish -l -i -c exit 2>/dev/null',
      '  END=$(date +%s%N)',
      'else',
      '  START=$(date +%s%N)',
      '  bash -l -i -c exit 2>/dev/null',
      '  END=$(date +%s%N)',
      'fi',
      'echo "TOTAL_MS=$(( (END - START) / 1000000 ))"',

      // Baseline (no rc files) startup time
      'echo "---BASELINE_TIME---"',
      'if [ "$SHELL_NAME" = "zsh" ]; then',
      '  START=$(date +%s%N)',
      '  zsh --no-rcs -i -c exit 2>/dev/null',
      '  END=$(date +%s%N)',
      'elif [ "$SHELL_NAME" = "fish" ]; then',
      '  START=$(date +%s%N)',
      '  fish --no-config -i -c exit 2>/dev/null',
      '  END=$(date +%s%N)',
      'else',
      '  START=$(date +%s%N)',
      '  bash --norc --noprofile -i -c exit 2>/dev/null',
      '  END=$(date +%s%N)',
      'fi',
      'echo "BASELINE_MS=$(( (END - START) / 1000000 ))"',

      // Per-file analysis: line count + source time
      'echo "---FILES---"',
      'for FILE in ~/.bashrc ~/.bash_profile ~/.bash_login ~/.profile ~/.zshrc ~/.zshenv ~/.zprofile ~/.zlogin ~/.config/fish/config.fish; do',
      '  if [ -f "$FILE" ]; then',
      '    LINES=$(wc -l < "$FILE" 2>/dev/null || echo 0)',
      '    START=$(date +%s%N)',
      '    if [ "$SHELL_NAME" = "zsh" ]; then',
      '      zsh --no-rcs -c "source \'$FILE\'" 2>/dev/null',
      '    elif [ "$SHELL_NAME" = "fish" ]; then',
      '      fish --no-config -c "source \'$FILE\'" 2>/dev/null',
      '    else',
      '      bash --norc --noprofile -c "source \'$FILE\'" 2>/dev/null',
      '    fi',
      '    END=$(date +%s%N)',
      '    FILE_MS=$(( (END - START) / 1000000 ))',
      '    echo "FILE=$FILE|LINES=$LINES|MS=$FILE_MS"',
      '  fi',
      'done',

      // Detect known slow patterns in rc files
      'echo "---SLOW_ITEMS---"',
      'for RC in ~/.bashrc ~/.bash_profile ~/.profile ~/.zshrc ~/.zprofile ~/.zshenv ~/.config/fish/config.fish; do',
      '  [ -f "$RC" ] || continue',
      '  grep -qE "(nvm\\.sh|NVM_DIR)" "$RC" 2>/dev/null && echo "ITEM=nvm|FILE=$RC|SUGGESTION=Lazy-load nvm: only initialise it when you first run node/npm/nvm"',
      '  grep -qE "conda (init|activate|setup)" "$RC" 2>/dev/null && echo "ITEM=conda|FILE=$RC|SUGGESTION=Run \'conda config --set auto_activate_base false\' to skip auto-activation"',
      '  grep -qE "(rvm\\.sh|rvm/scripts)" "$RC" 2>/dev/null && echo "ITEM=rvm|FILE=$RC|SUGGESTION=Consider switching to rbenv or asdf which have faster startup"',
      '  grep -qE "oh-my-zsh\\.sh" "$RC" 2>/dev/null && echo "ITEM=oh-my-zsh|FILE=$RC|SUGGESTION=Reduce number of plugins or switch to a lighter framework like zinit or starship"',
      '  grep -qE "pyenv init" "$RC" 2>/dev/null && echo "ITEM=pyenv|FILE=$RC|SUGGESTION=Use pyenv with lazy loading or switch to uv/rye for Python management"',
      '  grep -qE "rbenv init" "$RC" 2>/dev/null && echo "ITEM=rbenv|FILE=$RC|SUGGESTION=Lazy-load rbenv by wrapping the init in a function"',
      '  grep -qE "sdkman-init\\.sh" "$RC" 2>/dev/null && echo "ITEM=sdkman|FILE=$RC|SUGGESTION=Lazy-load SDKMAN by deferring the init script"',
      '  grep -qE "(homebrew|linuxbrew)" "$RC" 2>/dev/null && echo "ITEM=homebrew|FILE=$RC|SUGGESTION=Cache \'brew --prefix\' output instead of calling it on every shell start"',
      '  grep -qE "compinit" "$RC" 2>/dev/null && echo "ITEM=compinit|FILE=$RC|SUGGESTION=Use \'compinit -C\' (the -C flag skips the security check for faster startup)"',
      '  grep -qE "antigen (bundle|apply)" "$RC" 2>/dev/null && echo "ITEM=antigen|FILE=$RC|SUGGESTION=Switch to a faster plugin manager like zinit or sheldon"',
      '  PATH_LINES=$(grep -cE "^export PATH|^PATH=" "$RC" 2>/dev/null || echo 0)',
      '  [ "$PATH_LINES" -gt 5 ] 2>/dev/null && echo "ITEM=excessive PATH exports ($PATH_LINES)|FILE=$RC|SUGGESTION=Consolidate PATH modifications into fewer statements"',
      'done',

      'exit 0',
    ].join('\n');

    const tempDir = process.env.TEMP || os.tmpdir();
    const tempScript = path.join(tempDir, 'wsl-cleaner-profile.sh');
    fs.writeFileSync(tempScript, scriptContent.replace(/\r\n/g, '\n'), 'utf8');

    const wslScriptPath = tempScript.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, d) => `/mnt/${d.toLowerCase()}`);
    const args = ['-d', distro, '--', 'bash', wslScriptPath];
    const proc = spawn('wsl', args, { windowsHide: true, env: wslEnv });
    let output = '';

    proc.stdout.on('data', (data) => { output += data.toString(); });
    proc.stderr.on('data', () => {}); // discard stderr

    proc.on('close', (code) => {
      fs.unlink(tempScript, () => {});

      if (code !== 0 && output.trim() === '') {
        resolve({ ok: false, error: 'Profiler script exited with code ' + code + ' and no output.' });
        return;
      }

      try {
        const data = parseProfilerOutput(output);
        resolve({ ok: true, data });
      } catch (err) {
        resolve({ ok: false, error: 'Failed to parse profiler data: ' + err.message });
      }
    });

    proc.on('error', (err) => {
      fs.unlink(tempScript, () => {});
      resolve({ ok: false, error: friendlyError(err.message) });
    });
  });
}

/**
 * Parse the shell profiler script output into structured data.
 * @param {string} raw
 * @returns {Object}
 */
function parseProfilerOutput(raw) {
  const lines = raw.split('\n');

  let shell = 'bash';
  let shellVersion = 'unknown';
  let totalTimeMs = 0;
  let baselineTimeMs = 0;
  const filesAnalyzed = [];
  const slowItems = [];

  let section = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('---') && trimmed.endsWith('---')) {
      section = trimmed.replace(/^---+|---+$/g, '');
      continue;
    }

    if (section === 'SHELL' && trimmed) {
      shell = trimmed;
    } else if (section === 'SHELL_VERSION' && trimmed) {
      shellVersion = trimmed;
    } else if (section === 'TOTAL_TIME' && trimmed.startsWith('TOTAL_MS=')) {
      totalTimeMs = parseInt(trimmed.split('=')[1], 10) || 0;
    } else if (section === 'BASELINE_TIME' && trimmed.startsWith('BASELINE_MS=')) {
      baselineTimeMs = parseInt(trimmed.split('=')[1], 10) || 0;
    } else if (section === 'FILES' && trimmed.startsWith('FILE=')) {
      const parts = trimmed.split('|');
      const filePath = (parts[0] || '').split('=')[1] || '';
      const lineCount = parseInt((parts[1] || '').split('=')[1], 10) || 0;
      const fileMs = parseInt((parts[2] || '').split('=')[1], 10) || 0;
      filesAnalyzed.push({ path: filePath, lineCount, sourceTimeMs: fileMs, sourceTimeSeconds: fileMs / 1000 });
    } else if (section === 'SLOW_ITEMS' && trimmed.startsWith('ITEM=')) {
      const parts = trimmed.split('|');
      const name = (parts[0] || '').split('=')[1] || '';
      const file = (parts[1] || '').split('=')[1] || '';
      const suggestion = (parts[2] || '').split('=').slice(1).join('=') || '';
      slowItems.push({ name, file, suggestion });
    }
  }

  const rcOverheadMs = Math.max(0, totalTimeMs - baselineTimeMs);

  return {
    shell,
    shellVersion,
    totalTimeMs,
    totalTimeSeconds: totalTimeMs / 1000,
    baselineTimeMs,
    baselineTimeSeconds: baselineTimeMs / 1000,
    rcOverheadMs,
    rcOverheadSeconds: rcOverheadMs / 1000,
    filesAnalyzed,
    slowItems,
  };
}

module.exports = {
  wslEnv,
  checkWsl,
  detectTools,
  runCleanupTask,
  findVhdx,
  getFileSize,
  getAvailableSpace,
  runWslCommand,
  scanStaleDirs,
  deleteStaleDirs,
  optimizeVhdx,
  estimateTaskSizes,
  scanDiskUsage,
  cancelDiskScan,
  getHealthInfo,
  exportDistro,
  importDistro,
  cloneDistro,
  restartDistro,
  unregisterDistro,
  getDefaultUser,
  getDriveSpace,
  setDefaultUser,
  migrateDistro,
  getDistroComparison,
  getSystemResources,
  readWslConfig,
  writeWslConfig,
  readWslConf,
  writeWslConf,
  getStartupServices,
  setServiceState,
  getServiceDetails,
  getRcLocal,
  benchmarkStartupTime,
  profileShellStartup,
};
