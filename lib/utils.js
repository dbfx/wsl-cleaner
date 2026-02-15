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

/**
 * Map common raw error messages to user-friendly, actionable messages.
 * Falls back to the original message if no pattern matches.
 */
function friendlyError(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return 'An unknown error occurred.';

  const msg = raw.trim();

  // Order matters — more specific patterns first

  if (/Optimize-VHD/i.test(msg) && /not recognized|not found|is not available/i.test(msg)) {
    return 'Optimize-VHD is not available. Enable the Hyper-V PowerShell module via Windows Features.';
  }

  if (/spawn.*wsl.*ENOENT|ENOENT.*wsl/i.test(msg)) {
    return 'WSL is not installed or not in your system PATH. Install it with "wsl --install" from an elevated terminal.';
  }

  if (/The Windows Subsystem for Linux.*not installed|WSL.*not installed/i.test(msg)) {
    return 'WSL is not installed. Run "wsl --install" from an elevated terminal.';
  }

  if (/There is no distribution|distribution.*not found|cannot find.*distribution/i.test(msg)) {
    return 'The selected WSL distribution was not found. It may have been renamed or removed.';
  }

  if (/0x80370102|virtualization.*disabled|enable.*virtualization/i.test(msg)) {
    return 'Hardware virtualization is disabled. Enable VT-x/AMD-V in your BIOS settings.';
  }

  if (/virtual machine could not be started|Hyper-V.*not.*enabled|enable.*Hyper-V/i.test(msg)) {
    return 'Hyper-V is not enabled. Enable it in Windows Features and reboot.';
  }

  if (/Access is denied|EACCES|EPERM|permission denied/i.test(msg)) {
    return 'Permission denied. Try running the app as Administrator, or check that no other program is using the file.';
  }

  if (/not recognized as.*cmdlet|is not recognized/i.test(msg)) {
    return 'Required command not found. Make sure the necessary tools and PowerShell modules are installed.';
  }

  if (/ETIMEDOUT|timed? ?out|network.*error/i.test(msg)) {
    return 'A network operation timed out. Check your internet connection and try again.';
  }

  return msg;
}

/**
 * Map a Linux exit code to a short human-readable hint.
 */
function exitCodeHint(code) {
  switch (code) {
    case 1:   return 'general error';
    case 2:   return 'misuse of shell command';
    case 126:  return 'permission denied or not executable';
    case 127:  return 'command not found';
    case 130:  return 'interrupted (Ctrl+C)';
    case 137:  return 'killed (out of memory?)';
    case 139:  return 'segmentation fault';
    case 143:  return 'terminated';
    default:  return null;
  }
}

module.exports = {
  filterNoise,
  parseWslOutput,
  isValidExternalUrl,
  STALE_DIR_NAMES,
  friendlyError,
  exitCodeHint,
};
