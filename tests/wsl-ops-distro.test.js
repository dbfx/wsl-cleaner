import { describe, it, expect } from 'vitest';

// ── Load module under test ────────────────────────────────────────────────────

const wslOps = require('../lib/wsl-ops');

// ── Function exports ──────────────────────────────────────────────────────────

describe('distro management exports', () => {
  it('exports exportDistro as a function', () => {
    expect(typeof wslOps.exportDistro).toBe('function');
  });

  it('exports importDistro as a function', () => {
    expect(typeof wslOps.importDistro).toBe('function');
  });

  it('exports cloneDistro as a function', () => {
    expect(typeof wslOps.cloneDistro).toBe('function');
  });

  it('exports restartDistro as a function', () => {
    expect(typeof wslOps.restartDistro).toBe('function');
  });

  it('exports getDistroComparison as a function', () => {
    expect(typeof wslOps.getDistroComparison).toBe('function');
  });

  it('does not break existing exports', () => {
    const expectedExports = [
      'wslEnv', 'checkWsl', 'detectTools', 'runCleanupTask',
      'findVhdx', 'getFileSize', 'runWslCommand',
      'scanStaleDirs', 'deleteStaleDirs', 'optimizeVhdx',
      'estimateTaskSizes', 'scanDiskUsage', 'cancelDiskScan', 'getHealthInfo',
      'exportDistro', 'importDistro', 'cloneDistro', 'restartDistro', 'getDistroComparison',
    ];
    for (const name of expectedExports) {
      expect(wslOps).toHaveProperty(name);
    }
  });
});

// ── getDistroComparison (empty input) ─────────────────────────────────────────

describe('getDistroComparison', () => {
  it('returns empty array for empty distro list', async () => {
    const results = await wslOps.getDistroComparison([]);
    expect(results).toEqual([]);
  });

  it('returns a Promise', () => {
    const result = wslOps.getDistroComparison([]);
    expect(result).toBeInstanceOf(Promise);
  });
});

// ── exportDistro returns a Promise ────────────────────────────────────────────

describe('exportDistro', () => {
  it('returns a Promise', () => {
    // Call with a fake path — it will fail, but it should return a Promise
    const result = wslOps.exportDistro({
      distro: '__nonexistent_test_distro__',
      targetPath: '__nonexistent_path__.tar',
    });
    expect(result).toBeInstanceOf(Promise);
    // Ignore the result (will be an error since distro doesn't exist)
    result.catch(() => {});
  });
});

// ── importDistro returns a Promise ────────────────────────────────────────────

describe('importDistro', () => {
  it('returns a Promise', () => {
    const result = wslOps.importDistro({
      name: '__test__',
      installLocation: '__nonexistent__',
      tarPath: '__nonexistent__.tar',
    });
    expect(result).toBeInstanceOf(Promise);
    result.catch(() => {});
  });
});

// ── restartDistro returns a Promise ───────────────────────────────────────────

describe('restartDistro', () => {
  it('returns a Promise', () => {
    const result = wslOps.restartDistro({
      distro: '__nonexistent_test_distro__',
    });
    expect(result).toBeInstanceOf(Promise);
    result.catch(() => {});
  });
});

// ── cloneDistro returns a Promise ─────────────────────────────────────────────

describe('cloneDistro', () => {
  it('returns a Promise', () => {
    const result = wslOps.cloneDistro({
      distro: '__nonexistent_test_distro__',
      newName: '__clone__',
      installLocation: '__nonexistent__',
    });
    expect(result).toBeInstanceOf(Promise);
    result.catch(() => {});
  });
});
