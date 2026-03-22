# PFAF (Prompt For All Files) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Claude Code plugin that runs any user-defined prompt on every file in a project, one file at a time via isolated subagents, guaranteeing no file is skipped.

**Architecture:** An MCP server (Node.js) tracks file processing state in `.pfaf-state.json` on disk. A Claude Code skill (`/pfaf`) orchestrates the loop: discover files → confirm → spawn one subagent per file → mark done. Each subagent gets its own isolated context window, solving the file-skipping problem at its root.

**Tech Stack:** Node.js 18+, `@modelcontextprotocol/sdk`, `fast-glob`, `ignore` (for .gitignore parsing), Jest (tests)

**Spec:** `docs/superpowers/specs/2026-03-22-pfaf-design.md`

---

## File Map

| File | Responsibility |
|---|---|
| `package.json` | Node.js project config, dependencies, test script |
| `mcp/state.js` | Read/write `.pfaf-state.json`; pure functions, no side effects except file I/O |
| `mcp/files.js` | Discover files via glob, apply gitignore, filter binaries, warn on large files |
| `mcp/tools.js` | MCP tool handler functions (`list_files`, `get_next_file`, `mark_done`, `get_progress`, `reset`) |
| `mcp/server.js` | MCP server entry point; wires SDK + tools; stdio transport |
| `mcp/state.test.js` | Unit tests for state.js |
| `mcp/files.test.js` | Unit tests for files.js |
| `mcp/tools.test.js` | Integration tests for tool handlers |
| `skills/pfaf/SKILL.md` | `/pfaf` slash command — orchestration logic for Claude |
| `.claude-plugin/plugin.json` | Plugin manifest |
| `.claude-plugin/marketplace.json` | Marketplace metadata |
| `.mcp.json` | MCP server config (project root) |
| `.gitignore` | Ignore node_modules, .pfaf-state.json, etc. |
| `README.md` | Installation and usage guide |

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `mcp/` directory structure

- [ ] **Step 1: Initialize git repo**

```bash
cd /home/yoonseooo71/Desktop/dev/project-refactoring-harness
git init
```

Expected: `Initialized empty Git repository`

- [ ] **Step 2: Create package.json**

Create `package.json`:

```json
{
  "name": "pfaf",
  "version": "1.0.0",
  "description": "Prompt For All Files — run any prompt on every file without skipping",
  "type": "module",
  "main": "mcp/server.js",
  "scripts": {
    "test": "node --experimental-vm-modules node_modules/.bin/jest --coverage",
    "start": "node mcp/server.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "fast-glob": "^3.3.2",
    "ignore": "^5.3.1"
  },
  "devDependencies": {
    "jest": "^29.7.0"
  },
  "jest": {
    "transform": {},
    "extensionsToTreatAsEsm": [".js"],
    "testEnvironment": "node"
  }
}
```

- [ ] **Step 3: Install dependencies**

```bash
cd /home/yoonseooo71/Desktop/dev/project-refactoring-harness
npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 4: Create .gitignore**

Create `.gitignore`:

```
node_modules/
.pfaf-state.json
coverage/
```

- [ ] **Step 5: Create directory structure**

```bash
mkdir -p mcp skills/pfaf .claude-plugin
```

- [ ] **Step 6: Commit scaffold**

```bash
git add package.json package-lock.json .gitignore
git commit -m "chore: initialize pfaf plugin project"
```

---

## Task 2: State Manager

**Files:**
- Create: `mcp/state.js`
- Create: `mcp/state.test.js`

The state manager is the source of truth. It reads and writes `.pfaf-state.json` in the current working directory. All functions are synchronous and accept an explicit `stateFilePath` argument for testability.

- [ ] **Step 1: Write failing tests**

Create `mcp/state.test.js`:

```js
import { readState, writeState, initState, markDone, getNextFile, getProgress, resetState } from './state.js';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let dir;
let statePath;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pfaf-'));
  statePath = join(dir, '.pfaf-state.json');
});

afterEach(() => {
  rmSync(dir, { recursive: true });
});

test('initState creates state file with all files as pending', () => {
  initState(statePath, { prompt: 'test', mode: 'sequential', glob: '**/*.js', files: ['a.js', 'b.js'] });
  const state = readState(statePath);
  expect(state.files['a.js']).toBe('pending');
  expect(state.files['b.js']).toBe('pending');
  expect(state.prompt).toBe('test');
});

test('getNextFile returns first pending file', () => {
  initState(statePath, { prompt: 'test', mode: 'sequential', glob: '**/*.js', files: ['a.js', 'b.js'] });
  expect(getNextFile(statePath)).toBe('a.js');
});

test('getNextFile returns null when all files done', () => {
  initState(statePath, { prompt: 'test', mode: 'sequential', glob: '**/*.js', files: ['a.js'] });
  markDone(statePath, 'a.js', 'done');
  expect(getNextFile(statePath)).toBeNull();
});

test('getNextFile with retry_failed returns failed files', () => {
  initState(statePath, { prompt: 'test', mode: 'sequential', glob: '**/*.js', files: ['a.js', 'b.js'] });
  markDone(statePath, 'a.js', 'failed');
  markDone(statePath, 'b.js', 'done');
  expect(getNextFile(statePath, true)).toBe('a.js');
});

test('getProgress returns correct counts', () => {
  initState(statePath, { prompt: 'test', mode: 'sequential', glob: '**/*.js', files: ['a.js', 'b.js', 'c.js'] });
  markDone(statePath, 'a.js', 'done');
  markDone(statePath, 'b.js', 'failed');
  const p = getProgress(statePath);
  expect(p).toEqual({ done: 1, pending: 1, failed: 1, total: 3 });
});

test('resetState with force=true clears the file', () => {
  initState(statePath, { prompt: 'test', mode: 'sequential', glob: '**/*.js', files: ['a.js'] });
  resetState(statePath, true);
  expect(existsSync(statePath)).toBe(false);
});

test('resetState with force=false throws if in-progress', () => {
  initState(statePath, { prompt: 'test', mode: 'sequential', glob: '**/*.js', files: ['a.js', 'b.js'] });
  expect(() => resetState(statePath, false)).toThrow('in-progress');
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --testPathPattern=state
```

Expected: FAIL — `Cannot find module './state.js'`

- [ ] **Step 3: Implement state.js**

Create `mcp/state.js`:

```js
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
```

- [ ] **Step 4: Run tests and verify they pass**

```bash
npm test -- --testPathPattern=state
```

Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add mcp/state.js mcp/state.test.js
git commit -m "feat: add state manager for .pfaf-state.json"
```

---

## Task 3: File Discovery

**Files:**
- Create: `mcp/files.js`
- Create: `mcp/files.test.js`

Discovers files via glob, filters by .gitignore, excludes binaries, warns on large files.

- [ ] **Step 1: Write failing tests**

Create `mcp/files.test.js`:

```js
import { discoverFiles } from './files.js';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let dir;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pfaf-files-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true });
});

function touch(relPath, content = 'hello') {
  const full = join(dir, relPath);
  mkdirSync(full.replace(/\/[^/]+$/, ''), { recursive: true });
  writeFileSync(full, content);
}

test('discovers .ts files matching glob', () => {
  touch('src/a.ts');
  touch('src/b.ts');
  touch('src/c.js');
  const result = discoverFiles({ cwd: dir, glob: '**/*.ts' });
  expect(result.files.map(f => f.path)).toEqual(
    expect.arrayContaining(['src/a.ts', 'src/b.ts'])
  );
  expect(result.files.map(f => f.path)).not.toContain('src/c.js');
});

test('excludes node_modules by default', () => {
  touch('node_modules/lib/index.js');
  touch('src/app.js');
  const result = discoverFiles({ cwd: dir, glob: '**/*.js' });
  expect(result.files.map(f => f.path)).not.toContain('node_modules/lib/index.js');
});

test('respects .gitignore', () => {
  writeFileSync(join(dir, '.gitignore'), 'dist/\n');
  touch('dist/bundle.js');
  touch('src/app.js');
  const result = discoverFiles({ cwd: dir, glob: '**/*.js' });
  expect(result.files.map(f => f.path)).not.toContain('dist/bundle.js');
  expect(result.files.map(f => f.path)).toContain('src/app.js');
});

test('excludes binary files by extension', () => {
  touch('assets/logo.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  touch('src/app.js');
  const result = discoverFiles({ cwd: dir, glob: '**/*' });
  expect(result.files.map(f => f.path)).not.toContain('assets/logo.png');
});

test('flags files over 500 lines with warning', () => {
  const bigContent = Array(600).fill('line').join('\n');
  touch('src/big.ts', bigContent);
  const result = discoverFiles({ cwd: dir, glob: '**/*.ts' });
  const big = result.files.find(f => f.path === 'src/big.ts');
  expect(big.warning).toMatch(/500/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --testPathPattern=files
```

Expected: FAIL — `Cannot find module './files.js'`

- [ ] **Step 3: Implement files.js**

Create `mcp/files.js`:

```js
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

export function discoverFiles({ cwd, glob = '**/*', ignore = [] }) {
  const ig = loadGitignore(cwd);
  const rawFiles = fg.sync(glob, {
    cwd,
    ignore: [...DEFAULT_IGNORE, ...ignore],
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
```

- [ ] **Step 4: Run tests and verify they pass**

```bash
npm test -- --testPathPattern=files
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add mcp/files.js mcp/files.test.js
git commit -m "feat: add file discovery with gitignore and binary filtering"
```

---

## Task 4: MCP Tool Handlers

**Files:**
- Create: `mcp/tools.js`
- Create: `mcp/tools.test.js`

Thin adapter layer that connects MCP tool calls to `state.js` and `files.js`. Each handler receives validated input and the current working directory.

- [ ] **Step 1: Write failing tests**

Create `mcp/tools.test.js`:

```js
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { handleListFiles, handleGetNextFile, handleMarkDone, handleGetProgress, handleReset } from './tools.js';

let dir;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pfaf-tools-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true });
});

function touch(relPath) {
  const full = join(dir, relPath);
  writeFileSync(full, 'content');
}

test('handleListFiles initializes state and returns file list', async () => {
  touch('a.js');
  touch('b.js');
  const result = await handleListFiles({ glob: '**/*.js' }, dir);
  expect(result.total).toBe(2);
  expect(result.files).toHaveLength(2);
});

test('handleGetNextFile returns first pending file after list', async () => {
  touch('a.js');
  await handleListFiles({ glob: '**/*.js' }, dir);
  const file = await handleGetNextFile({}, dir);
  expect(file).toBe('a.js');
});

test('handleMarkDone marks file and handleGetNextFile skips it', async () => {
  touch('a.js');
  touch('b.js');
  await handleListFiles({ glob: '**/*.js' }, dir);
  await handleMarkDone({ file: 'a.js', status: 'done' }, dir);
  const next = await handleGetNextFile({}, dir);
  expect(next).toBe('b.js');
});

test('handleGetProgress returns correct counts', async () => {
  touch('a.js');
  touch('b.js');
  await handleListFiles({ glob: '**/*.js' }, dir);
  await handleMarkDone({ file: 'a.js', status: 'done' }, dir);
  const p = await handleGetProgress({}, dir);
  expect(p.done).toBe(1);
  expect(p.pending).toBe(1);
  expect(p.total).toBe(2);
});

test('handleReset with force clears state', async () => {
  touch('a.js');
  await handleListFiles({ glob: '**/*.js' }, dir);
  await handleMarkDone({ file: 'a.js', status: 'done' }, dir);
  const result = await handleReset({ force: true }, dir);
  expect(result.ok).toBe(true);
});

test('handleReset without force throws when in-progress', async () => {
  touch('a.js');
  touch('b.js');
  await handleListFiles({ glob: '**/*.js' }, dir);
  await handleMarkDone({ file: 'a.js', status: 'done' }, dir);
  await expect(handleReset({ force: false }, dir)).rejects.toThrow('in-progress');
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --testPathPattern=tools
```

Expected: FAIL — `Cannot find module './tools.js'`

- [ ] **Step 3: Implement tools.js**

Create `mcp/tools.js`:

```js
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
```

- [ ] **Step 4: Run tests and verify they pass**

```bash
npm test -- --testPathPattern=tools
```

Expected: All 6 tests PASS.

- [ ] **Step 5: Run full test suite**

```bash
npm test
```

Expected: All 18 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add mcp/tools.js mcp/tools.test.js
git commit -m "feat: add MCP tool handler functions"
```

---

## Task 5: MCP Server Entry Point

**Files:**
- Create: `mcp/server.js`

Wires the `@modelcontextprotocol/sdk` server with the tool handlers. Uses stdio transport (standard for Claude Code MCP plugins).

- [ ] **Step 1: Create server.js**

Create `mcp/server.js`:

```js
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { handleListFiles, handleGetNextFile, handleMarkDone, handleGetProgress, handleReset } from './tools.js';

const cwd = process.cwd();

const server = new Server(
  { name: 'pfaf', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'list_files',
      description: 'Discover files matching a glob pattern and initialize tracking state.',
      inputSchema: {
        type: 'object',
        properties: {
          glob: { type: 'string', description: 'Glob pattern (e.g. **/*.ts). Default: **/*' },
          ignore: { type: 'array', items: { type: 'string' }, description: 'Additional patterns to ignore' },
          prompt: { type: 'string', description: 'The user prompt to store in state (used by retry-failed)' },
          mode: { type: 'string', enum: ['sequential', 'parallel'], description: 'Execution mode' },
        },
      },
    },
    {
      name: 'get_next_file',
      description: 'Return the path of the next unprocessed file, or null if all files are done.',
      inputSchema: {
        type: 'object',
        properties: {
          retry_failed: { type: 'boolean', description: 'If true, return next failed file instead of next pending file' },
        },
      },
    },
    {
      name: 'mark_done',
      description: 'Mark a file as done or failed.',
      inputSchema: {
        type: 'object',
        required: ['file', 'status'],
        properties: {
          file: { type: 'string' },
          status: { type: 'string', enum: ['done', 'failed'] },
        },
      },
    },
    {
      name: 'get_progress',
      description: 'Return current processing progress.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'reset',
      description: 'Clear all tracking state. Requires force=true if a run is in progress.',
      inputSchema: {
        type: 'object',
        properties: {
          force: { type: 'boolean' },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    let result;
    if (name === 'list_files') result = await handleListFiles(args, cwd);
    else if (name === 'get_next_file') result = await handleGetNextFile(args, cwd);
    else if (name === 'mark_done') result = await handleMarkDone(args, cwd);
    else if (name === 'get_progress') result = await handleGetProgress(args, cwd);
    else if (name === 'reset') result = await handleReset(args, cwd);
    else throw new Error(`Unknown tool: ${name}`);

    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  } catch (err) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

- [ ] **Step 2: Smoke test the server starts**

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node mcp/server.js
```

Expected: JSON response listing the 5 tools.

- [ ] **Step 3: Commit**

```bash
git add mcp/server.js
git commit -m "feat: add MCP server entry point with stdio transport"
```

---

## Task 6: Plugin Manifest Files

**Files:**
- Create: `.claude-plugin/plugin.json`
- Create: `.claude-plugin/marketplace.json`
- Create: `.mcp.json`

- [ ] **Step 1: Create plugin.json**

Create `.claude-plugin/plugin.json`:

```json
{
  "name": "pfaf",
  "version": "1.0.0",
  "description": "Prompt For All Files — run any prompt on every file without skipping",
  "author": "your-github-username",
  "repository": "https://github.com/<user>/pfaf",
  "license": "MIT",
  "skills": "./skills/",
  "mcpServers": "./.mcp.json"
}
```

- [ ] **Step 2: Create marketplace.json**

Create `.claude-plugin/marketplace.json`:

```json
{
  "name": "pfaf",
  "description": "Run any prompt on every file in your project without skipping",
  "owner": { "name": "your-name", "email": "you@example.com" },
  "plugins": [{
    "name": "pfaf",
    "description": "Prompt For All Files — guarantees no file is skipped",
    "version": "1.0.0",
    "source": "./"
  }]
}
```

- [ ] **Step 3: Create .mcp.json (project root)**

Create `.mcp.json`:

```json
{
  "mcpServers": {
    "pfaf": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/mcp/server.js"]
    }
  }
}
```

Note: `${CLAUDE_PLUGIN_ROOT}` is injected by Claude Code at plugin load time. If it doesn't resolve, fall back to a relative path: `"./mcp/server.js"`.

- [ ] **Step 4: Commit**

```bash
git add .claude-plugin/ .mcp.json
git commit -m "feat: add plugin manifest and marketplace metadata"
```

---

## Task 7: SKILL.md

**Files:**
- Create: `skills/pfaf/SKILL.md`

This is the brain of the plugin — the instructions Claude follows when `/pfaf` is invoked.

- [ ] **Step 1: Create SKILL.md**

Create `skills/pfaf/SKILL.md`:

```markdown
---
name: pfaf
description: >
  Use this skill when the user types "/pfaf" or asks to run a prompt on all
  files in the project. Runs the prompt on every file individually using
  subagents to prevent skipping or quality degradation.
---

# PFAF — Prompt For All Files

You are orchestrating a file-by-file prompt execution. Your job is to:
1. Collect the prompt and configuration from the user
2. Discover files via the pfaf MCP server
3. Process each file with an isolated subagent
4. Track progress and report results

## Step-by-step Instructions

### 1. Collect prompt

If the user provided an argument to `/pfaf`, use it as the prompt.
If not, ask: "어떤 작업을 모든 파일에 실행할까요?"

Reject empty prompts with: "프롬프트가 비어 있습니다. 실행할 작업을 입력해주세요."

### 2. Collect file glob (optional)

Ask: "파일 범위를 지정하세요 (기본: 모든 텍스트 파일, .gitignore 적용 — 엔터로 건너뜀)"

If user presses enter / provides nothing, use `**/*` as the default.

### 3. Discover files

Call MCP tool `list_files` with the glob. Show the result:
- "총 N개 파일 발견." + any warnings for large files
- If 0 files found: "파일을 찾을 수 없습니다. glob 패턴을 확인해주세요." and stop.

### 4. Choose execution mode

Ask: "실행 방식: [1] 순차 (안전, 결과 확인 가능)  [2] 병렬 (빠름)"

Ask: "시작할까요? (y/n)"
If n: stop.

### 5. Execute

**Sequential mode:**
Loop until `get_next_file()` returns null:
  1. Call `get_next_file()`
  2. If null → break
  3. Spawn Agent with this exact prompt:
     ```
     Apply the following task to the file at path: [FILE_PATH]

     TASK: [USER_PROMPT]

     Instructions:
     1. Read the file using the Read tool
     2. Apply the task to the file content
     3. If changes are needed, use the Edit tool to apply them
     4. If no changes are needed, say "no changes needed"
     5. Report: "done" or "failed: [reason]"
     ```
  4. If agent reports success → call `mark_done(file, "done")`
  5. If agent fails → call `mark_done(file, "failed")`
  6. Show progress: `[N/total] file_path... ✓` or `[N/total] file_path... ✗`

**Parallel mode:**
Spawn up to 5 agents simultaneously using the same prompt template above.
Await all 5, mark each done/failed, then spawn the next batch.

### 6. Summary

After the loop ends:
- Call `get_progress()` and show:
  ```
  완료: X파일 ✓  실패: Y파일 ✗  총계: Z파일
  ```
- If any failed: "실패한 파일을 재시도하려면 `/pfaf retry-failed`를 실행하세요."

---

## Subcommands

**`/pfaf resume`**
- Skip steps 1-4
- Call `get_next_file()` directly
- If null → "이미 모든 파일이 처리되었습니다."
- Otherwise → continue the loop from Step 5

**`/pfaf status`**
- Call `get_progress()` and display the result

**`/pfaf reset`**
- Ask: "현재 진행 상태가 초기화됩니다. 계속할까요? (y/n)"
- If y → call `reset(force=true)`
- If n → cancel

**`/pfaf retry-failed`**
- Loop calling `get_next_file(retry_failed=true)` until null
- Process each with the same subagent template, using the stored prompt from state
```

- [ ] **Step 2: Commit**

```bash
git add skills/pfaf/SKILL.md
git commit -m "feat: add /pfaf skill with orchestration logic"
```

---

## Task 8: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create README.md**

Create `README.md`:

```markdown
# pfaf — Prompt For All Files

A Claude Code plugin that runs any prompt on every file in your project — guaranteed, no skipping.

## The Problem

When you ask Claude to apply a change across an entire project, it tends to skip or abbreviate files as the context window fills up. PFAF solves this by processing each file with an isolated subagent and tracking progress on disk.

## Installation

```bash
claude plugin marketplace add https://github.com/<user>/pfaf.git
claude plugin install pfaf@pfaf
```

## Usage

```bash
# Run a prompt on all files (interactive)
/pfaf

# Run a prompt directly
/pfaf "각 파일의 console.log를 모두 제거해줘"

# Check progress
/pfaf status

# Resume an interrupted run
/pfaf resume

# Retry failed files
/pfaf retry-failed

# Reset state
/pfaf reset
```

## How It Works

1. `/pfaf` discovers files matching your glob pattern
2. Each file is processed by an independent subagent with its own context window
3. Progress is tracked in `.pfaf-state.json` (gitignored)
4. If interrupted, resume with `/pfaf resume`

## Requirements

- Node.js 18+
- Claude Code with plugin support
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with installation and usage guide"
```

---

## Task 9: End-to-End Smoke Test

Verify the full plugin works together: MCP server starts, tools respond, state persists.

- [ ] **Step 1: Run full test suite one final time**

```bash
npm test
```

Expected: All 18 tests PASS, coverage reported.

- [ ] **Step 2: Manual smoke test — MCP server tools/list**

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node mcp/server.js
```

Expected: JSON with 5 tools: `list_files`, `get_next_file`, `mark_done`, `get_progress`, `reset`.

- [ ] **Step 3: Manual smoke test — list_files on this repo**

```bash
printf '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_files","arguments":{"glob":"**/*.js"}}}\n' | node mcp/server.js
```

Expected: JSON response with `files` array and `total` count.

- [ ] **Step 4: Verify git log**

```bash
git log --oneline
```

Expected output (in reverse order):
```
docs: add README with installation and usage guide
feat: add /pfaf skill with orchestration logic
feat: add plugin manifest and marketplace metadata
feat: add MCP server entry point with stdio transport
feat: add MCP tool handler functions
feat: add file discovery with gitignore and binary filtering
feat: add state manager for .pfaf-state.json
chore: initialize pfaf plugin project
```

- [ ] **Step 5: Final commit (plan doc)**

```bash
git add docs/
git commit -m "docs: add design spec and implementation plan"
```

---

## Notes for Implementer

- **MCP SDK version:** Check `npm show @modelcontextprotocol/sdk version` — if >1.0, import paths may differ. Check the SDK's README.
- **`${CLAUDE_PLUGIN_ROOT}`:** If this env var isn't injected, replace it with `process.env.CLAUDE_PLUGIN_ROOT || '.'` in `.mcp.json` args, or use a relative path.
- **ESM:** The project uses `"type": "module"` — all imports must use `.js` extensions and `import`/`export` syntax.
- **Jest + ESM:** Requires `--experimental-vm-modules`. The `package.json` test script includes this flag.
