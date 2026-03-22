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

### 2.5. Dry-run (optional)

Ask: "실제 실행 전 대상 파일만 미리 볼까요? (dry-run) [y/n]"

If y: call `list_files` with `dry_run: true`, display the file list, then stop (do not proceed to step 4).

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
