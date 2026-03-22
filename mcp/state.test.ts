import { readState, writeState, initState, markDone, getNextFile, getProgress, resetState } from './state.js';
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
  initState(statePath, { prompt: 'test', mode: 'sequential', glob: '**/*.js', files: ['a.js', 'b.js'] });
  const state = readState(statePath);
  expect(state.files['a.js']).toBe('pending');
  expect(state.files['b.js']).toBe('pending');
  expect(state.prompt).toBe('test');
});

test('getNextFile returns first pending file', () => {
  initState(statePath, { prompt: 'test', mode: 'sequential', glob: '**/*.js', files: ['a.js', 'b.js'] });
  expect(getNextFile(statePath)).toBe('a.js');
});

test('getNextFile returns null when all files done', () => {
  initState(statePath, { prompt: 'test', mode: 'sequential', glob: '**/*.js', files: ['a.js'] });
  markDone(statePath, 'a.js', 'done');
  expect(getNextFile(statePath)).toBeNull();
});

test('getNextFile with retry_failed returns failed files', () => {
  initState(statePath, { prompt: 'test', mode: 'sequential', glob: '**/*.js', files: ['a.js', 'b.js'] });
  markDone(statePath, 'a.js', 'failed');
  markDone(statePath, 'b.js', 'done');
  expect(getNextFile(statePath, true)).toBe('a.js');
});

test('getProgress returns correct counts', () => {
  initState(statePath, { prompt: 'test', mode: 'sequential', glob: '**/*.js', files: ['a.js', 'b.js', 'c.js'] });
  markDone(statePath, 'a.js', 'done');
  markDone(statePath, 'b.js', 'failed');
  const p = getProgress(statePath);
  expect(p).toEqual({ done: 1, pending: 1, failed: 1, total: 3 });
});

test('resetState with force=true clears the file', () => {
  initState(statePath, { prompt: 'test', mode: 'sequential', glob: '**/*.js', files: ['a.js'] });
  resetState(statePath, true);
  expect(existsSync(statePath)).toBe(false);
});

test('resetState with force=false throws if in-progress', () => {
  initState(statePath, { prompt: 'test', mode: 'sequential', glob: '**/*.js', files: ['a.js', 'b.js'] });
  expect(() => resetState(statePath, false)).toThrow('in-progress');
});
