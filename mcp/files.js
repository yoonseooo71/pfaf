import fg from 'fast-glob';
import ignore from 'ignore';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.pdf', '.zip', '.tar', '.gz', '.exe', '.bin',
  '.mp3', '.mp4', '.wav', '.ogg', '.mov',
  '.lock', '.node',
]);

const DEFAULT_IGNORE = [
  'node_modules/**', '.git/**', 'dist/**', 'build/**',
  '**/*.lock', 'package-lock.json', '.pfaf-state.json',
];

function loadGitignore(cwd) {
  const ig = ignore();
  const gitignorePath = join(cwd, '.gitignore');
  if (existsSync(gitignorePath)) {
    ig.add(readFileSync(gitignorePath, 'utf8'));
  }
  return ig;
}

function isBinary(filePath) {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

function countLines(fullPath) {
  const content = readFileSync(fullPath, 'utf8');
  return content.split('\n').length;
}

export function discoverFiles({ cwd, glob = '**/*', ignore: ignorePatterns = [] }) {
  const ig = loadGitignore(cwd);
  const rawFiles = fg.sync(glob, {
    cwd,
    ignore: [...DEFAULT_IGNORE, ...ignorePatterns],
    dot: false,
    onlyFiles: true,
    followSymbolicLinks: false,
  });

  const files = [];
  for (const f of rawFiles) {
    if (ig.ignores(f)) continue;
    if (isBinary(f)) continue;

    const fullPath = join(cwd, f);
    const entry = { path: f };

    try {
      const lines = countLines(fullPath);
      if (lines > 500) {
        entry.warning = `File has ${lines} lines (>500). Processing may degrade quality.`;
      }
    } catch {
      // unreadable file — skip silently
      continue;
    }

    files.push(entry);
  }

  return { files, total: files.length };
}
