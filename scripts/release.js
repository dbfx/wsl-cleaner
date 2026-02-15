#!/usr/bin/env node

/**
 * Interactive release script for WSL Cleaner.
 *
 * Usage:  node scripts/release.js
 *    or:  npm run release
 *
 * What it does:
 *   1. Shows current version and lets you pick the bump type (patch/minor/major) or enter a custom version
 *   2. Runs tests to make sure nothing is broken
 *   3. Updates version in package.json
 *   4. Updates CHANGELOG.md via conventional-changelog
 *   5. Commits the version bump
 *   6. Creates a git tag
 *   7. Optionally pushes to origin (which triggers the GitHub Actions release workflow)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT = path.resolve(__dirname, '..');
const PKG_PATH = path.join(ROOT, 'package.json');

// ── Helpers ──────────────────────────────────────────────────────────────────

function run(cmd, opts = {}) {
  console.log(`\n  > ${cmd}`);
  return execSync(cmd, { cwd: ROOT, stdio: 'inherit', ...opts });
}

function runQuiet(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8' }).trim();
}

function readPkg() {
  return JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
}

function writePkg(pkg) {
  fs.writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function bumpVersion(current, type) {
  const [major, minor, patch] = current.split('.').map(Number);
  switch (type) {
    case 'patch': return `${major}.${minor}.${patch + 1}`;
    case 'minor': return `${major}.${minor + 1}.0`;
    case 'major': return `${major + 1}.0.0`;
    default: return null;
  }
}

function isValidSemver(v) {
  return /^\d+\.\d+\.\d+$/.test(v);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║       WSL Cleaner — New Release       ║');
  console.log('╚══════════════════════════════════════╝\n');

  // Check for clean working tree
  try {
    const status = runQuiet('git status --porcelain');
    if (status) {
      console.log('  Warning: You have uncommitted changes:\n');
      console.log(status.split('\n').map(l => `    ${l}`).join('\n'));
      const proceed = await ask('\n  Continue anyway? (y/N) ');
      if (proceed.toLowerCase() !== 'y') {
        console.log('\n  Aborted. Commit or stash your changes first.\n');
        process.exit(0);
      }
    }
  } catch {
    // Not a git repo or git not available — continue anyway
  }

  const pkg = readPkg();
  const current = pkg.version;

  const patchV = bumpVersion(current, 'patch');
  const minorV = bumpVersion(current, 'minor');
  const majorV = bumpVersion(current, 'major');

  console.log(`  Current version: ${current}\n`);
  console.log('  Pick a version bump:\n');
  console.log(`    1) patch  → ${patchV}`);
  console.log(`    2) minor  → ${minorV}`);
  console.log(`    3) major  → ${majorV}`);
  console.log('    4) custom');
  console.log('    0) cancel\n');

  const choice = await ask('  Your choice (1/2/3/4/0): ');

  let newVersion;
  switch (choice) {
    case '1': newVersion = patchV; break;
    case '2': newVersion = minorV; break;
    case '3': newVersion = majorV; break;
    case '4':
      newVersion = await ask(`  Enter version (e.g. 2.0.0): `);
      if (!isValidSemver(newVersion)) {
        console.log(`\n  "${newVersion}" is not a valid semver version. Aborted.\n`);
        process.exit(1);
      }
      break;
    default:
      console.log('\n  Release cancelled.\n');
      process.exit(0);
  }

  console.log(`\n  Bumping ${current} → ${newVersion}\n`);

  // Step 1: Run tests
  console.log('── Step 1/6: Running tests ─────────────────────────');
  try {
    run('npm test');
  } catch {
    console.log('\n  Tests failed. Fix them before releasing.\n');
    process.exit(1);
  }

  // Step 2: Update package.json version
  console.log('\n── Step 2/6: Updating package.json ─────────────────');
  pkg.version = newVersion;
  writePkg(pkg);
  console.log(`  Updated package.json version to ${newVersion}`);

  // Step 3: Update changelog
  console.log('\n── Step 3/6: Updating CHANGELOG.md ─────────────────');
  try {
    run('npm run changelog');
    console.log('  CHANGELOG.md updated.');
  } catch {
    console.log('  Warning: changelog generation failed (continuing anyway).');
  }

  // Step 4: Commit
  console.log('\n── Step 4/6: Committing changes ────────────────────');
  run('git add package.json CHANGELOG.md');
  run(`git commit -m "chore: release v${newVersion}"`);

  // Step 5: Tag
  console.log('\n── Step 5/6: Creating git tag ──────────────────────');
  run(`git tag v${newVersion}`);
  console.log(`  Tagged v${newVersion}`);

  // Step 6: Push
  console.log('\n── Step 6/6: Push to origin ────────────────────────');
  const doPush = await ask('  Push commit and tag to origin? This will trigger the release build. (Y/n) ');

  if (doPush.toLowerCase() !== 'n') {
    run('git push');
    run('git push --tags');
    console.log('\n  ✓ Pushed! GitHub Actions will now build and publish the release.');
    console.log(`  Watch progress at: https://github.com/dbfx/wsl-cleaner/actions\n`);
  } else {
    console.log('\n  Skipped push. When you\'re ready, run:');
    console.log(`    git push && git push --tags\n`);
  }

  console.log(`  ✓ Release v${newVersion} prepared successfully.\n`);
}

main().catch((err) => {
  console.error('\n  Release failed:', err.message, '\n');
  process.exit(1);
});
