import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'fs';

export type FileStatus = 'pending' | 'done' | 'failed';
export type GroupBy = 'file' | 'folder';

interface RunState {
  prompt: string;
  mode: string;
  glob: string;
  groupBy: GroupBy;
  startedAt: string;
  files: Record<string, FileStatus>;
  folderContents?: Record<string, string[]>;
}

interface InitStateOptions {
  prompt: string;
  mode: string;
  glob: string;
  groupBy: GroupBy;
  files: string[];
  folderContents?: Record<string, string[]>;
}

interface Progress {
  done: number;
  pending: number;
  failed: number;
  total: number;
}

export function readState(statePath: string): RunState | null {
  if (!existsSync(statePath)) return null;
  try {
    return JSON.parse(readFileSync(statePath, 'utf8')) as RunState;
  } catch {
    return null;
  }
}

export function writeState(statePath: string, state: RunState): void {
  writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
}

export function initState(statePath: string, opts: InitStateOptions): void {
  const state: RunState = {
    prompt: opts.prompt,
    mode: opts.mode,
    glob: opts.glob,
    groupBy: opts.groupBy,
    startedAt: new Date().toISOString(),
    files: Object.fromEntries(opts.files.map(f => [f, 'pending' as FileStatus])),
    ...(opts.folderContents ? { folderContents: opts.folderContents } : {}),
  };
  writeState(statePath, state);
}

export function markDone(statePath: string, file: string, status: FileStatus): void {
  const state = readState(statePath);
  if (!state) throw new Error('No active run. Call list_files first.');
  state.files[file] = status;
  writeState(statePath, state);
}

export function getNextFile(statePath: string, retryFailed: boolean = false): string | null {
  const state = readState(statePath);
  if (!state) return null;
  const target: FileStatus = retryFailed ? 'failed' : 'pending';
  const entry = Object.entries(state.files).find(([, s]) => s === target);
  return entry ? entry[0] : null;
}

export function getGroupBy(statePath: string): GroupBy {
  return readState(statePath)?.groupBy ?? 'file';
}

export function getFolderContents(statePath: string, folder: string): string[] {
  return readState(statePath)?.folderContents?.[folder] ?? [];
}

export function getProgress(statePath: string): Progress {
  const state = readState(statePath);
  if (!state) return { done: 0, pending: 0, failed: 0, total: 0 };
  const counts = Object.values(state.files).reduce<Record<FileStatus, number>>(
    (acc, s) => { acc[s] = (acc[s] || 0) + 1; return acc; },
    { pending: 0, done: 0, failed: 0 }
  );
  const total = Object.keys(state.files).length;
  return {
    done: counts.done,
    pending: counts.pending,
    failed: counts.failed,
    total,
  };
}

export function resetState(statePath: string, force: boolean = false): void {
  if (!force) {
    const state = readState(statePath);
    if (state) {
      const hasPending = Object.values(state.files).some(s => s === 'pending');
      if (hasPending) throw new Error('Run is in-progress. Use force=true to reset.');
    }
  }
  if (existsSync(statePath)) unlinkSync(statePath);
}
