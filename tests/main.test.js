import { describe, it, expect } from 'vitest';
const { filterNoise, parseWslOutput, isValidExternalUrl, STALE_DIR_NAMES } = require('../lib/utils');

// ── filterNoise ──────────────────────────────────────────────────────────────

describe('filterNoise', () => {
  it('strips "bogus screen size" warnings', () => {
    const input = 'some bogus screen size expect trouble\nreal output here';
    expect(filterNoise(input)).toBe('real output here');
  });

  it('strips multiple bogus lines', () => {
    const input = 'line bogus expect trouble\nok\nanother bogus expect trouble\nfine';
    expect(filterNoise(input)).toBe('ok\nfine');
  });

  it('returns input unchanged when no noise present', () => {
    const input = 'clean output\nno issues';
    expect(filterNoise(input)).toBe('clean output\nno issues');
  });

  it('handles empty string', () => {
    expect(filterNoise('')).toBe('');
  });

  it('handles Windows-style line endings', () => {
    const input = 'bogus expect trouble\r\nreal line';
    expect(filterNoise(input)).toBe('real line');
  });
});

// ── parseWslOutput ───────────────────────────────────────────────────────────

describe('parseWslOutput', () => {
  it('parses typical wsl -l -v output with default distro', () => {
    const output = [
      '  NAME      STATE           VERSION',
      '* Ubuntu    Running         2',
      '  Debian    Stopped         2',
    ].join('\n');

    const result = parseWslOutput(output);
    expect(result.distros).toHaveLength(2);
    expect(result.defaultDistro).toBe('Ubuntu');
    expect(result.distros[0]).toEqual({ name: 'Ubuntu', state: 'Running', isDefault: true });
    expect(result.distros[1]).toEqual({ name: 'Debian', state: 'Stopped', isDefault: false });
  });

  it('skips WSL 1 distros', () => {
    const output = [
      '  NAME      STATE           VERSION',
      '* Ubuntu    Running         2',
      '  Legacy    Stopped         1',
    ].join('\n');

    const result = parseWslOutput(output);
    expect(result.distros).toHaveLength(1);
    expect(result.distros[0].name).toBe('Ubuntu');
  });

  it('skips Docker Desktop distros', () => {
    const output = [
      '  NAME                   STATE           VERSION',
      '* Ubuntu                 Running         2',
      '  docker-desktop         Running         2',
      '  docker-desktop-data    Running         2',
    ].join('\n');

    const result = parseWslOutput(output);
    expect(result.distros).toHaveLength(1);
    expect(result.distros[0].name).toBe('Ubuntu');
  });

  it('returns empty distros for no WSL 2 entries', () => {
    const output = [
      '  NAME      STATE           VERSION',
      '  Legacy    Stopped         1',
    ].join('\n');

    const result = parseWslOutput(output);
    expect(result.distros).toHaveLength(0);
    expect(result.defaultDistro).toBeNull();
  });

  it('falls back to first distro when no default is marked', () => {
    const output = [
      '  NAME      STATE           VERSION',
      '  Ubuntu    Running         2',
      '  Debian    Stopped         2',
    ].join('\n');

    const result = parseWslOutput(output);
    expect(result.defaultDistro).toBe('Ubuntu');
  });

  it('handles output with only a header line', () => {
    const output = '  NAME      STATE           VERSION';
    const result = parseWslOutput(output);
    expect(result.distros).toHaveLength(0);
  });
});

// ── isValidExternalUrl ───────────────────────────────────────────────────────

describe('isValidExternalUrl', () => {
  it('accepts https URLs', () => {
    expect(isValidExternalUrl('https://github.com')).toBe(true);
  });

  it('accepts http URLs', () => {
    expect(isValidExternalUrl('http://example.com')).toBe(true);
  });

  it('rejects file:// URLs', () => {
    expect(isValidExternalUrl('file:///etc/passwd')).toBe(false);
  });

  it('rejects javascript: URLs', () => {
    expect(isValidExternalUrl('javascript:alert(1)')).toBe(false);
  });

  it('rejects non-string inputs', () => {
    expect(isValidExternalUrl(null)).toBe(false);
    expect(isValidExternalUrl(undefined)).toBe(false);
    expect(isValidExternalUrl(42)).toBe(false);
    expect(isValidExternalUrl({})).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidExternalUrl('')).toBe(false);
  });
});

// ── STALE_DIR_NAMES ──────────────────────────────────────────────────────────

describe('STALE_DIR_NAMES', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(STALE_DIR_NAMES)).toBe(true);
    expect(STALE_DIR_NAMES.length).toBeGreaterThan(0);
  });

  it('contains expected common entries', () => {
    const expected = ['node_modules', 'vendor', '__pycache__', '.next', 'dist', '.venv', 'venv'];
    for (const name of expected) {
      expect(STALE_DIR_NAMES).toContain(name);
    }
  });

  it('contains only strings', () => {
    for (const name of STALE_DIR_NAMES) {
      expect(typeof name).toBe('string');
    }
  });

  it('has no duplicates', () => {
    const unique = new Set(STALE_DIR_NAMES);
    expect(unique.size).toBe(STALE_DIR_NAMES.length);
  });
});
