import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

// ── Mock child_process.spawn ──────────────────────────────────────────────────

function createMockProc({ exitCode = 0, stdout = '', stderr = '' } = {}) {
  const proc = new EventEmitter();
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.kill = vi.fn();

  // Schedule data and close events on next tick
  process.nextTick(() => {
    if (stdout) proc.stdout.emit('data', Buffer.from(stdout));
    if (stderr) proc.stderr.emit('data', Buffer.from(stderr));
    process.nextTick(() => proc.emit('close', exitCode));
  });

  return proc;
}

let spawnMock;

vi.mock('child_process', () => ({
  spawn: (...args) => spawnMock(...args),
  execSync: vi.fn(() => ''),
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
    unlink: vi.fn((_, cb) => cb && cb()),
  };
});

// ── Load module under test ────────────────────────────────────────────────────

const {
  exportDistro,
  importDistro,
  cloneDistro,
  restartDistro,
  getDistroComparison,
} = require('../lib/wsl-ops');

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('exportDistro', () => {
  beforeEach(() => { spawnMock = vi.fn(); });

  it('spawns wsl --export with correct args', async () => {
    spawnMock.mockReturnValue(createMockProc({ exitCode: 0 }));

    const result = await exportDistro({
      distro: 'Ubuntu',
      targetPath: 'C:\\backup\\ubuntu.tar',
      taskId: 'distro-export',
    });

    expect(result.ok).toBe(true);
    expect(result.code).toBe(0);
    expect(spawnMock).toHaveBeenCalledWith(
      'wsl',
      ['--export', 'Ubuntu', 'C:\\backup\\ubuntu.tar'],
      expect.objectContaining({ windowsHide: true }),
    );
  });

  it('reports failure on non-zero exit code', async () => {
    spawnMock.mockReturnValue(createMockProc({ exitCode: 1, stderr: 'export error' }));

    const result = await exportDistro({
      distro: 'Ubuntu',
      targetPath: 'C:\\backup\\ubuntu.tar',
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe(1);
  });

  it('streams output via onOutput callback', async () => {
    spawnMock.mockReturnValue(createMockProc({ exitCode: 0, stdout: 'exporting...' }));
    const outputs = [];

    await exportDistro({
      distro: 'Ubuntu',
      targetPath: 'C:\\backup\\ubuntu.tar',
      taskId: 'test',
      onOutput: (data) => outputs.push(data),
    });

    expect(outputs.length).toBeGreaterThan(0);
    expect(outputs[0].taskId).toBe('test');
  });
});

describe('importDistro', () => {
  beforeEach(() => { spawnMock = vi.fn(); });

  it('spawns wsl --import with correct args', async () => {
    spawnMock.mockReturnValue(createMockProc({ exitCode: 0 }));

    const result = await importDistro({
      name: 'MyDistro',
      installLocation: 'C:\\WSL\\MyDistro',
      tarPath: 'C:\\backup\\ubuntu.tar',
      taskId: 'distro-import',
    });

    expect(result.ok).toBe(true);
    expect(spawnMock).toHaveBeenCalledWith(
      'wsl',
      ['--import', 'MyDistro', 'C:\\WSL\\MyDistro', 'C:\\backup\\ubuntu.tar'],
      expect.objectContaining({ windowsHide: true }),
    );
  });

  it('reports failure on non-zero exit code', async () => {
    spawnMock.mockReturnValue(createMockProc({ exitCode: 1, stderr: 'import error' }));

    const result = await importDistro({
      name: 'MyDistro',
      installLocation: 'C:\\WSL\\MyDistro',
      tarPath: 'C:\\backup\\bad.tar',
    });

    expect(result.ok).toBe(false);
  });
});

describe('cloneDistro', () => {
  beforeEach(() => { spawnMock = vi.fn(); });

  it('exports then imports on success', async () => {
    // First spawn = export, second = import
    spawnMock
      .mockReturnValueOnce(createMockProc({ exitCode: 0, stdout: 'exported' }))
      .mockReturnValueOnce(createMockProc({ exitCode: 0, stdout: 'imported' }));

    const result = await cloneDistro({
      distro: 'Ubuntu',
      newName: 'Ubuntu-Clone',
      installLocation: 'C:\\WSL\\Ubuntu-Clone',
      taskId: 'distro-clone',
    });

    expect(result.ok).toBe(true);
    expect(spawnMock).toHaveBeenCalledTimes(2);

    // First call: export
    expect(spawnMock.mock.calls[0][1][0]).toBe('--export');
    expect(spawnMock.mock.calls[0][1][1]).toBe('Ubuntu');

    // Second call: import
    expect(spawnMock.mock.calls[1][1][0]).toBe('--import');
    expect(spawnMock.mock.calls[1][1][1]).toBe('Ubuntu-Clone');
  });

  it('fails if export step fails', async () => {
    spawnMock.mockReturnValueOnce(createMockProc({ exitCode: 1, stderr: 'export failed' }));

    const result = await cloneDistro({
      distro: 'Ubuntu',
      newName: 'Ubuntu-Clone',
      installLocation: 'C:\\WSL\\Ubuntu-Clone',
    });

    expect(result.ok).toBe(false);
    expect(result.output).toContain('Export failed');
    // Import should not have been called
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });
});

describe('restartDistro', () => {
  beforeEach(() => { spawnMock = vi.fn(); });

  it('terminates then starts the distro', async () => {
    spawnMock
      .mockReturnValueOnce(createMockProc({ exitCode: 0, stdout: 'terminated' }))
      .mockReturnValueOnce(createMockProc({ exitCode: 0, stdout: 'WSL restarted' }));

    const result = await restartDistro({ distro: 'Ubuntu', taskId: 'distro-restart' });

    expect(result.ok).toBe(true);
    expect(spawnMock).toHaveBeenCalledTimes(2);

    // First call should be terminate
    const firstArgs = spawnMock.mock.calls[0];
    expect(firstArgs[0]).toBe('wsl');

    // Second call should start the distro
    const secondArgs = spawnMock.mock.calls[1];
    expect(secondArgs[0]).toBe('wsl');
  });

  it('streams output via onOutput callback', async () => {
    spawnMock
      .mockReturnValueOnce(createMockProc({ exitCode: 0 }))
      .mockReturnValueOnce(createMockProc({ exitCode: 0, stdout: 'WSL restarted' }));

    const outputs = [];
    await restartDistro({
      distro: 'Ubuntu',
      taskId: 'test',
      onOutput: (data) => outputs.push(data),
    });

    // Should have at least the "Terminating" and "Starting" messages from restartDistro
    expect(outputs.length).toBeGreaterThan(0);
  });
});

describe('getDistroComparison', () => {
  beforeEach(() => { spawnMock = vi.fn(); });

  it('returns comparison data for multiple distros', async () => {
    const output = [
      '---UPTIME---',
      '12345.67 99999.99',
      '---PACKAGES---',
      '450',
      '---OS---',
      'Ubuntu 22.04.3 LTS',
    ].join('\n');

    spawnMock.mockImplementation(() => createMockProc({ exitCode: 0, stdout: output }));

    const results = await getDistroComparison(['Ubuntu', 'Debian']);

    expect(results).toHaveLength(2);
    expect(results[0].distro).toBe('Ubuntu');
    expect(results[0].uptime.seconds).toBeCloseTo(12345.67, 1);
    expect(results[0].packages).toBe(450);
    expect(results[0].os).toBe('Ubuntu 22.04.3 LTS');
    expect(results[1].distro).toBe('Debian');
  });

  it('handles stopped distros gracefully', async () => {
    const proc = new EventEmitter();
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.kill = vi.fn();

    spawnMock.mockImplementation(() => {
      process.nextTick(() => proc.emit('error', new Error('failed')));
      return proc;
    });

    const results = await getDistroComparison(['StoppedDistro']);

    expect(results).toHaveLength(1);
    expect(results[0].distro).toBe('StoppedDistro');
    expect(results[0].uptime.seconds).toBe(0);
    expect(results[0].packages).toBeNull();
    expect(results[0].os).toBe('Unknown');
  });

  it('returns empty array for empty input', async () => {
    const results = await getDistroComparison([]);
    expect(results).toEqual([]);
  });
});
