import { readState, initState, markDone, getNextFile, getGroupBy, getFolderContents, getProgress, resetState } from './state.js';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let dir: string;
let statePath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pfaf-'));
  statePath = join(dir, '.pfaf-state.json');
});

afterEach(() => {
  rmSync(dir, { recursive: true });
});

test('initState creates state file with all files as pending', () => {
  const config = {
    prompt: 'test',
    mode: 'sequential' as const,
    glob: '**/*.js',
    groupBy: 'file' as const,
    files: ['a.js', 'b.js'],
  };
  initState(statePath, config);
  const state = readState(statePath);
  expect(state!.files['a.js']).toBe('pending');
  expect(state!.files['b.js']).toBe('pending');
  expect(state!.prompt).toBe('test');
});

test('getNextFile returns first pending file', () => {
  const config = {
    prompt: 'test',
    mode: 'sequential' as const,
    glob: '**/*.js',
    groupBy: 'file' as const,
    files: ['a.js', 'b.js'],
  };
  initState(statePath, config);
  expect(getNextFile(statePath)).toBe('a.js');
});

test('getNextFile returns null when all files done', () => {
  const config = {
    prompt: 'test',
    mode: 'sequential' as const,
    glob: '**/*.js',
    groupBy: 'file' as const,
    files: ['a.js'],
  };
  initState(statePath, config);
  markDone(statePath, 'a.js', 'done');
  expect(getNextFile(statePath)).toBeNull();
});

test('getNextFile with retry_failed returns failed files', () => {
  const config = {
    prompt: 'test',
    mode: 'sequential' as const,
    glob: '**/*.js',
    groupBy: 'file' as const,
    files: ['a.js', 'b.js'],
  };
  initState(statePath, config);
  markDone(statePath, 'a.js', 'failed');
  markDone(statePath, 'b.js', 'done');
  expect(getNextFile(statePath, true)).toBe('a.js');
});

test('getProgress returns correct counts', () => {
  const config = {
    prompt: 'test',
    mode: 'sequential' as const,
    glob: '**/*.js',
    groupBy: 'file' as const,
    files: ['a.js', 'b.js', 'c.js'],
  };
  initState(statePath, config);
  markDone(statePath, 'a.js', 'done');
  markDone(statePath, 'b.js', 'failed');
  const p = getProgress(statePath);
  expect(p.done).toBe(1);
  expect(p.pending).toBe(1);
  expect(p.failed).toBe(1);
  expect(p.total).toBe(3);
  expect(p.batchSize).toBe(5);
  expect(p.bar).toMatch(/\[█+░*\] \d+\/\d+ \(\d+%\)/);
});

test('resetState with force=true clears the file', () => {
  const config = {
    prompt: 'test',
    mode: 'sequential' as const,
    glob: '**/*.js',
    groupBy: 'file' as const,
    files: ['a.js'],
  };
  initState(statePath, config);
  resetState(statePath, true);
  expect(existsSync(statePath)).toBe(false);
});

test('resetState with force=false throws if in-progress', () => {
  const config = {
    prompt: 'test',
    mode: 'sequential' as const,
    glob: '**/*.js',
    groupBy: 'file' as const,
    files: ['a.js', 'b.js'],
  };
  initState(statePath, config);
  expect(() => resetState(statePath, false)).toThrow('in-progress');
});

test('initState with groupBy=folder stores folderContents', () => {
  const folderContents = {
    src: ['src/a.ts', 'src/b.ts'],
    lib: ['lib/c.ts'],
  };
  const config = {
    prompt: 'test',
    mode: 'sequential' as const,
    glob: '**/*.ts',
    groupBy: 'folder' as const,
    files: ['src', 'lib'],
    folderContents,
  };
  initState(statePath, config);
  const state = readState(statePath);
  expect(state!.groupBy).toBe('folder');
  expect(state!.files['src']).toBe('pending');
  expect(state!.files['lib']).toBe('pending');
  expect(state!.folderContents).toEqual(folderContents);
});

test('getGroupBy returns file by default', () => {
  const config = {
    prompt: 'test',
    mode: 'sequential' as const,
    glob: '**/*.js',
    groupBy: 'file' as const,
    files: ['a.js'],
  };
  initState(statePath, config);
  expect(getGroupBy(statePath)).toBe('file');
});

test('getGroupBy returns folder when set', () => {
  const config = {
    prompt: 'test',
    mode: 'sequential' as const,
    glob: '**/*.ts',
    groupBy: 'folder' as const,
    files: ['src'],
    folderContents: { src: ['src/a.ts'] },
  };
  initState(statePath, config);
  expect(getGroupBy(statePath)).toBe('folder');
});

test('getFolderContents returns files for a folder', () => {
  const config = {
    prompt: 'test',
    mode: 'sequential' as const,
    glob: '**/*.ts',
    groupBy: 'folder' as const,
    files: ['src'],
    folderContents: { src: ['src/a.ts', 'src/b.ts'] },
  };
  initState(statePath, config);
  expect(getFolderContents(statePath, 'src')).toEqual(['src/a.ts', 'src/b.ts']);
});

test('getFolderContents returns empty array for unknown folder', () => {
  const config = {
    prompt: 'test',
    mode: 'sequential' as const,
    glob: '**/*.js',
    groupBy: 'file' as const,
    files: ['a.js'],
  };
  initState(statePath, config);
  expect(getFolderContents(statePath, 'nonexistent')).toEqual([]);
});

// Model configuration tests

test('initState stores model when provided', () => {
  const config = {
    prompt: 'test',
    mode: 'sequential' as const,
    glob: '**/*.js',
    groupBy: 'file' as const,
    files: ['a.js'],
    model: 'haiku' as const,
  };
  initState(statePath, config);
  const state = readState(statePath);
  expect(state!.model).toBe('haiku');
});

test('initState omits model field when not provided', () => {
  const config = {
    prompt: 'test',
    mode: 'sequential' as const,
    glob: '**/*.js',
    groupBy: 'file' as const,
    files: ['a.js'],
  };
  initState(statePath, config);
  const state = readState(statePath);
  expect(state!.model).toBeUndefined();
});

test('getProgress returns model when set', () => {
  const config = {
    prompt: 'test',
    mode: 'sequential' as const,
    glob: '**/*.js',
    groupBy: 'file' as const,
    files: ['a.js'],
    model: 'opus' as const,
  };
  initState(statePath, config);
  const p = getProgress(statePath);
  expect(p.model).toBe('opus');
});

test('getProgress omits model when not set', () => {
  const config = {
    prompt: 'test',
    mode: 'sequential' as const,
    glob: '**/*.js',
    groupBy: 'file' as const,
    files: ['a.js'],
  };
  initState(statePath, config);
  const p = getProgress(statePath);
  expect(p.model).toBeUndefined();
});
