import { describe, it, expect } from 'vitest';
const { TASKS } = require('../renderer/tasks');

// Valid tool names that the app detects via `which` in WSL
const VALID_TOOL_NAMES = [
  'apt', 'dnf', 'npm', 'yarn', 'pnpm', 'go', 'pip', 'pip3',
  'composer', 'snap', 'docker', 'mvn', 'gradle', 'conda',
  'gem', 'dotnet', 'deno', 'bun', 'dart', 'brew', 'ccache', 'bazel',
];

describe('TASKS array integrity', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(TASKS)).toBe(true);
    expect(TASKS.length).toBeGreaterThan(0);
  });

  it('every task has required fields', () => {
    for (const task of TASKS) {
      expect(task).toHaveProperty('id');
      expect(task).toHaveProperty('name');
      expect(task).toHaveProperty('desc');
      expect(task).toHaveProperty('command');
      expect(task).toHaveProperty('asRoot');
      expect(typeof task.id).toBe('string');
      expect(typeof task.name).toBe('string');
      expect(typeof task.desc).toBe('string');
      expect(typeof task.command).toBe('string');
      expect(typeof task.asRoot).toBe('boolean');
    }
  });

  it('has no duplicate task IDs', () => {
    const ids = TASKS.map(t => t.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('every task ID is a non-empty string', () => {
    for (const task of TASKS) {
      expect(task.id.length).toBeGreaterThan(0);
    }
  });

  it('every task command is a non-empty string', () => {
    for (const task of TASKS) {
      expect(task.command.length).toBeGreaterThan(0);
    }
  });

  it('requires field is null or a valid tool name', () => {
    for (const task of TASKS) {
      if (task.requires !== null && task.requires !== undefined) {
        expect(VALID_TOOL_NAMES).toContain(task.requires);
      }
    }
  });

  it('aggressive field is boolean when present', () => {
    for (const task of TASKS) {
      if ('aggressive' in task) {
        expect(typeof task.aggressive).toBe('boolean');
      }
    }
  });

  it('has at least one aggressive task', () => {
    const aggressive = TASKS.filter(t => t.aggressive);
    expect(aggressive.length).toBeGreaterThan(0);
  });

  it('has the fstrim task (used by simple mode)', () => {
    const fstrim = TASKS.find(t => t.id === 'fstrim');
    expect(fstrim).toBeDefined();
    expect(fstrim.asRoot).toBe(true);
  });

  it('no task name is empty or just whitespace', () => {
    for (const task of TASKS) {
      expect(task.name.trim().length).toBeGreaterThan(0);
    }
  });

  it('no task desc is empty or just whitespace', () => {
    for (const task of TASKS) {
      expect(task.desc.trim().length).toBeGreaterThan(0);
    }
  });
});
