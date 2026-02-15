const fs = require('fs');
const path = require('path');

let prefsPath = null;
let localePath = null;

/**
 * Initialise the preferences path. Must be called once with the app's userData directory.
 */
function init(userDataDir) {
  prefsPath = path.join(userDataDir, 'task-preferences.json');
  localePath = path.join(userDataDir, 'locale-preference.json');
}

/**
 * Read saved task preferences from disk. Returns {} on any error.
 */
function loadPreferences() {
  if (!prefsPath) return {};
  try {
    const raw = fs.readFileSync(prefsPath, 'utf8');
    const data = JSON.parse(raw);
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

/**
 * Persist task preferences to disk (atomic write via temp file).
 * @param {Record<string, boolean>} prefs - Map of task id to enabled/disabled state.
 */
function savePreferences(prefs) {
  if (!prefsPath) return;
  const tmp = prefsPath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(prefs, null, 2), 'utf8');
  fs.renameSync(tmp, prefsPath);
}

/**
 * Get the saved locale code. Returns 'en' by default.
 * @returns {string}
 */
function getLocale() {
  if (!localePath) return 'en';
  try {
    const raw = fs.readFileSync(localePath, 'utf8');
    const data = JSON.parse(raw);
    return (data && typeof data.locale === 'string') ? data.locale : 'en';
  } catch {
    return 'en';
  }
}

/**
 * Save the locale preference to disk.
 * @param {string} code - Locale code (e.g. "fr")
 */
function setLocale(code) {
  if (!localePath) return;
  const tmp = localePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ locale: code }, null, 2), 'utf8');
  fs.renameSync(tmp, localePath);
}

module.exports = { init, loadPreferences, savePreferences, getLocale, setLocale };
