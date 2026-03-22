import fg from 'fast-glob';
import ignore from 'ignore';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.pdf', '.zip', '.tar', '.gz', '.exe', '.bin',
  '.mp3', '.mp4', '.wav', '.ogg', '.mov',
  '.lock', '.node',
]);

const DEFAULT_IGNORE: string[] = [
  'node_modules/**', '.git/**', 'dist/**', 'build/**',
  '**/*.lock', 'package-lock.json', '.pfaf-state.json',
];

interface DiscoverFilesOptions {
  cwd: string;
  glob?: string;
  ignore?: string[];
  includeOnly?: string[];
}

interface FileEntry {
  path: string;
  warning?: string;
}

interface DiscoverFilesResult {
  files: FileEntry[];
  total: number;
}

function loadGitignore(cwd: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ig = (ignore as any)();
  const gitignorePath = join(cwd, '.gitignore');
  if (existsSync(gitignorePath)) {
    ig.add(readFileSync(gitignorePath, 'utf8'));
  }
  return ig;
}

function isBinary(filePath: string): boolean {
  const dotIndex = filePath.lastIndexOf('.');
  if (dotIndex === -1) return false;
  const ext = filePath.slice(dotIndex).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

function countLines(fullPath: string): number {
  const content = readFileSync(fullPath, 'utf8');
  if (content === '') return 0;
  return content.split('\n').length;
}

export function getChangedFiles(cwd: string): Set<string> {
  try {
    const output = execSync('git diff --name-only HEAD', { cwd, encoding: 'utf8' });
    return new Set(output.trim().split('\n').filter(Boolean));
  } catch {
    return new Set();
  }
}

export function discoverFiles({ cwd, glob = '**/*', ignore: ignorePatterns = [], includeOnly = [] }: DiscoverFilesOptions): DiscoverFilesResult {
  const ig = loadGitignore(cwd);
  let rawFiles = fg.sync(glob, {
    cwd,
    ignore: [...DEFAULT_IGNORE, ...ignorePatterns],
    dot: false,
    onlyFiles: true,
    followSymbolicLinks: false,
  });

  if (includeOnly.length > 0) {
    const allowedSet = new Set(
      includeOnly.flatMap(p => fg.sync(p, { cwd, dot: false, onlyFiles: true }))
    );
    rawFiles = rawFiles.filter(f => allowedSet.has(f));
  }

  const files: FileEntry[] = [];
  for (const f of rawFiles) {
    if (ig.ignores(f)) continue;
    if (isBinary(f)) continue;

    const fullPath = join(cwd, f);
    const entry: FileEntry = { path: f };

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
