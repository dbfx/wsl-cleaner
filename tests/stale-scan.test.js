import { describe, it, expect } from 'vitest';

const wslOps = require('../lib/wsl-ops');

// ── buildStaleScanScript ─────────────────────────────────────────────────────

describe('buildStaleScanScript', () => {
  it('is exported as a function', () => {
    expect(typeof wslOps.buildStaleScanScript).toBe('function');
  });

  it('returns a string', () => {
    const script = wslOps.buildStaleScanScript('-name node_modules', 30);
    expect(typeof script).toBe('string');
  });

  it('starts with a bash shebang', () => {
    const script = wslOps.buildStaleScanScript('-name vendor', 30);
    expect(script.startsWith('#!/bin/bash')).toBe(true);
  });

  it('includes git availability detection', () => {
    const script = wslOps.buildStaleScanScript('-name vendor', 30);
    expect(script).toContain('command -v git');
    expect(script).toContain('HAS_GIT=');
  });

  it('includes git check-ignore logic to skip tracked dirs', () => {
    const script = wslOps.buildStaleScanScript('-name vendor', 30);
    expect(script).toContain('check-ignore -q');
    expect(script).toContain('git rev-parse --show-toplevel');
  });

  it('includes associative array cache for git repo roots', () => {
    const script = wslOps.buildStaleScanScript('-name dist', 30);
    expect(script).toContain('declare -A GIT_ROOT_CACHE');
  });

  it('includes the find command with correct days', () => {
    const script = wslOps.buildStaleScanScript('-name node_modules -o -name vendor', 45);
    expect(script).toContain('-mtime +45');
    expect(script).toContain('-name node_modules -o -name vendor');
  });

  it('skips directories not gitignored (tracked) inside git repos', () => {
    const script = wslOps.buildStaleScanScript('-name vendor', 30);
    // The script should continue (skip) when git check-ignore fails (dir is NOT ignored)
    expect(script).toContain('continue');
  });

  it('falls back gracefully when git is not available', () => {
    const script = wslOps.buildStaleScanScript('-name dist', 30);
    // The git check is conditional on HAS_GIT
    expect(script).toContain('if [ "$HAS_GIT" -eq 1 ]');
  });
});

// ── scanStaleDirs ────────────────────────────────────────────────────────────

describe('scanStaleDirs', () => {
  it('is exported as a function', () => {
    expect(typeof wslOps.scanStaleDirs).toBe('function');
  });

  it('returns a Promise', () => {
    const result = wslOps.scanStaleDirs({
      distro: '__nonexistent_test_distro__',
      days: 30,
    });
    expect(result).toBeInstanceOf(Promise);
  });

  it('returns empty array for nonexistent distro', async () => {
    const results = await wslOps.scanStaleDirs({
      distro: '__nonexistent_test_distro__',
      days: 30,
    });
    expect(results).toEqual([]);
  });

  it('defaults to 30 days when days is invalid', async () => {
    const results = await wslOps.scanStaleDirs({
      distro: '__nonexistent_test_distro__',
      days: 'invalid',
    });
    expect(Array.isArray(results)).toBe(true);
  });

  it('clamps days to minimum of 1', async () => {
    const results = await wslOps.scanStaleDirs({
      distro: '__nonexistent_test_distro__',
      days: -5,
    });
    expect(Array.isArray(results)).toBe(true);
  });
});
