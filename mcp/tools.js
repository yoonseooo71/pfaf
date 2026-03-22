import { join } from 'path';
import { discoverFiles } from './files.js';
import { initState, getNextFile, markDone, getProgress, resetState } from './state.js';

function statePath(cwd) {
  return join(cwd, '.pfaf-state.json');
}

export async function handleListFiles({ glob = '**/*', ignore = [], prompt = '', mode = 'sequential' }, cwd) {
  const { files, total } = discoverFiles({ cwd, glob, ignore });
  initState(statePath(cwd), {
    prompt,
    mode,
    glob,
    files: files.map(f => f.path),
  });
  return { files: files.map(f => f.path), total, warnings: files.filter(f => f.warning).map(f => ({ path: f.path, warning: f.warning })) };
}

export async function handleGetNextFile({ retry_failed = false }, cwd) {
  return getNextFile(statePath(cwd), retry_failed);
}

export async function handleMarkDone({ file, status }, cwd) {
  markDone(statePath(cwd), file, status);
  return { ok: true };
}

export async function handleGetProgress(_args, cwd) {
  return getProgress(statePath(cwd));
}

export async function handleReset({ force = false }, cwd) {
  resetState(statePath(cwd), force);
  return { ok: true };
}
