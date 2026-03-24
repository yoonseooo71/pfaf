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

Record the current model as `originalModel` (this is the model you are currently running on — it will be restored after processing).

### 2. Collect file glob (optional)

Ask: "파일 범위를 지정하세요 (기본: 모든 텍스트 파일, .gitignore 적용 — 엔터로 건너뜀)"

If user presses enter / provides nothing, use `**/*` as the default.

Ask: "그룹 단위를 선택하세요: [1] 파일별 (기본)  [2] 폴더별"

- If 2: pass `group_by: 'folder'` to `list_files`
  - In folder mode, `get_next_file()` returns `{ folder, files[] }` instead of a path string
  - Use the folder-mode agent prompt template (see Step 5 below)

Ask: "변경된 파일만 대상으로 할까요? (changed-only, git diff HEAD 기준) [y/n]"

If y: pass `changed_only: true` to `list_files`.

### 2.5. Dry-run (optional)

Ask: "실제 실행 전 대상 파일만 미리 볼까요? (dry-run) [y/n]"

If y: call `list_files` with `dry_run: true`, display the file list, then stop (do not proceed to step 4).

### 3. Discover files

Call MCP tool `list_files` with the glob and `model: fileModel`. Show the result:
- "총 N개 파일 발견." + any warnings for large files
- Show pre-run summary:
  ```
  파일 처리 모델: claude-[fileModel] 🔒  (현재 모델: claude-[originalModel])
  ```
- If 0 files found: "파일을 찾을 수 없습니다. glob 패턴을 확인해주세요." and stop.

### 4. Choose execution mode

Ask: "실행 방식: [1] 순차 (안전, 결과 확인 가능)  [2] 병렬 (빠름)"

If parallel: ask "배치 크기를 입력하세요 (기본: 5, 동시에 실행할 에이전트 수)"
- Parse as integer; default to 5 if empty or invalid
- Pass as `batch_size` to `list_files`

Ask: "파일 처리에 사용할 모델을 선택하세요 (기본: sonnet):
  [1] sonnet — 균형 (기본값)
  [2] opus — 최고 성능, 느림
  [3] haiku — 가장 빠름, 저비용
  [Enter] 현재 모델 유지"

- Map selection to `fileModel`: "sonnet" | "opus" | "haiku"
- Default to "sonnet" if empty or invalid
- Pass as `model` to `list_files`

Ask: "시작할까요? (y/n)"
If n: stop.

> **⚠️ MODE LOCK: The mode chosen above is FINAL and MUST NOT be changed during execution.
> You are FORBIDDEN from switching modes (e.g., sequential → parallel) for any reason,
> including large file counts or performance concerns. The user's choice is authoritative.
> Violating this rule undermines the user's explicit intent.**

> **⚠️ MODEL LOCK: The file-processing model (`fileModel`) is locked once the run starts.
> You are FORBIDDEN from changing `fileModel` mid-run for any reason.
> If the user attempts to change the model during execution, reject the request and display:
> "모델이 잠겨 있습니다. 새 실행을 시작하려면 `/pfaf reset`을 사용하세요."**

### 5. Execute

**Sequential mode:**
Loop until `get_next_file()` returns null:
  1. Call `get_next_file()`
  2. If null → break
  3. Spawn Agent with `model: fileModel` and this exact prompt:
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
Call `get_progress()` to read `batchSize` (default 5).
Spawn up to `batchSize` agents simultaneously with `model: fileModel` and the same prompt template above.
Await all agents in the batch, mark each done/failed, then spawn the next batch.

**Folder mode (group_by=folder):**
`get_next_file()` returns `{ folder, files[] }` instead of a path string.
Spawn Agent with `model: fileModel` and this prompt template for each folder:
```
Apply the following task to the folder: [FOLDER]

FILES IN THIS FOLDER:
[FILE_LIST — one path per line]

TASK: [USER_PROMPT]

Instructions:
1. Read ALL files in the folder using the Read tool
2. Analyze them together with full cross-file context
3. Apply the task — use Edit tool for changes, Write for new files
4. If no changes are needed, say "no changes needed"
5. Report: "done" or "failed: [reason]"
```
After completion, call `mark_done(folder, "done"|"failed")`
Show progress: `[N/total] folder/... ✓` or `[N/total] folder/... ✗`

### 6. Summary

After the loop ends:
- Call `get_progress()` and show:
  ```
  완료: X파일 ✓  실패: Y파일 ✗  총계: Z파일
  모델 복귀: claude-[fileModel] → claude-[originalModel]
  ```
- If any failed: "실패한 파일을 재시도하려면 `/pfaf retry-failed`를 실행하세요."

---

## Subcommands

**`/pfaf resume`**
- Skip steps 1-4
- Call `get_progress()` to read `fileModel` from state (use `model` field if present, otherwise omit model param when spawning agents)
- Call `get_next_file()` directly
- If null → "이미 모든 파일이 처리되었습니다."
- Otherwise → continue the loop from Step 5, using the locked `fileModel` from state

**`/pfaf status`**
- Call `get_progress()` and display the result as:
  ```
  ████████░░░░░░░░ 8/16 (50%)  ✓ 7완료  ✗ 1실패  ⏳ 8대기
  ```
  - Bar: filled `█` for done+failed, empty `░` for pending, total width 16 chars
  - Percentage: `Math.round((done + failed) / total * 100)`
  - If total is 0: "진행 중인 작업이 없습니다."

**`/pfaf reset`**
- Ask: "현재 진행 상태가 초기화됩니다. 계속할까요? (y/n)"
- If y → call `reset(force=true)`
- If n → cancel

**`/pfaf retry-failed`**
- Loop calling `get_next_file(retry_failed=true)` until null
- Process each with the same subagent template, using the stored prompt from state

**`/pfaf ci <prompt>`**
Non-interactive mode for automated environments. Skips all questions and runs with defaults:
- glob: `**/*`
- group_by: `file`
- mode: `sequential`
- changed_only: `false`
- dry_run: `false`

Execution:
1. Call `list_files` with `{ prompt: <prompt>, mode: 'sequential' }`
2. If 0 files: exit with "No files found."
3. Run in sequential mode immediately (no confirmations)
4. On completion print summary line:
   ```
   pfaf ci done — ✓ X  ✗ Y  total Z
   ```
5. If any failures: call `get_failures()` and print each `file: reason`
