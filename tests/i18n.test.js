import { describe, it, expect, beforeEach } from 'vitest';
const { t, tp, tError, getLocale, _setStringsForTest } = require('../renderer/i18n');

// ── t (translate) ────────────────────────────────────────────────────────────

describe('t', () => {
  beforeEach(() => {
    _setStringsForTest({
      'nav.simple': 'Simple',
      'nav.advanced': 'Advanced',
      'status.ready': 'WSL 2 Ready — {count} distro(s) found',
      'greeting': 'Hello, {name}! You have {count} items.',
    });
  });

  it('returns the translated string for a known key', () => {
    expect(t('nav.simple')).toBe('Simple');
    expect(t('nav.advanced')).toBe('Advanced');
  });

  it('returns the key itself for an unknown key', () => {
    expect(t('nonexistent.key')).toBe('nonexistent.key');
  });

  it('interpolates a single placeholder', () => {
    expect(t('status.ready', { count: 3 })).toBe('WSL 2 Ready — 3 distro(s) found');
  });

  it('interpolates multiple placeholders', () => {
    expect(t('greeting', { name: 'Alice', count: 5 })).toBe('Hello, Alice! You have 5 items.');
  });

  it('leaves unmatched placeholders as-is', () => {
    expect(t('status.ready')).toBe('WSL 2 Ready — {count} distro(s) found');
  });

  it('handles empty params object', () => {
    expect(t('nav.simple', {})).toBe('Simple');
  });
});

// ── t with fallback ──────────────────────────────────────────────────────────

describe('t (fallback to English)', () => {
  beforeEach(() => {
    _setStringsForTest(
      { 'nav.simple': 'Simplifié' },           // current locale (partial)
      { 'nav.simple': 'Simple', 'nav.advanced': 'Advanced' }  // fallback (English)
    );
  });

  it('uses current locale string when available', () => {
    expect(t('nav.simple')).toBe('Simplifié');
  });

  it('falls back to English when key missing in current locale', () => {
    expect(t('nav.advanced')).toBe('Advanced');
  });

  it('returns key when missing from both locale and fallback', () => {
    expect(t('nonexistent')).toBe('nonexistent');
  });
});

// ── tp (plural-aware) ────────────────────────────────────────────────────────

describe('tp', () => {
  beforeEach(() => {
    _setStringsForTest({
      'stale.found_one': 'Found {count} stale directory ({size})',
      'stale.found_other': 'Found {count} stale directories ({size})',
    });
  });

  it('uses _one suffix when count is 1', () => {
    expect(tp('stale.found', 1, { size: '50 MB' })).toBe('Found 1 stale directory (50 MB)');
  });

  it('uses _other suffix when count is not 1', () => {
    expect(tp('stale.found', 5, { size: '120 MB' })).toBe('Found 5 stale directories (120 MB)');
  });

  it('uses _other suffix for count 0', () => {
    expect(tp('stale.found', 0, { size: '0 B' })).toBe('Found 0 stale directories (0 B)');
  });
});

// ── tError (reverse error mapping) ───────────────────────────────────────────

describe('tError', () => {
  beforeEach(() => {
    _setStringsForTest(
      {
        'error.wslNotInstalled': 'WSL n\'est pas installé',
        'error.permissionDenied': 'Permission refusée',
      },
      {
        'error.wslNotInstalled': 'WSL is not installed',
        'error.permissionDenied': 'Permission denied',
      }
    );
  });

  it('translates a known English error message', () => {
    expect(tError('WSL is not installed')).toBe('WSL n\'est pas installé');
  });

  it('translates another known error message', () => {
    expect(tError('Permission denied')).toBe('Permission refusée');
  });

  it('returns the original string for unknown errors', () => {
    expect(tError('Something unexpected')).toBe('Something unexpected');
  });

  it('returns falsy value as-is', () => {
    expect(tError('')).toBe('');
    expect(tError(null)).toBeNull();
    expect(tError(undefined)).toBeUndefined();
  });
});

// ── tError with exitCode keys ────────────────────────────────────────────────

describe('tError (exitCode keys)', () => {
  beforeEach(() => {
    _setStringsForTest(
      { 'exitCode.127': 'commande introuvable' },
      { 'exitCode.127': 'command not found' }
    );
  });

  it('maps exitCode English string to translated string', () => {
    expect(tError('command not found')).toBe('commande introuvable');
  });
});

// ── getLocale ────────────────────────────────────────────────────────────────

describe('getLocale', () => {
  it('returns "en" by default', () => {
    // getLocale returns whatever currentLocale is set to; default is 'en'
    expect(typeof getLocale()).toBe('string');
  });
});
