#!/usr/bin/env node
'use strict';

const { TASKS } = require('./renderer/tasks');
const wslOps = require('./lib/wsl-ops');
const pkg = require('./package.json');

// ── ANSI helpers (auto-disabled when not a TTY) ──────────────────────────────

const isTTY = process.stdout.isTTY;
const c = {
  reset:   isTTY ? '\x1b[0m'  : '',
  bold:    isTTY ? '\x1b[1m'  : '',
  dim:     isTTY ? '\x1b[2m'  : '',
  green:   isTTY ? '\x1b[32m' : '',
  yellow:  isTTY ? '\x1b[33m' : '',
  red:     isTTY ? '\x1b[31m' : '',
  cyan:    isTTY ? '\x1b[36m' : '',
  magenta: isTTY ? '\x1b[35m' : '',
};

// ── Argument parsing ─────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {
    action: null,        // list | clean | scan-stale | compact | list-tasks
    distro: null,
    tasks: null,         // array of task IDs, or null for all
    exclude: [],         // task IDs to skip
    days: 30,
    dryRun: false,
    json: false,
    noAggressive: false,
    verbose: false,
    quiet: false,
    help: false,
    version: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--list':          opts.action = 'list'; break;
      case '--clean':         opts.action = 'clean'; break;
      case '--scan-stale':    opts.action = 'scan-stale'; break;
      case '--compact':       opts.action = 'compact'; break;
      case '--list-tasks':    opts.action = 'list-tasks'; break;
      case '--distro': case '-d':
        opts.distro = args[++i]; break;
      case '--tasks': case '-t':
        opts.tasks = args[++i]?.split(',').map(s => s.trim()).filter(Boolean); break;
      case '--exclude':
        opts.exclude = args[++i]?.split(',').map(s => s.trim()).filter(Boolean) || []; break;
      case '--days':
        opts.days = parseInt(args[++i], 10) || 30; break;
      case '--dry-run':       opts.dryRun = true; break;
      case '--json':          opts.json = true; break;
      case '--no-aggressive': opts.noAggressive = true; break;
      case '--verbose': case '-v': opts.verbose = true; break;
      case '--quiet': case '-q':   opts.quiet = true; break;
      case '--help': case '-h':    opts.help = true; break;
      case '--version':       opts.version = true; break;
      default:
        if (arg.startsWith('-')) {
          fatal(`Unknown option: ${arg}\nRun with --help for usage.`);
        }
    }
  }

  return opts;
}

// ── Output helpers ───────────────────────────────────────────────────────────

let quietMode = false;

function info(msg) { if (!quietMode) console.log(msg); }
function success(msg) { if (!quietMode) console.log(`${c.green}${msg}${c.reset}`); }
function warn(msg) { console.error(`${c.yellow}warning:${c.reset} ${msg}`); }
function fatal(msg) { console.error(`${c.red}error:${c.reset} ${msg}`); process.exit(1); }

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function stripHtml(str) {
  return str.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&ndash;/g, '-').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

// ── Help text ────────────────────────────────────────────────────────────────

function showHelp() {
  console.log(`
${c.bold}WSL Cleaner CLI${c.reset} v${pkg.version}
Clean and reclaim disk space from WSL 2 distributions.

${c.bold}USAGE${c.reset}
  wsl-cleaner ${c.cyan}<action>${c.reset} [options]

${c.bold}ACTIONS${c.reset}
  ${c.cyan}--list${c.reset}              List available WSL 2 distributions
  ${c.cyan}--clean${c.reset}             Run cleanup tasks on a distribution
  ${c.cyan}--scan-stale${c.reset}        Scan for stale directories (node_modules, vendor, etc.)
  ${c.cyan}--compact${c.reset}           Compact VHDX virtual disk files
  ${c.cyan}--list-tasks${c.reset}        Show all available cleanup task IDs

${c.bold}OPTIONS${c.reset}
  ${c.cyan}--distro, -d${c.reset} <name>  Target WSL distribution (uses default if omitted)
  ${c.cyan}--tasks, -t${c.reset} <ids>    Run only these task IDs (comma-separated)
  ${c.cyan}--exclude${c.reset} <ids>      Skip these task IDs (comma-separated)
  ${c.cyan}--days${c.reset} <n>           Stale directory age threshold in days (default: 30)
  ${c.cyan}--dry-run${c.reset}            Preview actions without executing
  ${c.cyan}--json${c.reset}               Machine-readable JSON output
  ${c.cyan}--no-aggressive${c.reset}      Skip tasks marked as aggressive
  ${c.cyan}--verbose, -v${c.reset}        Show detailed output
  ${c.cyan}--quiet, -q${c.reset}          Suppress non-essential output
  ${c.cyan}--help, -h${c.reset}           Show this help message
  ${c.cyan}--version${c.reset}            Show version number

${c.bold}EXAMPLES${c.reset}
  ${c.dim}# List all WSL 2 distros${c.reset}
  wsl-cleaner --list

  ${c.dim}# Clean default distro with all applicable tasks${c.reset}
  wsl-cleaner --clean

  ${c.dim}# Clean specific distro${c.reset}
  wsl-cleaner --clean --distro Ubuntu

  ${c.dim}# Run only specific tasks${c.reset}
  wsl-cleaner --clean -d Ubuntu --tasks apt-clean,tmp,caches

  ${c.dim}# Clean but skip aggressive tasks${c.reset}
  wsl-cleaner --clean -d Ubuntu --no-aggressive

  ${c.dim}# Preview what would be cleaned${c.reset}
  wsl-cleaner --clean -d Ubuntu --dry-run

  ${c.dim}# Scan for stale directories older than 60 days${c.reset}
  wsl-cleaner --scan-stale -d Ubuntu --days 60

  ${c.dim}# Compact VHDX disk after cleanup${c.reset}
  wsl-cleaner --compact

  ${c.dim}# Full pipeline: clean then compact, JSON output for scripting${c.reset}
  wsl-cleaner --clean -d Ubuntu --json && wsl-cleaner --compact --json
`);
}

// ── Action: list distros ─────────────────────────────────────────────────────

function actionList(opts) {
  const result = wslOps.checkWsl();
  if (!result.ok) fatal(result.error);

  if (opts.json) {
    console.log(JSON.stringify({ distros: result.distros, defaultDistro: result.defaultDistro }, null, 2));
    return;
  }

  info(`${c.bold}WSL 2 Distributions${c.reset}\n`);
  for (const d of result.distros) {
    const def = d.isDefault ? ` ${c.cyan}(default)${c.reset}` : '';
    const state = d.state === 'Running' ? `${c.green}${d.state}${c.reset}` : `${c.dim}${d.state}${c.reset}`;
    info(`  ${c.bold}${d.name}${c.reset}  ${state}${def}`);
  }
  info('');
}

// ── Action: list tasks ───────────────────────────────────────────────────────

function actionListTasks(opts) {
  if (opts.json) {
    const tasks = TASKS.map(t => ({
      id: t.id,
      name: stripHtml(t.name),
      desc: stripHtml(t.desc),
      asRoot: t.asRoot,
      requires: t.requires,
      aggressive: !!t.aggressive,
    }));
    console.log(JSON.stringify(tasks, null, 2));
    return;
  }

  info(`${c.bold}Available Cleanup Tasks${c.reset}\n`);
  for (const t of TASKS) {
    const flags = [];
    if (t.asRoot) flags.push('root');
    if (t.requires) flags.push(`requires: ${t.requires}`);
    if (t.aggressive) flags.push(`${c.yellow}aggressive${c.reset}`);
    const flagStr = flags.length ? `  ${c.dim}[${flags.join(', ')}]${c.reset}` : '';
    info(`  ${c.cyan}${t.id.padEnd(22)}${c.reset} ${stripHtml(t.name)}${flagStr}`);
  }
  info(`\n  ${c.dim}${TASKS.length} tasks total${c.reset}\n`);
}

// ── Resolve target distro ────────────────────────────────────────────────────

function resolveDistro(opts) {
  const result = wslOps.checkWsl();
  if (!result.ok) fatal(result.error);

  if (opts.distro) {
    const match = result.distros.find(d => d.name.toLowerCase() === opts.distro.toLowerCase());
    if (!match) {
      fatal(`Distribution "${opts.distro}" not found. Available: ${result.distros.map(d => d.name).join(', ')}`);
    }
    return match.name;
  }

  if (result.defaultDistro) {
    if (!opts.json) info(`${c.dim}Using default distro: ${result.defaultDistro}${c.reset}`);
    return result.defaultDistro;
  }

  fatal('No --distro specified and no default distribution found. Use --list to see available distros.');
}

// ── Action: clean ────────────────────────────────────────────────────────────

async function actionClean(opts) {
  const distro = resolveDistro(opts);

  if (!opts.json) info(`${c.bold}Detecting tools in ${distro}...${c.reset}`);
  const tools = wslOps.detectTools(distro);

  if (opts.verbose && !opts.json) {
    const available = Object.entries(tools).filter(([, v]) => v).map(([k]) => k);
    info(`  Detected tools: ${available.length ? available.join(', ') : 'none'}`);
  }

  // Filter tasks based on options and tool availability
  let tasksToRun = TASKS.filter(t => {
    if (t.requires && !tools[t.requires]) return false;
    if (opts.noAggressive && t.aggressive) return false;
    if (opts.tasks && !opts.tasks.includes(t.id)) return false;
    if (opts.exclude.includes(t.id)) return false;
    return true;
  });

  // Validate --tasks IDs
  if (opts.tasks) {
    const allIds = new Set(TASKS.map(t => t.id));
    for (const id of opts.tasks) {
      if (!allIds.has(id)) warn(`Unknown task ID: ${id}`);
    }
    const skipped = opts.tasks.filter(id => {
      const task = TASKS.find(t => t.id === id);
      return task && task.requires && !tools[task.requires];
    });
    if (skipped.length) {
      warn(`Skipping tasks (missing tools): ${skipped.join(', ')}`);
    }
  }

  if (tasksToRun.length === 0) {
    if (opts.json) {
      console.log(JSON.stringify({ ok: true, distro, tasks: [], message: 'No applicable tasks to run.' }));
    } else {
      warn('No applicable tasks to run.');
    }
    return;
  }

  // Dry-run mode
  if (opts.dryRun) {
    if (opts.json) {
      console.log(JSON.stringify({
        dryRun: true,
        distro,
        tasks: tasksToRun.map(t => ({ id: t.id, name: stripHtml(t.name), asRoot: t.asRoot })),
      }, null, 2));
    } else {
      info(`\n${c.bold}Dry run — would execute ${tasksToRun.length} task(s) on ${distro}:${c.reset}\n`);
      for (const t of tasksToRun) {
        const root = t.asRoot ? ` ${c.dim}(as root)${c.reset}` : '';
        info(`  ${c.cyan}${t.id.padEnd(22)}${c.reset} ${stripHtml(t.name)}${root}`);
      }
      info('');
    }
    return;
  }

  // Execute tasks
  if (!opts.json) info(`\n${c.bold}Running ${tasksToRun.length} cleanup task(s) on ${distro}${c.reset}\n`);
  const results = [];
  let passed = 0;
  let failed = 0;

  for (const task of tasksToRun) {
    const label = stripHtml(task.name);
    if (!opts.quiet) process.stdout.write(`  ${c.cyan}${task.id.padEnd(22)}${c.reset} ${label} ... `);

    const onOutput = opts.verbose
      ? ({ text }) => process.stdout.write(`${c.dim}${text}${c.reset}`)
      : undefined;

    const result = await wslOps.runCleanupTask({
      distro,
      taskId: task.id,
      command: task.command,
      asRoot: task.asRoot,
      onOutput,
    });

    results.push({ id: task.id, name: label, ...result });

    if (result.ok) {
      passed++;
      if (!opts.quiet) {
        if (opts.verbose) process.stdout.write(`  ${c.cyan}${task.id.padEnd(22)}${c.reset} ${label} ... `);
        console.log(`${c.green}done${c.reset}`);
      }
    } else {
      failed++;
      if (!opts.quiet) {
        if (opts.verbose) process.stdout.write(`  ${c.cyan}${task.id.padEnd(22)}${c.reset} ${label} ... `);
        console.log(`${c.red}failed${c.reset}${result.code ? ` (exit ${result.code})` : ''}`);
      }
    }
  }

  if (opts.json) {
    console.log(JSON.stringify({ ok: failed === 0, distro, passed, failed, results }, null, 2));
  } else if (!opts.quiet) {
    info(`\n${c.bold}Summary:${c.reset} ${c.green}${passed} passed${c.reset}, ${failed > 0 ? c.red : c.dim}${failed} failed${c.reset}\n`);
  }

  if (failed > 0) process.exitCode = 1;
}

// ── Action: scan stale directories ───────────────────────────────────────────

async function actionScanStale(opts) {
  const distro = resolveDistro(opts);

  if (!opts.json) info(`${c.bold}Scanning for stale directories in ${distro} (older than ${opts.days} days)...${c.reset}\n`);

  const results = await wslOps.scanStaleDirs({ distro, days: opts.days });

  if (results.length === 0) {
    if (opts.json) {
      console.log(JSON.stringify({ ok: true, distro, days: opts.days, directories: [] }));
    } else {
      info('  No stale directories found.');
    }
    return;
  }

  if (opts.json) {
    console.log(JSON.stringify({ ok: true, distro, days: opts.days, directories: results }, null, 2));
  } else {
    info(`  ${c.bold}Found ${results.length} stale director${results.length === 1 ? 'y' : 'ies'}:${c.reset}\n`);
    for (const dir of results) {
      info(`  ${c.yellow}${(dir.size || '?').padStart(8)}${c.reset}  ${dir.path}`);
    }
    info(`\n  ${c.dim}Tip: Manually review and delete these, or use the GUI's stale directory cleaner.${c.reset}\n`);
  }
}

// ── Action: compact VHDX ─────────────────────────────────────────────────────

async function actionCompact(opts) {
  if (!opts.json) info(`${c.bold}Finding VHDX virtual disk files...${c.reset}\n`);

  const vhdxFiles = wslOps.findVhdx();
  if (vhdxFiles.length === 0) {
    if (opts.json) {
      console.log(JSON.stringify({ ok: false, error: 'No VHDX files found.' }));
    } else {
      fatal('No ext4.vhdx files found.');
    }
    return;
  }

  if (!opts.quiet) {
    for (const v of vhdxFiles) {
      info(`  ${c.cyan}${formatBytes(v.size).padStart(10)}${c.reset}  ${v.folder}  ${c.dim}${v.path}${c.reset}`);
    }
    info('');
  }

  if (opts.dryRun) {
    if (opts.json) {
      console.log(JSON.stringify({
        dryRun: true,
        vhdxFiles: vhdxFiles.map(v => ({ path: v.path, size: v.size, folder: v.folder })),
      }, null, 2));
    } else {
      info(`${c.dim}Dry run — would shut down WSL and compact ${vhdxFiles.length} VHDX file(s).${c.reset}\n`);
    }
    return;
  }

  // Record before sizes
  const beforeSizes = {};
  for (const v of vhdxFiles) {
    beforeSizes[v.path] = v.size;
  }

  // Step 1: fstrim
  if (opts.distro || !opts.quiet) {
    const distro = opts.distro || resolveDistroSilent();
    if (distro) {
      info(`${c.bold}Running fstrim on ${distro}...${c.reset}`);
      await wslOps.runCleanupTask({
        distro,
        taskId: 'fstrim',
        command: 'fstrim / 2>/dev/null || true',
        asRoot: true,
      });
    }
  }

  // Step 2: Shut down WSL
  info(`${c.bold}Shutting down WSL...${c.reset}`);
  const shutdownResult = await wslOps.runWslCommand({ command: 'wsl --shutdown' });
  if (!shutdownResult.ok) {
    warn('WSL shutdown returned a non-zero exit code.');
  }

  // Brief pause to allow WSL to fully terminate
  await new Promise(r => setTimeout(r, 3000));

  // Step 3: Compact each VHDX
  const results = [];
  for (const v of vhdxFiles) {
    info(`${c.bold}Compacting:${c.reset} ${v.folder} ${c.dim}(${formatBytes(v.size)})${c.reset}`);

    const onOutput = opts.verbose
      ? ({ text }) => process.stdout.write(`${c.dim}${text}${c.reset}`)
      : undefined;

    const result = await wslOps.optimizeVhdx({ vhdxPath: v.path, onOutput });

    // Check after size
    const afterSize = wslOps.getFileSize(v.path);
    const saved = afterSize.ok ? beforeSizes[v.path] - afterSize.size : 0;

    results.push({
      path: v.path,
      folder: v.folder,
      ok: result.ok,
      beforeSize: beforeSizes[v.path],
      afterSize: afterSize.ok ? afterSize.size : null,
      saved: Math.max(0, saved),
      output: result.output,
    });

    if (result.ok) {
      success(`  Compacted! Saved ${formatBytes(Math.max(0, saved))}`);
    } else {
      console.error(`  ${c.red}Failed:${c.reset} ${result.output}`);
    }
  }

  if (opts.json) {
    const totalSaved = results.reduce((sum, r) => sum + (r.saved || 0), 0);
    console.log(JSON.stringify({ ok: results.every(r => r.ok), totalSaved, results }, null, 2));
  } else {
    const totalSaved = results.reduce((sum, r) => sum + (r.saved || 0), 0);
    if (totalSaved > 0) {
      info(`\n${c.bold}Total space reclaimed:${c.reset} ${c.green}${formatBytes(totalSaved)}${c.reset}\n`);
    }
  }

  if (results.some(r => !r.ok)) process.exitCode = 1;
}

/** Try to resolve the default distro without printing messages. */
function resolveDistroSilent() {
  const result = wslOps.checkWsl();
  return result.ok ? result.defaultDistro : null;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv);

  if (opts.version) {
    console.log(pkg.version);
    return;
  }

  if (opts.help || !opts.action) {
    showHelp();
    if (!opts.help && !opts.action) process.exitCode = 1;
    return;
  }

  quietMode = opts.quiet;

  switch (opts.action) {
    case 'list':
      actionList(opts);
      break;
    case 'list-tasks':
      actionListTasks(opts);
      break;
    case 'clean':
      await actionClean(opts);
      break;
    case 'scan-stale':
      await actionScanStale(opts);
      break;
    case 'compact':
      await actionCompact(opts);
      break;
    default:
      fatal(`Unknown action. Run with --help for usage.`);
  }
}

// Export pure helpers for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseArgs, stripHtml, formatBytes };
}

// Run CLI when invoked directly
if (require.main === module) {
  main().catch(err => {
    console.error(`${c.red}error:${c.reset} ${err.message}`);
    process.exit(1);
  });
}
