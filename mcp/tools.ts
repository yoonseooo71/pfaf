import { join, dirname } from 'path';
import { discoverFiles, getChangedFiles } from './files.js';
import { readState, initState, getNextFile, getGroupBy, getFolderContents, markDone, getProgress, getFailures, resetState } from './state.js';
import type { FailureEntry, FileStatus } from './state.js';

// --- Types ---

interface ListFilesArgs {
  glob?: string;
  ignore?: string[];
  prompt?: string;
  mode?: string;
  group_by?: 'file' | 'folder';
  batch_size?: number;
  model?: string;
  dry_run?: boolean;
  changed_only?: boolean;
  include_only?: string[];
}

interface ListFilesResult {
  files: string[];
  total: number;
  warnings: Array<{ path: string; warning: string }>;
  dry_run?: true;
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
  reason?: string;
}

interface OkResult {
  ok: true;
}

interface ResetArgs {
  force?: boolean;
}

// --- Public functions ---

export async function handleListFiles(
  { glob = '**/*', ignore = [], prompt = '', mode = 'sequential', group_by = 'file', batch_size, model, dry_run = false, changed_only = false, include_only = [] }: ListFilesArgs,
  cwd: string
): Promise<ListFilesResult> {
  let { files } = discoverFiles({ cwd, glob, ignore, includeOnly: include_only });

  if (changed_only) {
    const changed = getChangedFiles(cwd);
    files = files.filter(f => changed.has(f.path));
  }

  const total = files.length;

  if (!dry_run) {
    const existing = readState(statePath(cwd));
    if (existing) {
      const hasPending = Object.values(existing.files).some(s => s === 'pending');
      if (hasPending) {
        throw new Error('A run is already in progress. Call reset(force=true) before starting a new run.');
      }
      if (existing.model && model && existing.model !== model) {
        throw new Error(`Model is locked to "${existing.model}" for this run. Use reset(force=true) to start a new run.`);
      }
    }

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
      batchSize: batch_size,
      model,
      files: keys,
      folderContents,
    });
  }

  return {
    files: files.map(f => f.path),
    total,
    warnings: files
      .filter(f => f.warning)
      .map(f => ({ path: f.path, warning: f.warning as string })),
    ...(dry_run ? { dry_run: true as const } : {}),
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
  { file, status, reason }: MarkDoneArgs,
  cwd: string
): Promise<OkResult> {
  markDone(statePath(cwd), file, status, reason);
  return { ok: true };
}

export async function handleGetFailures(
  _args: Record<string, never>,
  cwd: string
): Promise<FailureEntry[]> {
  return getFailures(statePath(cwd));
}

export async function handleGetProgress(
  _args: Record<string, never>,
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

// --- Helpers ---

function statePath(cwd: string): string {
  return join(cwd, '.pfaf-state.json');
}
