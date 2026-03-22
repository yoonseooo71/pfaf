# PFAF (Prompt For All Files) — Design Spec

**Date:** 2026-03-22
**Status:** Revised v3

---

## 1. Problem Statement

When running a long prompt across an entire project, Claude tends to **skip or abbreviate files** because it tries to process everything within a single context window. As the context grows, earlier files are forgotten or glossed over with "handled similarly."

**Goal:** A Claude Code plugin that guarantees every file receives the prompt — with no skipping and no quality degradation — by:
1. Tracking file state outside of Claude's context window (MCP server)
2. Giving each file an **isolated context window** via subagents

---

## 2. Solution Overview

A Claude Code plugin installable via the marketplace:

```bash
claude plugin marketplace add https://github.com/<user>/pfaf.git
claude plugin install pfaf@pfaf
# Activates the /pfaf slash command
```

**Core mechanism:**
- An MCP server maintains a `.pfaf-state.json` file tracking which files are processed
- Each file is handled by an **independent subagent** with its own context window
- Sequential mode: one subagent at a time; Parallel mode: multiple subagents simultaneously

---

## 3. Architecture

```
project-refactoring-harness/
├── .claude-plugin/
│   ├── plugin.json         # Plugin manifest
│   └── marketplace.json    # Marketplace metadata (required for claude plugin install)
├── .mcp.json               # MCP server configuration (project root, not inside .claude-plugin/)
├── mcp/
│   └── server.js           # MCP server (Node.js, uses @modelcontextprotocol/sdk)
├── skills/
│   └── pfaf/
│       └── SKILL.md        # /pfaf slash command skill (with YAML frontmatter + body)
└── README.md
```

**Data flow:**

```
User: /pfaf "remove all console.log"
  │
  ▼
[Skill: skills/pfaf/SKILL.md]  — defines UX and orchestration
  │
  ├── MCP: list_files(glob, ignore) → initializes .pfaf-state.json with all target files
  ├── Show preview: "23 files found. Sequential or parallel?"
  │
  └── Loop until get_next_file() → null:
        file = get_next_file()
        Spawn subagent: "Apply [prompt] to [file]. Read file, apply changes, save."
        ← subagent completes with isolated context →
        mark_done(file, status)
        show_progress()
```

---

## 4. Key Design Decision: Subagent Per File

**Why subagents instead of Claude processing files directly:**

```
Without subagents (broken):
Claude context: [file1 content] [file2 content] [file3 content] ... [fileN content]
                 ↑ grows unboundedly, quality degrades, files may be skipped

With subagents (correct):
Orchestrator context: [state tracking only]
  └── Subagent for file1: [file1 content only] → edit → done → context discarded
  └── Subagent for file2: [file2 content only] → edit → done → context discarded
  └── Subagent for fileN: [fileN content only] → edit → done → context discarded
```

Each subagent:
1. Receives the user's prompt + file path
2. Reads the file with the built-in `Read` tool
3. Applies the prompt (using `Edit` tool or as instructed)
4. Reports completion — context is discarded after
5. Orchestrating skill calls `mark_done()` on the MCP server

---

## 5. MCP Server Tool Spec

| Tool | Input | Output | Role |
|---|---|---|---|
| `list_files` | `glob: string`, `ignore?: string[]` | `{ files: string[], total: number }` | Discover files and initialize `.pfaf-state.json` |
| `get_next_file` | `retry_failed?: boolean` | `string \| null` | Return next pending file (or next failed file when retry_failed=true) |
| `mark_done` | `file: string`, `status: "done" \| "failed"` | — | Record completion or failure |
| `get_progress` | — | `{ done: number, pending: number, failed: number, total: number }` | Return current progress |
| `reset` | `force?: boolean` | — | Clear `.pfaf-state.json` (requires force=true if in-progress) |

**Default file filtering (built into `list_files`):**
- Respects `.gitignore` automatically
- Excludes: `node_modules/`, `.git/`, `dist/`, `build/`, `*.lock`, `package-lock.json`
- Excludes binary files by extension: images, fonts, compiled files, etc.
- Warns (does not skip) files over 500 lines — user can proceed or skip

**`.pfaf-state.json` structure:**

```json
{
  "prompt": "remove all console.log",
  "mode": "sequential",
  "glob": "**/*.ts",
  "startedAt": "2026-03-22T10:00:00Z",
  "files": {
    "src/app.ts": "done",
    "src/utils.ts": "done",
    "src/index.ts": "pending",
    "src/types.ts": "pending"
  }
}
```

**Location:** Written to `.pfaf-state.json` in the user's current working directory (project root). One state file per project. Multiple concurrent projects do not conflict.

---

## 6. Slash Command UX

### Mode A — Direct argument
```bash
/pfaf "각 파일의 console.log를 모두 제거해줘"
```

### Mode B — Interactive (no arguments)
```bash
/pfaf
> 어떤 작업을 모든 파일에 실행할까요?
  → (사용자 입력)
> 파일 범위를 지정하세요 (기본: 모든 텍스트 파일, .gitignore 적용 — 엔터로 건너뜀)
  → **/*.ts
> 실행 방식: [1] 순차 (안전, 결과 확인 가능)  [2] 병렬 (빠름)
  → 1
> 총 23개 파일 발견. 시작할까요? (y/n)
  → y
[1/23] src/app.ts... ✓
[2/23] src/utils.ts... ✓
...
```

### Subcommands
```bash
/pfaf resume          # Resume interrupted run from last processed file
/pfaf status          # Show current progress summary
/pfaf reset           # Clear state (prompts confirmation if in-progress)
/pfaf retry-failed    # Re-run only files marked as failed
```

---

## 7. Execution Modes

### Sequential Mode
- One subagent spawned per file, one at a time
- Orchestrator waits for completion before spawning next
- Progress shown after each file: `[N/total] filepath... ✓`
- Safer: user can inspect results file by file

### Parallel Mode
- Multiple subagents spawned simultaneously (default batch: 5 at a time)
- `get_next_file()` calls are serialized by the MCP server (single-threaded Node.js event loop prevents race conditions)
- `mark_done()` is atomic — no two subagents can mark the same file
- Faster for large projects with independent files

---

## 8. Why Files Cannot Be Skipped

```
.pfaf-state.json (source of truth, on disk)
┌──────────────────────────┐
│ src/app.ts   → done      │  ← Orchestrator doesn't need to remember
│ src/utils.ts → done      │
│ src/index.ts → pending ◀─┼── get_next_file() always returns this next
│ src/types.ts → pending   │
└──────────────────────────┘
```

`get_next_file()` returns `null` only when all files are `done` or `failed`. The skill loops until `null` is received. Even if the orchestrator's context grows long, the MCP server's state ensures no file is ever returned twice or omitted.

---

## 9. Plugin Manifest Files

**`.claude-plugin/plugin.json`:**
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

Note: `"mcpServers": "./.mcp.json"` resolves relative to the **project root**, not `.claude-plugin/`. The `.mcp.json` file lives at the project root.

**`.claude-plugin/marketplace.json`:**
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

**`.mcp.json` (project root):**
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

**`skills/pfaf/SKILL.md`:**
```markdown
---
name: pfaf
description: >
  Use this skill when the user types "/pfaf" or asks to run a prompt on all
  files in the project. Runs the prompt on every file individually using
  subagents to prevent skipping.
---

## Orchestration Logic

When invoked:

1. If no argument provided, ask: "어떤 작업을 모든 파일에 실행할까요?"
2. Ask file glob (default: all text files, .gitignore respected)
3. Call MCP `list_files(glob, ignore)` — shows file count preview
4. Ask: "[1] 순차  [2] 병렬"
5. Ask: "시작할까요? (y/n)"

Then loop:
```
while true:
  file = mcp.get_next_file()
  if file is null → break
  spawn Agent: "Apply the following prompt to the file at [file]:
                [user prompt]
                Read the file, make changes, save. Report done or failed."
  await agent result
  mcp.mark_done(file, status)
  show progress: [N/total] file... ✓ or ✗
```

For parallel mode, spawn up to 5 agents simultaneously before awaiting.

Subcommands:
- `resume`: skip list_files, call get_next_file() directly on existing state
- `status`: call get_progress() and display
- `reset`: call reset() with confirmation
- `retry-failed`: loop with get_next_file(retry_failed=true)
```

---

## 10. Error Handling

| Scenario | Behavior |
|---|---|
| Subagent fails on a file | Mark file as `failed`, continue to next. Summarize failures at end. |
| Interrupted mid-run | `.pfaf-state.json` persists. `/pfaf resume` continues from last pending file. |
| `reset` called while in-progress | Prompts for confirmation. Requires explicit `--force` or `y` to proceed. |
| Binary file in glob match | Skip automatically with warning; user informed at preview stage. |
| File over 500 lines | Show warning with line count; user chooses to skip or proceed. |
| Empty prompt | Reject immediately with usage hint. |
| `.pfaf-state.json` corrupted | Reset automatically and inform user. |

---

## 11. Out of Scope (v1.0)

- Dry-run mode (preview changes without applying)
- File dependency ordering
- Rollback / undo individual file changes
- GUI or web dashboard
- Cross-project state sharing
- Commit changes to git after completion
