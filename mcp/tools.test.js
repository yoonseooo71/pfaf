import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { handleListFiles, handleGetNextFile, handleMarkDone, handleGetProgress, handleReset } from './tools.js';

let dir;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pfaf-tools-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true });
});

function touch(relPath) {
  const full = join(dir, relPath);
  writeFileSync(full, 'content');
}

test('handleListFiles initializes state and returns file list', async () => {
  touch('a.js');
  touch('b.js');
  const result = await handleListFiles({ glob: '**/*.js' }, dir);
  expect(result.total).toBe(2);
  expect(result.files).toHaveLength(2);
});

test('handleGetNextFile returns first pending file after list', async () => {
  touch('a.js');
  await handleListFiles({ glob: '**/*.js' }, dir);
  const file = await handleGetNextFile({}, dir);
  expect(file).toBe('a.js');
});

test('handleMarkDone marks file and handleGetNextFile skips it', async () => {
  touch('a.js');
  touch('b.js');
  await handleListFiles({ glob: '**/*.js' }, dir);
  await handleMarkDone({ file: 'a.js', status: 'done' }, dir);
  const next = await handleGetNextFile({}, dir);
  expect(next).toBe('b.js');
});

test('handleGetProgress returns correct counts', async () => {
  touch('a.js');
  touch('b.js');
  await handleListFiles({ glob: '**/*.js' }, dir);
  await handleMarkDone({ file: 'a.js', status: 'done' }, dir);
  const p = await handleGetProgress({}, dir);
  expect(p.done).toBe(1);
  expect(p.pending).toBe(1);
  expect(p.total).toBe(2);
});

test('handleReset with force clears state', async () => {
  touch('a.js');
  await handleListFiles({ glob: '**/*.js' }, dir);
  await handleMarkDone({ file: 'a.js', status: 'done' }, dir);
  const result = await handleReset({ force: true }, dir);
  expect(result.ok).toBe(true);
});

test('handleReset without force throws when in-progress', async () => {
  touch('a.js');
  touch('b.js');
  await handleListFiles({ glob: '**/*.js' }, dir);
  await handleMarkDone({ file: 'a.js', status: 'done' }, dir);
  await expect(handleReset({ force: false }, dir)).rejects.toThrow('in-progress');
});
