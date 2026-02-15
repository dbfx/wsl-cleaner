// ── Pure utility functions (extracted from app.js for testability) ────────────

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return val.toFixed(i > 1 ? 2 : 0) + ' ' + units[i];
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function estimateTotalSize(dirs) {
  // Parse human-readable sizes like "120M", "4.5G", "240K" and sum them
  let totalBytes = 0;
  const multipliers = { K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4 };
  for (const d of dirs) {
    const match = d.size.match(/^([\d.]+)\s*([KMGT])?/i);
    if (match) {
      const num = parseFloat(match[1]);
      const unit = (match[2] || '').toUpperCase();
      totalBytes += num * (multipliers[unit] || 1);
    }
  }
  return formatBytes(totalBytes);
}

// Export for Node.js/test environments; in browser these are just globals
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { formatBytes, escapeHtml, estimateTotalSize };
}
