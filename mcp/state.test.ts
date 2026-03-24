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
  initState(statePath, { prompt: 'test', mode: 'sequential', glob: '**/*.js', groupBy: 'file', files: ['a.js', 'b.js'] });
  const state = readState(statePath);
  expect(state!.files['a.js']).toBe('pending');
  expect(state!.files['b.js']).toBe('pending');
  expect(state!.prompt).toBe('test');
});

test('getNextFile returns first pending file', () => {
  initState(statePath, { prompt: 'test', mode: 'sequential', glob: '**/*.js', groupBy: 'file', files: ['a.js', 'b.js'] });
  expect(getNextFile(statePath)).toBe('a.js');
});

test('getNextFile returns null when all files done', () => {
  initState(statePath, { prompt: 'test', mode: 'sequential', glob: '**/*.js', groupBy: 'file', files: ['a.js'] });
  markDone(statePath, 'a.js', 'done');
  expect(getNextFile(statePath)).toBeNull();
});

test('getNextFile with retry_failed returns failed files', () => {
  initState(statePath, { prompt: 'test', mode: 'sequential', glob: '**/*.js', groupBy: 'file', files: ['a.js', 'b.js'] });
  markDone(statePath, 'a.js', 'failed');
  markDone(statePath, 'b.js', 'done');
  expect(getNextFile(statePath, true)).toBe('a.js');
});

test('getProgress returns correct counts', () => {
  initState(statePath, { prompt: 'test', mode: 'sequential', glob: '**/*.js', groupBy: 'file', files: ['a.js', 'b.js', 'c.js'] });
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
  initState(statePath, { prompt: 'test', mode: 'sequential', glob: '**/*.js', groupBy: 'file', files: ['a.js'] });
  resetState(statePath, true);
  expect(existsSync(statePath)).toBe(false);
});

test('resetState with force=false throws if in-progress', () => {
  initState(statePath, { prompt: 'test', mode: 'sequential', glob: '**/*.js', groupBy: 'file', files: ['a.js', 'b.js'] });
  expect(() => resetState(statePath, false)).toThrow('in-progress');
});

test('initState with groupBy=folder stores folderContents', () => {
  const folderContents = { src: ['src/a.ts', 'src/b.ts'], lib: ['lib/c.ts'] };
  initState(statePath, {
    prompt: 'test', mode: 'sequential', glob: '**/*.ts',
    groupBy: 'folder', files: ['src', 'lib'], folderContents,
  });
  const state = readState(statePath);
  expect(state!.groupBy).toBe('folder');
  expect(state!.files['src']).toBe('pending');
  expect(state!.files['lib']).toBe('pending');
  expect(state!.folderContents).toEqual(folderContents);
});

test('getGroupBy returns file by default', () => {
  initState(statePath, { prompt: 'test', mode: 'sequential', glob: '**/*.js', groupBy: 'file', files: ['a.js'] });
  expect(getGroupBy(statePath)).toBe('file');
});

test('getGroupBy returns folder when set', () => {
  initState(statePath, {
    prompt: 'test', mode: 'sequential', glob: '**/*.ts',
    groupBy: 'folder', files: ['src'],
    folderContents: { src: ['src/a.ts'] },
  });
  expect(getGroupBy(statePath)).toBe('folder');
});

test('getFolderContents returns files for a folder', () => {
  initState(statePath, {
    prompt: 'test', mode: 'sequential', glob: '**/*.ts',
    groupBy: 'folder', files: ['src'],
    folderContents: { src: ['src/a.ts', 'src/b.ts'] },
  });
  expect(getFolderContents(statePath, 'src')).toEqual(['src/a.ts', 'src/b.ts']);
});

test('getFolderContents returns empty array for unknown folder', () => {
  initState(statePath, { prompt: 'test', mode: 'sequential', glob: '**/*.js', groupBy: 'file', files: ['a.js'] });
  expect(getFolderContents(statePath, 'nonexistent')).toEqual([]);
});

// model tests

test('initState stores model when provided', () => {
  initState(statePath, { prompt: 'test', mode: 'sequential', glob: '**/*.js', groupBy: 'file', files: ['a.js'], model: 'haiku' });
  const state = readState(statePath);
  expect(state!.model).toBe('haiku');
});

test('initState omits model field when not provided', () => {
  initState(statePath, { prompt: 'test', mode: 'sequential', glob: '**/*.js', groupBy: 'file', files: ['a.js'] });
  const state = readState(statePath);
  expect(state!.model).toBeUndefined();
});

test('getProgress returns model when set', () => {
  initState(statePath, { prompt: 'test', mode: 'sequential', glob: '**/*.js', groupBy: 'file', files: ['a.js'], model: 'opus' });
  const p = getProgress(statePath);
  expect(p.model).toBe('opus');
});

test('getProgress omits model when not set', () => {
  initState(statePath, { prompt: 'test', mode: 'sequential', glob: '**/*.js', groupBy: 'file', files: ['a.js'] });
  const p = getProgress(statePath);
  expect(p.model).toBeUndefined();
});
