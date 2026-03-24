# PFAF — Project Context for Claude

## What This Project Is

**PFAF (Prompt For All Files)** is a Claude Code plugin that runs a prompt against every file in a project using subagents — guaranteeing no files are skipped. It solves the problem of Claude skipping or degrading quality on files when processing an entire project in a single context window.

Published to npm as `@yoonseooo71/pfaf`.

---

## Architecture Overview

```
User: /pfaf "remove console.log"
  ↓
[SKILL.md Orchestrator]   ← interactive config collection
  ├── list_files()         → initializes .pfaf-state.json
  ├── show preview
  ├── get mode + confirm
  └── Loop until get_next_file() returns null:
      ├── Spawn subagent per file (independent context window)
      ├── Await result
      ├── mark_done(file, status)
      └── Show progress bar
```

**Key design principles:**
- State lives on disk (`.pfaf-state.json` is source of truth)
- One subagent per file — each file gets a fresh context window
- `get_next_file()` is serialized — no race conditions even in parallel mode
- Loop runs until `null` — files cannot be skipped

---

## Project Structure

```
mcp/
  server.ts       # MCP server entry point, registers 6 tools
  tools.ts        # Tool handler implementations (business logic)
  state.ts        # .pfaf-state.json read/write, progress calculation
  files.ts        # File discovery, filtering, git diff, binary exclusion
  *.test.ts       # Jest unit tests

skills/pfaf/
  SKILL.md        # /pfaf slash command definition and orchestration logic

docs/superpowers/
  specs/          # Design specs
  plans/          # Implementation plans

dist/             # Compiled JS (from tsc)
```

---

## Tech Stack

| Item | Detail |
|------|--------|
| Language | TypeScript (strict mode) |
| Runtime | Node.js 18+ |
| Protocol | Model Context Protocol (MCP) via `@modelcontextprotocol/sdk` v1.0.0 |
| File discovery | `fast-glob` v3.3.2 |
| Gitignore handling | `ignore` v5.3.1 |
| Testing | Jest v29.7.0, `ts-jest` |
| Build | TypeScript v5.9.3 → `dist/` |
| Deployment | `npx @yoonseooo71/pfaf` (published to npm) |

---

## The 6 MCP Tools

| Tool | Purpose |
|------|---------|
| `list_files` | Discover files via glob, initialize state |
| `get_next_file` | Return next pending file/folder (serialized) |
| `mark_done` | Record file as `done` or `failed` |
| `get_failures` | Return list of failed files |
| `get_progress` | Return progress count + visual bar |
| `reset` | Clear state file |

---

## State File: `.pfaf-state.json`

Tracks per-file status. Written atomically. Located in the project root being processed.

```ts
type FileStatus = 'pending' | 'done' | 'failed'
type GroupBy = 'file' | 'folder'
```

---

## Slash Command: `/pfaf`

Defined in `skills/pfaf/SKILL.md`. Supports:

- `/pfaf "prompt"` — interactive mode with config prompts
- `/pfaf resume` — resume interrupted run
- `/pfaf status` — show current progress
- `/pfaf reset` — clear state
- `/pfaf retry-failed` — rerun only failed files
- `/pfaf ci <prompt>` — non-interactive CI/CD mode

---

## Build & Test

```bash
npm run build    # compile TypeScript → dist/
npm test         # run Jest unit tests
npm start        # run MCP server directly (dist/server.js)
```

**Environment variable:**
- `PFAF_CWD` — working directory for the MCP server (defaults to `process.cwd()`)

---

## File Filtering Rules

- Respects `.gitignore` automatically
- Default excludes: `node_modules/`, `.git/`, `dist/`, `build/`, `*.lock`
- Binary files excluded by extension
- Files over 500 lines trigger a warning (can proceed)

---

## Coding Conventions

- All functions have explicit return types
- Public functions are defined before private/helper functions
- State mutations follow: `readState()` → modify → `writeState()`
- Code comments in English
