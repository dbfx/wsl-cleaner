const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let dbPath = null;

/**
 * Initialise the database path. Must be called once with the app's userData directory.
 */
function init(userDataDir) {
  dbPath = path.join(userDataDir, 'cleanup-history.json');
}

/**
 * Read the history array from disk. Returns [] on any error.
 */
function loadHistory() {
  if (!dbPath) return [];
  try {
    const raw = fs.readFileSync(dbPath, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/**
 * Persist the full history array to disk (atomic write via temp file).
 */
function writeHistory(records) {
  if (!dbPath) return;
  const tmp = dbPath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(records, null, 2), 'utf8');
  fs.renameSync(tmp, dbPath);
}

/**
 * Append a new cleanup session record and persist.
 * Automatically adds `id` and `timestamp` if missing.
 */
function saveSession(record) {
  const history = loadHistory();
  const entry = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    ...record,
  };
  history.push(entry);
  writeHistory(history);
  return entry;
}

/**
 * Remove all history and delete the file.
 */
function clearHistory() {
  writeHistory([]);
}

module.exports = { init, loadHistory, saveSession, clearHistory };
