# PFAF — Prompt For All Files

A Claude Code plugin that guarantees every file in your project receives a prompt — no skipping, no abbreviations, no context window limits.

## The Problem

When you ask Claude to apply a change across your entire project, it tries to handle everything in a single context window. As the window fills up, Claude starts skipping files or abbreviating work with "handled similarly." PFAF solves this by giving each file an isolated context window via independent subagents, with all progress tracked on disk.

## Installation

First, ensure you have [Claude Code](https://www.anthropic.com/claude-code) installed.

```bash
claude plugin marketplace add https://github.com/yoonseooo71/pfaf.git
claude plugin install pfaf@pfaf
```

This activates the `/pfaf` slash command in Claude Code.

## Requirements

- Node.js 18+
- Claude Code with plugin support

## Usage

### Interactive Mode

Start with no arguments to be guided through configuration:

```bash
/pfaf
```

You'll be asked:
1. **What task to run** — the prompt applied to every file
2. **File glob pattern** — e.g., `**/*.ts`, or press Enter for all files
3. **Group by** — process files individually or by folder
4. **Changed files only** — optionally filter to git-changed files
5. **Dry-run preview** — see target files without running
6. **Execution mode** — sequential (safe) or parallel (fast)
7. **Confirmation** — proceed or cancel

### Direct Invocation

Pass the prompt as an argument to skip interactive prompts:

```bash
/pfaf "remove all console.log statements"
```

### Subcommands

| Command | Purpose |
|---------|---------|
| `/pfaf resume` | Resume an interrupted run from the last pending file |
| `/pfaf status` | Show progress bar and completion summary |
| `/pfaf reset` | Clear state and cancel the current run |
| `/pfaf retry-failed` | Re-run only files that failed |
| `/pfaf ci <prompt>` | Non-interactive CI mode (defaults: sequential, all files, no confirm) |

## How It Works

### Architecture

```
User: /pfaf "remove all console.log"
  ↓
[SKILL.md Orchestrator]
  ├── list_files() → discover all target files
  ├── show preview → "23 files found. Sequential or parallel?"
  └── Loop until get_next_file() → null:
        ├── Spawn subagent: "Apply prompt to file X"
        ├── Subagent reads file, makes changes, reports done/failed
        ├── Orchestrator calls mark_done(file, status)
        └── Display progress: [2/23] src/app.ts... ✓
```

### Key Design: Why Files Cannot Be Skipped

All file state lives in `.pfaf-state.json` on disk, not in Claude's context window:

```json
{
  "prompt": "remove all console.log",
  "mode": "sequential",
  "glob": "**/*.ts",
  "groupBy": "file",
  "batchSize": 5,
  "startedAt": "2026-03-22T10:00:00Z",
  "files": {
    "src/app.ts": "done",
    "src/utils.ts": "done",
    "src/index.ts": "pending",
    "src/types.ts": "pending"
  }
}
```

Each call to `get_next_file()` queries this file-of-truth and returns the next pending item. As long as the state file exists, no file can be skipped, even if the orchestrator's context grows.

### Execution Modes

**Sequential:** One subagent at a time, files processed one after another. Safe and inspectable. Shows progress after each file.

**Parallel:** Multiple subagents spawn simultaneously (default batch: 5). Faster for large projects. The MCP server serializes `get_next_file()` calls to prevent collisions.

### Folder Mode

Optionally group files by folder. Each folder is processed by one subagent with access to all files in that folder. Useful for cross-file refactors that require understanding the full context of a directory.

```
/pfaf (user chooses group_by=folder)
  └── Subagent 1: "Apply prompt to src/ folder" → reads all src/* files together
  └── Subagent 2: "Apply prompt to tests/ folder" → reads all tests/* files together
```

## Configuration Options

### `list_files` Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `glob` | string | `**/*` | Glob pattern for files to target (e.g., `**/*.ts`) |
| `ignore` | string[] | — | Additional patterns to exclude (in addition to `.gitignore` and built-in defaults) |
| `prompt` | string | — | The user prompt (stored in state for `/pfaf resume` and `/pfaf retry-failed`) |
| `mode` | string | `sequential` | Execution mode: `sequential` or `parallel` |
| `group_by` | string | `file` | Grouping: `file` (individual files) or `folder` (grouped by folder) |
| `batch_size` | number | 5 | Max subagents to spawn in parallel mode |
| `dry_run` | boolean | false | If true, discover files without initializing state (preview only) |
| `changed_only` | boolean | false | If true, only include files changed since last git commit (`git diff HEAD`) |
| `include_only` | string[] | — | Whitelist glob patterns — only files matching at least one pattern are included |

### File Filtering (Built-In)

PFAF automatically excludes:
- Anything in `.gitignore`
- `node_modules/`, `.git/`, `dist/`, `build/`, `.pfaf-state.json`
- Lock files: `*.lock`, `package-lock.json`
- Binary files by extension: images, fonts, archives, compiled files, media, etc.

### Warnings

- **Files over 500 lines:** A warning is shown at preview time, but the file is included. The user can proceed or adjust the glob pattern.
- **Large prompts on many files:** Sequential mode is recommended for safety; parallel mode is faster but less inspectable.

## MCP Tools Reference

The `/pfaf` skill communicates with the MCP server via these tools:

### `list_files`

Discover files matching a glob pattern and initialize tracking state.

**Parameters:**
- `glob` (string): Glob pattern (default: `**/*`)
- `ignore` (string[]): Additional patterns to exclude
- `prompt` (string): User prompt (stored for resume/retry)
- `mode` (string): `sequential` or `parallel`
- `group_by` (string): `file` or `folder`
- `batch_size` (number): Parallel batch size
- `dry_run` (boolean): Preview only, no state init
- `changed_only` (boolean): Include only git-changed files
- `include_only` (string[]): Whitelist glob patterns

**Response:**
```json
{
  "files": ["src/app.ts", "src/utils.ts"],
  "total": 2,
  "warnings": [
    { "path": "src/big.ts", "warning": "File has 600 lines (>500)" }
  ]
}
```

### `get_next_file`

Return the next unprocessed item. Returns null when all done.

**Parameters:**
- `retry_failed` (boolean): If true, return next failed file instead of next pending

**Response (file mode):**
```json
"src/app.ts"
```

**Response (folder mode):**
```json
{
  "folder": "src",
  "files": ["src/app.ts", "src/utils.ts"]
}
```

### `mark_done`

Mark a file or folder as done or failed.

**Parameters:**
- `file` (string): File or folder path
- `status` (string): `done` or `failed`
- `reason` (string, optional): Failure reason (stored when status=failed)

**Response:**
```json
{ "ok": true }
```

### `get_failures`

Return list of failed files with their failure reasons.

**Parameters:** (none)

**Response:**
```json
[
  { "file": "src/broken.ts", "reason": "SyntaxError: unexpected token" },
  { "file": "src/missing.ts", "reason": "File not found" }
]
```

### `get_progress`

Return current processing progress.

**Parameters:** (none)

**Response:**
```json
{
  "done": 5,
  "pending": 3,
  "failed": 1,
  "total": 9,
  "batchSize": 5,
  "bar": "[████████░░░░░░░░] 5/9 (56%)"
}
```

### `reset`

Clear all tracking state.

**Parameters:**
- `force` (boolean): If true, force reset even if in-progress

**Response:**
```json
{ "ok": true }
```

## Examples

### Example 1: Remove Console Logs

```bash
/pfaf "remove all console.log statements and debug logging"
> 어떤 작업을 모든 파일에 실행할까요?
  (Already provided as argument, skipped)
> 파일 범위를 지정하세요 (기본: 모든 텍스트 파일)
  **/*.ts
> 그룹 단위를 선택하세요: [1] 파일별  [2] 폴더별
  1
> 변경된 파일만 대상으로 할까요? (y/n)
  n
> 실제 실행 전 대상 파일만 미리 볼까요? (dry-run) (y/n)
  n
> 실행 방식: [1] 순차  [2] 병렬
  1
> 총 12개 파일 발견. 시작할까요? (y/n)
  y

[1/12] src/app.ts... ✓
[2/12] src/utils.ts... ✓
...
[12/12] src/index.ts... ✓

완료: 12파일 ✓  실패: 0파일 ✗  총계: 12파일
```

### Example 2: Dry-Run Preview

```bash
/pfaf "add type annotations to all function parameters"
> ...
> 실제 실행 전 대상 파일만 미리 볼까요? (dry-run) (y/n)
  y

총 23개 파일 발견.
src/app.ts
src/utils.ts
...
src/types.ts

(No state initialized, no execution)
```

### Example 3: CI/CD Pipeline

```bash
/pfaf ci "apply prettier formatting"
```

Runs immediately with defaults (sequential, all files, no prompts). Outputs:

```
pfaf ci done — ✓ 45  ✗ 0  total 45
```

### Example 4: Resume After Interruption

You interrupt a long run with Ctrl+C.

```bash
/pfaf resume
> 이미 처리된 파일: 7개, 남은 파일: 5개
> 진행을 재개할까요? (y/n)
  y

[8/12] src/next.ts... ✓
...
```

### Example 5: Retry Failures

After a run completes with some failures:

```bash
/pfaf retry-failed
> 실패한 파일 2개를 다시 시도할까요? (y/n)
  y

[1/2] src/broken.ts... ✓ (fixed)
[2/2] src/missing.ts... ✗ (still fails)
```

## State File

PFAF stores progress in `.pfaf-state.json` at your project root. This file is automatically gitignored. One state file per project — multiple concurrent projects do not conflict.

### State Structure

```json
{
  "prompt": "remove all console.log",
  "mode": "sequential",
  "glob": "**/*.ts",
  "groupBy": "file",
  "batchSize": 5,
  "startedAt": "2026-03-22T10:00:00Z",
  "files": {
    "src/app.ts": "done",
    "src/utils.ts": "done",
    "src/index.ts": "pending",
    "src/types.ts": "pending"
  },
  "folderContents": {
    "src": ["src/app.ts", "src/utils.ts", "src/index.ts", "src/types.ts"]
  },
  "failures": {
    "src/broken.ts": "SyntaxError on line 42"
  }
}
```

- **`prompt`**: The user's task (used for resume and retry-failed)
- **`mode`**: Sequential or parallel
- **`glob`**: The file pattern used
- **`groupBy`**: File or folder grouping
- **`batchSize`**: Parallel batch size
- **`startedAt`**: ISO timestamp of run start
- **`files`**: Status map: file path → `pending` | `done` | `failed`
- **`folderContents`** (folder mode only): Folder → list of files in it
- **`failures`**: File path → failure reason (only for failed files)

## Troubleshooting

### No files found
- Check your glob pattern: does it match any files?
- Verify `.gitignore` isn't excluding intended files
- Try with dry-run first: `/pfaf "..." (y/n) y` at the dry-run prompt

### Subagent keeps failing on a file
- The file may have syntax errors or encoding issues
- Try opening it manually and fixing the issue first
- Check the failure reason: `/pfaf status` or `/pfaf retry-failed` to see detailed errors

### State corrupted or stuck
- Clear it with `/pfaf reset` (requires confirmation)
- Manually delete `.pfaf-state.json` if needed

### Performance is slow
- Use parallel mode: choose `[2]` at the mode prompt
- Increase batch size for more simultaneous agents
- Consider filtering files with `include_only` or `changed_only`

## License

MIT
