import { discoverFiles } from './files.js';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';

let dir;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pfaf-files-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true });
});

function touch(relPath, content = 'hello') {
  const full = join(dir, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

test('discovers .ts files matching glob', () => {
  touch('src/a.ts');
  touch('src/b.ts');
  touch('src/c.js');
  const result = discoverFiles({ cwd: dir, glob: '**/*.ts' });
  expect(result.files.map(f => f.path)).toEqual(
    expect.arrayContaining(['src/a.ts', 'src/b.ts'])
  );
  expect(result.files.map(f => f.path)).not.toContain('src/c.js');
});

test('excludes node_modules by default', () => {
  touch('node_modules/lib/index.js');
  touch('src/app.js');
  const result = discoverFiles({ cwd: dir, glob: '**/*.js' });
  expect(result.files.map(f => f.path)).not.toContain('node_modules/lib/index.js');
});

test('respects .gitignore', () => {
  writeFileSync(join(dir, '.gitignore'), 'generated/\n');
  touch('generated/output.js');
  touch('src/app.js');
  const result = discoverFiles({ cwd: dir, glob: '**/*.js' });
  expect(result.files.map(f => f.path)).not.toContain('generated/output.js');
  expect(result.files.map(f => f.path)).toContain('src/app.js');
});

test('excludes binary files by extension', () => {
  touch('assets/logo.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  touch('src/app.js');
  const result = discoverFiles({ cwd: dir, glob: '**/*' });
  expect(result.files.map(f => f.path)).not.toContain('assets/logo.png');
});

test('flags files over 500 lines with warning', () => {
  const bigContent = Array(600).fill('line').join('\n');
  touch('src/big.ts', bigContent);
  const result = discoverFiles({ cwd: dir, glob: '**/*.ts' });
  const big = result.files.find(f => f.path === 'src/big.ts');
  expect(big.warning).toMatch(/500/);
});
