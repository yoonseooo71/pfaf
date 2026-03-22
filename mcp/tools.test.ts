import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { handleListFiles, handleGetNextFile, handleMarkDone, handleGetProgress, handleReset, FolderEntry } from './tools.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pfaf-tools-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true });
});

function touch(relPath: string): void {
  const full = join(dir, relPath);
  writeFileSync(full, 'content');
}

function mkdir(relPath: string): void {
  mkdirSync(join(dir, relPath), { recursive: true });
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

// folder mode tests

test('handleListFiles with group_by=folder groups files by directory', async () => {
  mkdir('src');
  mkdir('lib');
  touch('src/a.ts');
  touch('src/b.ts');
  touch('lib/c.ts');
  const result = await handleListFiles({ glob: '**/*.ts', group_by: 'folder' }, dir);
  expect(result.total).toBe(3);
  expect(result.files).toHaveLength(3);
});

test('handleGetNextFile in folder mode returns FolderEntry', async () => {
  mkdir('src');
  touch('src/a.ts');
  touch('src/b.ts');
  await handleListFiles({ glob: '**/*.ts', group_by: 'folder' }, dir);
  const entry = await handleGetNextFile({}, dir) as FolderEntry;
  expect(entry).toHaveProperty('folder');
  expect(entry).toHaveProperty('files');
  expect(entry.folder).toBe('src');
  expect(entry.files).toHaveLength(2);
});

test('handleGetNextFile in folder mode returns null when all folders done', async () => {
  mkdir('src');
  touch('src/a.ts');
  await handleListFiles({ glob: '**/*.ts', group_by: 'folder' }, dir);
  await handleMarkDone({ file: 'src', status: 'done' }, dir);
  const next = await handleGetNextFile({}, dir);
  expect(next).toBeNull();
});

test('handleGetNextFile in folder mode skips done folders', async () => {
  mkdir('src');
  mkdir('lib');
  touch('src/a.ts');
  touch('lib/b.ts');
  await handleListFiles({ glob: '**/*.ts', group_by: 'folder' }, dir);
  const first = await handleGetNextFile({}, dir) as FolderEntry;
  await handleMarkDone({ file: first.folder, status: 'done' }, dir);
  const second = await handleGetNextFile({}, dir) as FolderEntry;
  expect(second.folder).not.toBe(first.folder);
});
