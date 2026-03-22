import { join, dirname } from 'path';
import { discoverFiles } from './files.js';
import { initState, getNextFile, getGroupBy, getFolderContents, markDone, getProgress, resetState } from './state.js';
import type { FileStatus } from './state.js';

interface ListFilesArgs {
  glob?: string;
  ignore?: string[];
  prompt?: string;
  mode?: string;
  group_by?: 'file' | 'folder';
}

interface ListFilesResult {
  files: string[];
  total: number;
  warnings: Array<{ path: string; warning: string }>;
}

interface GetNextFileArgs {
  retry_failed?: boolean;
}

export interface FolderEntry {
  folder: string;
  files: string[];
}

interface MarkDoneArgs {
  file: string;
  status: FileStatus;
}

interface OkResult {
  ok: true;
}

interface ResetArgs {
  force?: boolean;
}

function statePath(cwd: string): string {
  return join(cwd, '.pfaf-state.json');
}

export async function handleListFiles(
  { glob = '**/*', ignore = [], prompt = '', mode = 'sequential', group_by = 'file' }: ListFilesArgs,
  cwd: string
): Promise<ListFilesResult> {
  const { files, total } = discoverFiles({ cwd, glob, ignore });

  let keys: string[];
  let folderContents: Record<string, string[]> | undefined;

  if (group_by === 'folder') {
    folderContents = {};
    for (const f of files) {
      const folder = dirname(f.path) || '.';
      if (!folderContents[folder]) folderContents[folder] = [];
      folderContents[folder].push(f.path);
    }
    keys = Object.keys(folderContents);
  } else {
    keys = files.map(f => f.path);
  }

  initState(statePath(cwd), {
    prompt,
    mode,
    glob,
    groupBy: group_by,
    files: keys,
    folderContents,
  });

  return {
    files: files.map(f => f.path),
    total,
    warnings: files
      .filter(f => f.warning)
      .map(f => ({ path: f.path, warning: f.warning as string })),
  };
}

export async function handleGetNextFile(
  { retry_failed = false }: GetNextFileArgs,
  cwd: string
): Promise<string | FolderEntry | null> {
  const sp = statePath(cwd);
  const next = getNextFile(sp, retry_failed);
  if (!next) return null;

  if (getGroupBy(sp) === 'folder') {
    return { folder: next, files: getFolderContents(sp, next) };
  }
  return next;
}

export async function handleMarkDone(
  { file, status }: MarkDoneArgs,
  cwd: string
): Promise<OkResult> {
  markDone(statePath(cwd), file, status);
  return { ok: true };
}

export async function handleGetProgress(
  _args: Record<string, unknown>,
  cwd: string
): Promise<ReturnType<typeof getProgress>> {
  return getProgress(statePath(cwd));
}

export async function handleReset(
  { force = false }: ResetArgs,
  cwd: string
): Promise<OkResult> {
  resetState(statePath(cwd), force);
  return { ok: true };
}
