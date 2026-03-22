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

const DEFAULT_IGNORE: string[] = [
  'node_modules/**', '.git/**', 'dist/**', 'build/**',
  '**/*.lock', 'package-lock.json', '.pfaf-state.json',
];

interface DiscoverFilesOptions {
  cwd: string;
  glob?: string;
  ignore?: string[];
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

export function discoverFiles({ cwd, glob = '**/*', ignore: ignorePatterns = [] }: DiscoverFilesOptions): DiscoverFilesResult {
  const ig = loadGitignore(cwd);
  const rawFiles = fg.sync(glob, {
    cwd,
    ignore: [...DEFAULT_IGNORE, ...ignorePatterns],
    dot: false,
    onlyFiles: true,
    followSymbolicLinks: false,
  });

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
