import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'fs';

type FileStatus = 'pending' | 'done' | 'failed';

interface RunState {
  prompt: string;
  mode: string;
  glob: string;
  startedAt: string;
  files: Record<string, FileStatus>;
}

interface InitStateOptions {
  prompt: string;
  mode: string;
  glob: string;
  files: string[];
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

export function initState(statePath: string, { prompt, mode, glob, files }: InitStateOptions): void {
  const state: RunState = {
    prompt,
    mode,
    glob,
    startedAt: new Date().toISOString(),
    files: Object.fromEntries(files.map(f => [f, 'pending' as FileStatus])),
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

export function getProgress(statePath: string): Progress {
  const state = readState(statePath);
  if (!state) return { done: 0, pending: 0, failed: 0, total: 0 };
  const counts = Object.values(state.files).reduce<Record<string, number>>(
    (acc, s) => { acc[s] = (acc[s] || 0) + 1; return acc; },
    {}
  );
  const total = Object.keys(state.files).length;
  return {
    done: counts.done || 0,
    pending: counts.pending || 0,
    failed: counts.failed || 0,
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
