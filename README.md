# pfaf — Prompt For All Files

A Claude Code plugin that runs any prompt on every file in your project — guaranteed, no skipping.

## The Problem

When you ask Claude to apply a change across an entire project, it tends to skip or abbreviate files as the context window fills up. PFAF solves this by processing each file with an isolated subagent and tracking progress on disk.

## Installation

```bash
claude plugin marketplace add https://github.com/yoonseooo71/pfaf.git
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
