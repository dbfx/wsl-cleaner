// ── Lightweight i18n module for WSL Cleaner ──────────────────────────────────

let currentStrings = {};
let fallbackStrings = {};
let currentLocale = 'en';
let errorReverseMap = {};

/**
 * Translate a key, with optional placeholder interpolation.
 * Falls back to the English string, then to the key itself.
 * @param {string} key - The i18n key (e.g. "nav.simple")
 * @param {Object} [params] - Placeholder values (e.g. { count: 5 })
 * @returns {string}
 */
function t(key, params) {
  let str = currentStrings[key] || fallbackStrings[key] || key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.replaceAll('{' + k + '}', v);
    }
  }
  return str;
}

/**
 * Plural-aware translation.  Uses _one / _other suffix convention.
 * @param {string} key - Base key without suffix (e.g. "stale.found")
 * @param {number} count
 * @param {Object} [params] - Additional placeholders
 * @returns {string}
 */
function tp(key, count, params) {
  const suffix = count === 1 ? '_one' : '_other';
  return t(key + suffix, { count, ...params });
}

/**
 * Translate an error string returned by the backend.
 * Looks up the English string in a reverse map to find the i18n key,
 * then translates it.  Falls back to the original string if not found.
 * @param {string} englishMessage
 * @returns {string}
 */
function tError(englishMessage) {
  if (!englishMessage) return englishMessage;
  const key = errorReverseMap[englishMessage];
  return key ? t(key) : englishMessage;
}

/**
 * Build a reverse map from English error/exitCode strings to i18n keys.
 * Called after loading locale data.
 */
function buildErrorReverseMap() {
  errorReverseMap = {};
  const prefixes = ['error.', 'exitCode.'];
  for (const key of Object.keys(fallbackStrings)) {
    if (prefixes.some(p => key.startsWith(p))) {
      errorReverseMap[fallbackStrings[key]] = key;
    }
  }
}

/**
 * Apply translations to all DOM elements with data-i18n* attributes.
 */
function applyI18n(root) {
  const scope = root || document;
  scope.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  scope.querySelectorAll('[data-i18n-html]').forEach(el => {
    el.innerHTML = t(el.dataset.i18nHtml);
  });
  scope.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  scope.querySelectorAll('[data-i18n-aria]').forEach(el => {
    el.setAttribute('aria-label', t(el.dataset.i18nAria));
  });
  scope.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.title = t(el.dataset.i18nTitle);
  });
}

/**
 * Load locale data from the main process via IPC.
 * @param {string} [code='en'] - Locale code
 */
async function loadLocale(code) {
  currentLocale = code || 'en';
  try {
    if (currentLocale !== 'en') {
      const [localeData, enData] = await Promise.all([
        window.wslCleaner.getLocaleData(currentLocale),
        window.wslCleaner.getLocaleData('en'),
      ]);
      currentStrings = localeData || {};
      fallbackStrings = enData || {};
    } else {
      const enData = await window.wslCleaner.getLocaleData('en');
      currentStrings = enData || {};
      fallbackStrings = currentStrings;
    }
  } catch (err) {
    console.warn('Failed to load locale data:', err);
    currentStrings = {};
    fallbackStrings = {};
  }
  buildErrorReverseMap();
}

/**
 * Switch locale at runtime: reload strings, re-apply DOM, save preference.
 * Dispatches a "locale-changed" event for dynamic content re-renders.
 * @param {string} code - Locale code (e.g. "fr")
 */
async function setLocale(code) {
  await loadLocale(code);
  applyI18n();
  try {
    await window.wslCleaner.saveLocalePreference(code);
  } catch { /* ignore save errors */ }
  document.dispatchEvent(new CustomEvent('locale-changed', { detail: { locale: code } }));
}

/**
 * Get the currently active locale code.
 * @returns {string}
 */
function getLocale() {
  return currentLocale;
}

/**
 * Inject locale strings directly (for tests running outside a browser).
 * @param {Object} strings - Current locale strings
 * @param {Object} [fallback] - Fallback (English) strings
 */
function _setStringsForTest(strings, fallback) {
  currentStrings = strings || {};
  fallbackStrings = fallback || strings || {};
  buildErrorReverseMap();
}

// Export for Node.js/test environments; in browser these are just globals
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { t, tp, tError, applyI18n, loadLocale, setLocale, getLocale, _setStringsForTest };
}
