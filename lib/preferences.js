const fs = require('fs');
const path = require('path');

let prefsPath = null;

/**
 * Initialise the preferences path. Must be called once with the app's userData directory.
 */
function init(userDataDir) {
  prefsPath = path.join(userDataDir, 'task-preferences.json');
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

module.exports = { init, loadPreferences, savePreferences };
