import { describe, it, expect, beforeEach, afterEach } from 'vitest';
const fs = require('fs');
const path = require('path');
const os = require('os');
const preferences = require('../lib/preferences');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wsl-cleaner-prefs-'));
  preferences.init(tmpDir);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── loadPreferences / savePreferences ────────────────────────────────────────

describe('loadPreferences', () => {
  it('returns empty object when no preferences file exists', () => {
    expect(preferences.loadPreferences()).toEqual({});
  });

  it('returns empty object when file contains invalid JSON', () => {
    fs.writeFileSync(path.join(tmpDir, 'task-preferences.json'), '{bad', 'utf8');
    expect(preferences.loadPreferences()).toEqual({});
  });

  it('returns empty object when file contains an array', () => {
    fs.writeFileSync(path.join(tmpDir, 'task-preferences.json'), '[1,2,3]', 'utf8');
    expect(preferences.loadPreferences()).toEqual({});
  });

  it('returns empty object when file contains a primitive', () => {
    fs.writeFileSync(path.join(tmpDir, 'task-preferences.json'), '"hello"', 'utf8');
    expect(preferences.loadPreferences()).toEqual({});
  });
});

describe('savePreferences', () => {
  it('round-trips task preferences', () => {
    const prefs = { 'apt-clean': true, 'docker-prune': false, 'tmp': true };
    preferences.savePreferences(prefs);
    expect(preferences.loadPreferences()).toEqual(prefs);
  });

  it('overwrites previous preferences', () => {
    preferences.savePreferences({ a: true });
    preferences.savePreferences({ b: false });
    expect(preferences.loadPreferences()).toEqual({ b: false });
  });

  it('cleans up temp file after atomic write', () => {
    preferences.savePreferences({ a: true });
    const tmpFile = path.join(tmpDir, 'task-preferences.json.tmp');
    expect(fs.existsSync(tmpFile)).toBe(false);
  });
});

// ── getLocale / setLocale ────────────────────────────────────────────────────

describe('getLocale', () => {
  it('returns "en" by default when no locale file exists', () => {
    expect(preferences.getLocale()).toBe('en');
  });

  it('returns "en" when locale file contains invalid JSON', () => {
    fs.writeFileSync(path.join(tmpDir, 'locale-preference.json'), 'nope', 'utf8');
    expect(preferences.getLocale()).toBe('en');
  });

  it('returns "en" when locale field is missing', () => {
    fs.writeFileSync(path.join(tmpDir, 'locale-preference.json'), '{}', 'utf8');
    expect(preferences.getLocale()).toBe('en');
  });

  it('returns "en" when locale field is not a string', () => {
    fs.writeFileSync(path.join(tmpDir, 'locale-preference.json'), '{"locale":42}', 'utf8');
    expect(preferences.getLocale()).toBe('en');
  });
});

describe('setLocale', () => {
  it('persists and retrieves locale code', () => {
    preferences.setLocale('fr');
    expect(preferences.getLocale()).toBe('fr');
  });

  it('can switch locale multiple times', () => {
    preferences.setLocale('de');
    expect(preferences.getLocale()).toBe('de');

    preferences.setLocale('zh');
    expect(preferences.getLocale()).toBe('zh');

    preferences.setLocale('en');
    expect(preferences.getLocale()).toBe('en');
  });

  it('cleans up temp file after atomic write', () => {
    preferences.setLocale('es');
    const tmpFile = path.join(tmpDir, 'locale-preference.json.tmp');
    expect(fs.existsSync(tmpFile)).toBe(false);
  });

  it('writes valid JSON to disk', () => {
    preferences.setLocale('pt');
    const raw = fs.readFileSync(path.join(tmpDir, 'locale-preference.json'), 'utf8');
    expect(JSON.parse(raw)).toEqual({ locale: 'pt' });
  });
});
