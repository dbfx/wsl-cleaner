import { describe, it, expect } from 'vitest';
const { formatBytes, escapeHtml, estimateTotalSize } = require('../renderer/utils');

// ── formatBytes ──────────────────────────────────────────────────────────────

describe('formatBytes', () => {
  it('returns "0 B" for zero', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('formats bytes', () => {
    expect(formatBytes(500)).toBe('500 B');
  });

  it('formats kilobytes', () => {
    expect(formatBytes(1024)).toBe('1 KB');
  });

  it('formats megabytes with two decimals', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.00 MB');
  });

  it('formats gigabytes with two decimals', () => {
    expect(formatBytes(1024 ** 3)).toBe('1.00 GB');
  });

  it('formats terabytes with two decimals', () => {
    expect(formatBytes(1024 ** 4)).toBe('1.00 TB');
  });

  it('formats fractional megabytes', () => {
    const result = formatBytes(1.5 * 1024 * 1024);
    expect(result).toBe('1.50 MB');
  });

  it('handles large byte counts', () => {
    // 5.5 GB
    const result = formatBytes(5.5 * 1024 ** 3);
    expect(result).toBe('5.50 GB');
  });
});

// ── escapeHtml ───────────────────────────────────────────────────────────────

describe('escapeHtml', () => {
  it('escapes ampersands', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('escapes less-than signs', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });

  it('escapes double quotes', () => {
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
  });

  it('escapes all special characters together', () => {
    expect(escapeHtml('<a href="x">&')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;');
  });

  it('returns plain text unchanged', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });

  it('handles empty string', () => {
    expect(escapeHtml('')).toBe('');
  });
});

// ── estimateTotalSize ────────────────────────────────────────────────────────

describe('estimateTotalSize', () => {
  it('parses megabyte sizes', () => {
    const dirs = [
      { size: '120M', path: '/a' },
      { size: '80M', path: '/b' },
    ];
    // 200 MB = 200 * 1024 * 1024 = 209715200
    expect(estimateTotalSize(dirs)).toBe('200.00 MB');
  });

  it('parses gigabyte sizes', () => {
    const dirs = [
      { size: '1.5G', path: '/a' },
      { size: '2.5G', path: '/b' },
    ];
    expect(estimateTotalSize(dirs)).toBe('4.00 GB');
  });

  it('parses kilobyte sizes', () => {
    const dirs = [
      { size: '512K', path: '/a' },
      { size: '512K', path: '/b' },
    ];
    // 512K + 512K = 1024K = 1 MB
    expect(estimateTotalSize(dirs)).toBe('1.00 MB');
  });

  it('handles mixed units', () => {
    const dirs = [
      { size: '1G', path: '/a' },
      { size: '512M', path: '/b' },
    ];
    expect(estimateTotalSize(dirs)).toBe('1.50 GB');
  });

  it('returns "0 B" for empty array', () => {
    expect(estimateTotalSize([])).toBe('0 B');
  });

  it('handles plain numeric sizes (bytes)', () => {
    const dirs = [
      { size: '100', path: '/a' },
      { size: '200', path: '/b' },
    ];
    expect(estimateTotalSize(dirs)).toBe('300 B');
  });
});
