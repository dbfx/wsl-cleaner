// ── Pure utility functions (extracted from main.js for testability) ───────────

/**
 * Strip "bogus screen size" warnings from WSL output.
 */
function filterNoise(text) {
  return text.replace(/^.*bogus.*expect trouble\r?\n?/gm, '');
}

/**
 * Parse `wsl -l -v` output and return structured distro info.
 * Returns { distros, defaultDistro } or throws on parse failure.
 */
function parseWslOutput(output) {
  const lines = output.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const distros = [];
  let defaultDistro = null;

  for (const line of lines) {
    // Skip the header line
    if (line.startsWith('NAME') || line.includes('NAME')) continue;
    // Lines look like: "* Ubuntu    Running    2" or "  Debian   Stopped   2"
    const isDefault = line.startsWith('*');
    const cleaned = line.replace(/^\*\s*/, '').trim();
    // Split on multiple spaces
    const parts = cleaned.split(/\s{2,}/);
    if (parts.length >= 3) {
      const name = parts[0].trim();
      const state = parts[1].trim();
      const version = parts[2].trim();
      if (version === '2') {
        // Skip Docker Desktop internal distros
        if (name.toLowerCase().includes('docker-desktop')) continue;
        distros.push({ name, state, isDefault });
        if (isDefault) defaultDistro = name;
      }
    }
  }

  if (!defaultDistro && distros.length > 0) {
    defaultDistro = distros[0].name;
  }

  return { distros, defaultDistro };
}

/**
 * Validate a URL for the open-external handler.
 * Only http/https URLs are allowed.
 */
function isValidExternalUrl(url) {
  return typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'));
}

/**
 * Directory names to scan for stale dependencies/build artifacts.
 */
const STALE_DIR_NAMES = [
  'node_modules', 'vendor', '__pycache__', '.next', '.nuxt', '.turbo', '.yarn',
  'target', '.gradle', '.tox', '.pytest_cache', '.mypy_cache', 'dist',
  '.parcel-cache', '.cache', '.venv', 'venv', 'elm-stuff',
  '.terraform', '.serverless', '.nx',
];

module.exports = {
  filterNoise,
  parseWslOutput,
  isValidExternalUrl,
  STALE_DIR_NAMES,
};
