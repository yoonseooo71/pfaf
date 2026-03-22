import { join } from 'path';
import { discoverFiles } from './files.js';
import { initState, getNextFile, markDone, getProgress, resetState } from './state.js';

type FileStatus = 'pending' | 'done' | 'failed';

interface ListFilesArgs {
  glob?: string;
  ignore?: string[];
  prompt?: string;
  mode?: string;
}

interface ListFilesResult {
  files: string[];
  total: number;
  warnings: Array<{ path: string; warning: string }>;
}

interface GetNextFileArgs {
  retry_failed?: boolean;
}

interface MarkDoneArgs {
  file: string;
  status: FileStatus;
}

interface MarkDoneResult {
  ok: true;
}

interface ResetArgs {
  force?: boolean;
}

interface ResetResult {
  ok: true;
}

function statePath(cwd: string): string {
  return join(cwd, '.pfaf-state.json');
}

export async function handleListFiles(
  { glob = '**/*', ignore = [], prompt = '', mode = 'sequential' }: ListFilesArgs,
  cwd: string
): Promise<ListFilesResult> {
  const { files, total } = discoverFiles({ cwd, glob, ignore });
  initState(statePath(cwd), {
    prompt,
    mode,
    glob,
    files: files.map(f => f.path),
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
): Promise<string | null> {
  return getNextFile(statePath(cwd), retry_failed);
}

export async function handleMarkDone(
  { file, status }: MarkDoneArgs,
  cwd: string
): Promise<MarkDoneResult> {
  markDone(statePath(cwd), file, status);
  return { ok: true };
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
): Promise<ResetResult> {
  resetState(statePath(cwd), force);
  return { ok: true };
}
