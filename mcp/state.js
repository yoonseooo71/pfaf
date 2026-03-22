import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'fs';

export function readState(statePath) {
  if (!existsSync(statePath)) return null;
  return JSON.parse(readFileSync(statePath, 'utf8'));
}

export function writeState(statePath, state) {
  writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
}

export function initState(statePath, { prompt, mode, glob, files }) {
  const state = {
    prompt,
    mode,
    glob,
    startedAt: new Date().toISOString(),
    files: Object.fromEntries(files.map(f => [f, 'pending'])),
  };
  writeState(statePath, state);
}

export function markDone(statePath, file, status) {
  const state = readState(statePath);
  state.files[file] = status;
  writeState(statePath, state);
}

export function getNextFile(statePath, retryFailed = false) {
  const state = readState(statePath);
  if (!state) return null;
  const target = retryFailed ? 'failed' : 'pending';
  const entry = Object.entries(state.files).find(([, s]) => s === target);
  return entry ? entry[0] : null;
}

export function getProgress(statePath) {
  const state = readState(statePath);
  if (!state) return { done: 0, pending: 0, failed: 0, total: 0 };
  const counts = Object.values(state.files).reduce(
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

export function resetState(statePath, force = false) {
  if (!force) {
    const state = readState(statePath);
    if (state) {
      const hasPending = Object.values(state.files).some(s => s === 'pending');
      if (hasPending) throw new Error('Run is in-progress. Use force=true to reset.');
    }
  }
  if (existsSync(statePath)) unlinkSync(statePath);
}
