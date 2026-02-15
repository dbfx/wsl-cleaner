import { describe, it, expect } from 'vitest';
const { parseArgs, stripHtml, formatBytes } = require('../cli');

// ── parseArgs ────────────────────────────────────────────────────────────────

describe('parseArgs', () => {
  // Helper: simulate argv (first two elements are node and script path)
  const parse = (...args) => parseArgs(['node', 'cli.js', ...args]);

  it('returns defaults when no arguments given', () => {
    const opts = parse();
    expect(opts.action).toBeNull();
    expect(opts.distro).toBeNull();
    expect(opts.tasks).toBeNull();
    expect(opts.exclude).toEqual([]);
    expect(opts.days).toBe(30);
    expect(opts.dryRun).toBe(false);
    expect(opts.json).toBe(false);
    expect(opts.noAggressive).toBe(false);
    expect(opts.verbose).toBe(false);
    expect(opts.quiet).toBe(false);
    expect(opts.help).toBe(false);
    expect(opts.version).toBe(false);
  });

  // Actions
  it('parses --list action', () => {
    expect(parse('--list').action).toBe('list');
  });

  it('parses --clean action', () => {
    expect(parse('--clean').action).toBe('clean');
  });

  it('parses --scan-stale action', () => {
    expect(parse('--scan-stale').action).toBe('scan-stale');
  });

  it('parses --compact action', () => {
    expect(parse('--compact').action).toBe('compact');
  });

  it('parses --list-tasks action', () => {
    expect(parse('--list-tasks').action).toBe('list-tasks');
  });

  // Distro
  it('parses --distro with value', () => {
    expect(parse('--distro', 'Ubuntu').distro).toBe('Ubuntu');
  });

  it('parses -d shorthand', () => {
    expect(parse('-d', 'Debian').distro).toBe('Debian');
  });

  // Tasks
  it('parses --tasks as comma-separated list', () => {
    const opts = parse('--tasks', 'apt-clean,tmp,caches');
    expect(opts.tasks).toEqual(['apt-clean', 'tmp', 'caches']);
  });

  it('parses -t shorthand', () => {
    const opts = parse('-t', 'journal,trash');
    expect(opts.tasks).toEqual(['journal', 'trash']);
  });

  it('trims whitespace in task IDs', () => {
    const opts = parse('--tasks', ' apt-clean , tmp ');
    expect(opts.tasks).toEqual(['apt-clean', 'tmp']);
  });

  // Exclude
  it('parses --exclude as comma-separated list', () => {
    const opts = parse('--exclude', 'docker-prune,git-gc');
    expect(opts.exclude).toEqual(['docker-prune', 'git-gc']);
  });

  // Days
  it('parses --days with numeric value', () => {
    expect(parse('--days', '60').days).toBe(60);
  });

  it('defaults to 30 for invalid --days value', () => {
    expect(parse('--days', 'abc').days).toBe(30);
  });

  // Boolean flags
  it('parses --dry-run', () => {
    expect(parse('--dry-run').dryRun).toBe(true);
  });

  it('parses --json', () => {
    expect(parse('--json').json).toBe(true);
  });

  it('parses --no-aggressive', () => {
    expect(parse('--no-aggressive').noAggressive).toBe(true);
  });

  it('parses --verbose and -v', () => {
    expect(parse('--verbose').verbose).toBe(true);
    expect(parse('-v').verbose).toBe(true);
  });

  it('parses --quiet and -q', () => {
    expect(parse('--quiet').quiet).toBe(true);
    expect(parse('-q').quiet).toBe(true);
  });

  it('parses --help and -h', () => {
    expect(parse('--help').help).toBe(true);
    expect(parse('-h').help).toBe(true);
  });

  it('parses --version', () => {
    expect(parse('--version').version).toBe(true);
  });

  // Combined
  it('parses multiple flags together', () => {
    const opts = parse('--clean', '-d', 'Ubuntu', '--tasks', 'apt-clean,tmp', '--dry-run', '--json', '-v');
    expect(opts.action).toBe('clean');
    expect(opts.distro).toBe('Ubuntu');
    expect(opts.tasks).toEqual(['apt-clean', 'tmp']);
    expect(opts.dryRun).toBe(true);
    expect(opts.json).toBe(true);
    expect(opts.verbose).toBe(true);
  });

  it('last action wins when multiple actions given', () => {
    const opts = parse('--list', '--clean');
    expect(opts.action).toBe('clean');
  });
});

// ── stripHtml ────────────────────────────────────────────────────────────────

describe('stripHtml', () => {
  it('removes HTML tags', () => {
    expect(stripHtml('<code>apt clean</code>')).toBe('apt clean');
  });

  it('decodes &amp;', () => {
    expect(stripHtml('foo &amp; bar')).toBe('foo & bar');
  });

  it('decodes &ndash;', () => {
    expect(stripHtml('200&ndash;400 MB')).toBe('200-400 MB');
  });

  it('decodes &lt; and &gt;', () => {
    expect(stripHtml('&lt;script&gt;')).toBe('<script>');
  });

  it('handles nested tags', () => {
    expect(stripHtml('<strong><code>path</code></strong>')).toBe('path');
  });

  it('handles string with no HTML', () => {
    expect(stripHtml('plain text')).toBe('plain text');
  });

  it('handles empty string', () => {
    expect(stripHtml('')).toBe('');
  });

  it('handles multiple entities in one string', () => {
    expect(stripHtml('Uses <code>dnf clean all &amp;&amp; dnf autoremove</code>')).toBe('Uses dnf clean all && dnf autoremove');
  });
});

// ── formatBytes (CLI version) ────────────────────────────────────────────────

describe('formatBytes (CLI)', () => {
  it('returns "0 B" for zero', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('formats bytes', () => {
    expect(formatBytes(500)).toBe('500.0 B');
  });

  it('formats kilobytes', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
  });

  it('formats megabytes', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
  });

  it('formats gigabytes', () => {
    expect(formatBytes(1024 ** 3)).toBe('1.0 GB');
  });
});
