#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { handleListFiles, handleGetNextFile, handleMarkDone, handleGetProgress, handleGetFailures, handleReset } from './tools.js';

// --- Server setup (order must be preserved) ---

const cwd: string = process.env.PFAF_CWD || process.cwd();

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
          group_by: { type: 'string', enum: ['file', 'folder'], description: 'Group by file (default) or folder' },
          batch_size: { type: 'number', description: 'Number of agents to spawn in parallel mode (default: 5)' },
          dry_run: { type: 'boolean', description: 'If true, discover files without initializing state (preview only)' },
          changed_only: { type: 'boolean', description: 'If true, only include files changed since last git commit (git diff HEAD)' },
          include_only: { type: 'array', items: { type: 'string' }, description: 'Whitelist glob patterns — only files matching at least one pattern are included' },
        },
      },
    },
    {
      name: 'get_next_file',
      description: 'Return the next unprocessed item. In file mode: returns a path string. In folder mode: returns { folder, files[] }. Returns null when all done.',
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
          reason: { type: 'string', description: 'Failure reason (stored when status=failed)' },
        },
      },
    },
    {
      name: 'get_failures',
      description: 'Return list of failed files with their failure reasons.',
      inputSchema: { type: 'object', properties: {} },
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
  const { name, arguments: rawArgs } = request.params;
  try {
    const result = await dispatchTool(name, rawArgs ?? {}, cwd);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);

// --- Helpers ---

async function dispatchTool(name: string, args: Record<string, unknown>, cwd: string): Promise<unknown> {
  // Cast through unknown to satisfy strict overlap checks — callers are responsible for providing valid args per tool schema
  const a = args as unknown;
  switch (name) {
    case 'list_files':    return handleListFiles(a as Parameters<typeof handleListFiles>[0], cwd);
    case 'get_next_file': return handleGetNextFile(a as Parameters<typeof handleGetNextFile>[0], cwd);
    case 'mark_done':     return handleMarkDone(a as Parameters<typeof handleMarkDone>[0], cwd);
    case 'get_failures':  return handleGetFailures({}, cwd);
    case 'get_progress':  return handleGetProgress({}, cwd);
    case 'reset':         return handleReset(a as Parameters<typeof handleReset>[0], cwd);
    default:              throw new Error(`Unknown tool: ${name}`);
  }
}
