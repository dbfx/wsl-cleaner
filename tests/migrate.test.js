import { describe, it, expect } from 'vitest';

const wslOps = require('../lib/wsl-ops');

// ── Migration function exports ───────────────────────────────────────────────

describe('migration exports', () => {
  it('exports getDefaultUser as a function', () => {
    expect(typeof wslOps.getDefaultUser).toBe('function');
  });

  it('exports getDriveSpace as a function', () => {
    expect(typeof wslOps.getDriveSpace).toBe('function');
  });

  it('exports unregisterDistro as a function', () => {
    expect(typeof wslOps.unregisterDistro).toBe('function');
  });

  it('exports setDefaultUser as a function', () => {
    expect(typeof wslOps.setDefaultUser).toBe('function');
  });

  it('exports migrateDistro as a function', () => {
    expect(typeof wslOps.migrateDistro).toBe('function');
  });
});

// ── getDefaultUser ───────────────────────────────────────────────────────────

describe('getDefaultUser', () => {
  it('returns a Promise', () => {
    const result = wslOps.getDefaultUser('__nonexistent_test_distro__');
    expect(result).toBeInstanceOf(Promise);
    result.catch(() => {});
  });

  it('resolves with { ok, ... } shape', async () => {
    const result = await wslOps.getDefaultUser('__nonexistent_test_distro__');
    expect(result).toHaveProperty('ok');
    expect(typeof result.ok).toBe('boolean');
  });
});

// ── getDriveSpace ────────────────────────────────────────────────────────────

describe('getDriveSpace', () => {
  it('returns a Promise', () => {
    const result = wslOps.getDriveSpace('C:\\');
    expect(result).toBeInstanceOf(Promise);
    result.catch(() => {});
  });

  it('rejects invalid drive path', async () => {
    const result = await wslOps.getDriveSpace('/invalid/path');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Invalid drive path');
  });

  it('accepts valid drive path', async () => {
    const result = await wslOps.getDriveSpace('C:\\Users');
    expect(result).toHaveProperty('ok');
    // May succeed or fail depending on environment, but should have the shape
    if (result.ok) {
      expect(typeof result.freeBytes).toBe('number');
      expect(result.freeBytes).toBeGreaterThanOrEqual(0);
    }
  });
});

// ── unregisterDistro ─────────────────────────────────────────────────────────

describe('unregisterDistro', () => {
  it('returns a Promise', () => {
    const result = wslOps.unregisterDistro({
      distro: '__nonexistent_test_distro__',
    });
    expect(result).toBeInstanceOf(Promise);
    result.catch(() => {});
  });

  it('resolves with { ok, output, code } shape', async () => {
    const result = await wslOps.unregisterDistro({
      distro: '__nonexistent_test_distro__',
    });
    expect(result).toHaveProperty('ok');
    expect(result).toHaveProperty('output');
    expect(result).toHaveProperty('code');
  });
});

// ── setDefaultUser ───────────────────────────────────────────────────────────

describe('setDefaultUser', () => {
  it('returns a Promise', () => {
    const result = wslOps.setDefaultUser('__nonexistent_test_distro__', 'testuser');
    expect(result).toBeInstanceOf(Promise);
    result.catch(() => {});
  });
});

// ── migrateDistro ────────────────────────────────────────────────────────────

describe('migrateDistro', () => {
  it('returns a Promise', () => {
    const result = wslOps.migrateDistro({
      distro: '__nonexistent_test_distro__',
      destinationPath: 'C:\\__test_migrate__',
      defaultUser: 'testuser',
      keepBackup: false,
    });
    expect(result).toBeInstanceOf(Promise);
    result.catch(() => {});
  });

  it('resolves with { ok, output, ... } shape', async () => {
    const result = await wslOps.migrateDistro({
      distro: '__nonexistent_test_distro__',
      destinationPath: 'C:\\__test_migrate__',
      defaultUser: 'testuser',
      keepBackup: false,
    });
    expect(result).toHaveProperty('ok');
    expect(result).toHaveProperty('output');
    // Migration of nonexistent distro should fail at export step
    expect(result.ok).toBe(false);
  });
});
