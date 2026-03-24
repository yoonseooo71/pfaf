import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { handleListFiles, handleGetNextFile, handleMarkDone, handleGetProgress, handleGetFailures, handleReset, FolderEntry } from './tools.js';

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

// include_only tests

test('handleListFiles with include_only restricts to matching files', async () => {
  touch('a.ts');
  touch('b.ts');
  touch('c.js');
  const result = await handleListFiles({ glob: '**/*', include_only: ['**/*.ts'] }, dir);
  expect(result.files).toContain('a.ts');
  expect(result.files).toContain('b.ts');
  expect(result.files).not.toContain('c.js');
});

test('handleListFiles with empty include_only returns all files', async () => {
  touch('a.ts');
  touch('b.js');
  const result = await handleListFiles({ glob: '**/*', include_only: [] }, dir);
  expect(result.total).toBe(2);
});

// get_failures tests

test('handleGetFailures returns failure entries with reasons', async () => {
  touch('a.ts');
  touch('b.ts');
  await handleListFiles({ glob: '**/*.ts' }, dir);
  await handleMarkDone({ file: 'a.ts', status: 'failed', reason: 'syntax error on line 3' }, dir);
  await handleMarkDone({ file: 'b.ts', status: 'done' }, dir);
  const failures = await handleGetFailures({}, dir);
  expect(failures).toHaveLength(1);
  expect(failures[0]).toEqual({ file: 'a.ts', reason: 'syntax error on line 3' });
});

test('handleGetFailures returns empty array when no failures', async () => {
  touch('a.ts');
  await handleListFiles({ glob: '**/*.ts' }, dir);
  await handleMarkDone({ file: 'a.ts', status: 'done' }, dir);
  const failures = await handleGetFailures({}, dir);
  expect(failures).toEqual([]);
});

test('handleMarkDone failed without reason does not store reason', async () => {
  touch('a.ts');
  await handleListFiles({ glob: '**/*.ts' }, dir);
  await handleMarkDone({ file: 'a.ts', status: 'failed' }, dir);
  const failures = await handleGetFailures({}, dir);
  expect(failures).toEqual([]);
});

// batch_size tests

test('handleListFiles stores batch_size in state via getProgress', async () => {
  touch('a.js');
  await handleListFiles({ glob: '**/*.js', batch_size: 3 }, dir);
  const progress = await handleGetProgress({}, dir);
  expect(progress.batchSize).toBe(3);
});

test('handleListFiles defaults batch_size to 5', async () => {
  touch('a.js');
  await handleListFiles({ glob: '**/*.js' }, dir);
  const progress = await handleGetProgress({}, dir);
  expect(progress.batchSize).toBe(5);
});

// changed-only tests

test('handleListFiles with changed_only=true only includes git-changed files', async () => {
  // init a temp git repo so git diff works
  const { execSync: exec } = await import('child_process');
  exec('git init && git config user.email "t@t.com" && git config user.name "T"', { cwd: dir });
  touch('a.ts');
  touch('b.ts');
  exec('git add a.ts && git commit -m "init"', { cwd: dir });
  // modify a.ts after commit so it shows in git diff HEAD
  writeFileSync(join(dir, 'a.ts'), 'changed');

  const result = await handleListFiles({ glob: '**/*.ts', changed_only: true }, dir);
  expect(result.files).toContain('a.ts');
  expect(result.files).not.toContain('b.ts');
});

// dry-run tests

test('handleListFiles with dry_run=true does not initialize state', async () => {
  touch('a.ts');
  touch('b.ts');
  const result = await handleListFiles({ glob: '**/*.ts', dry_run: true }, dir);
  expect(result.dry_run).toBe(true);
  expect(result.total).toBe(2);
  // state should not be created — get_next_file returns null
  const next = await handleGetNextFile({}, dir);
  expect(next).toBeNull();
});

test('handleListFiles with dry_run=false initializes state normally', async () => {
  touch('a.ts');
  const result = await handleListFiles({ glob: '**/*.ts', dry_run: false }, dir);
  expect(result.dry_run).toBeUndefined();
  const next = await handleGetNextFile({}, dir);
  expect(next).toBe('a.ts');
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

// model tests

test('handleListFiles stores model in state', async () => {
  touch('a.js');
  await handleListFiles({ glob: '**/*.js', model: 'haiku' }, dir);
  const p = await handleGetProgress({}, dir);
  expect(p.model).toBe('haiku');
});

test('handleListFiles without model leaves model undefined in state', async () => {
  touch('a.js');
  await handleListFiles({ glob: '**/*.js' }, dir);
  const p = await handleGetProgress({}, dir);
  expect(p.model).toBeUndefined();
});

test('handleListFiles rejects model change when run already has a locked model', async () => {
  touch('a.js');
  await handleListFiles({ glob: '**/*.js', model: 'sonnet' }, dir);
  // mark all files done so the in-progress guard passes, then the model lock check runs
  await handleMarkDone({ file: 'a.js', status: 'done' }, dir);
  // attempt to reinitialize with a different model — should throw model lock error
  await expect(handleListFiles({ glob: '**/*.js', model: 'opus' }, dir)).rejects.toThrow('locked');
});

test('handleListFiles allows same model on re-init after run completes', async () => {
  touch('a.js');
  await handleListFiles({ glob: '**/*.js', model: 'sonnet' }, dir);
  await handleMarkDone({ file: 'a.js', status: 'done' }, dir);
  // all done — re-init with same model should succeed
  await expect(handleListFiles({ glob: '**/*.js', model: 'sonnet' }, dir)).resolves.toBeDefined();
});
