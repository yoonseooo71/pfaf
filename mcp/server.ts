import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { handleListFiles, handleGetNextFile, handleMarkDone, handleGetProgress, handleReset } from './tools.js';

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
          dry_run: { type: 'boolean', description: 'If true, discover files without initializing state (preview only)' },
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
  const { name, arguments: rawArgs } = request.params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const args = (rawArgs ?? {}) as any;
  try {
    let result: unknown;
    if (name === 'list_files') result = await handleListFiles(args, cwd);
    else if (name === 'get_next_file') result = await handleGetNextFile(args, cwd);
    else if (name === 'mark_done') result = await handleMarkDone(args, cwd);
    else if (name === 'get_progress') result = await handleGetProgress(args, cwd);
    else if (name === 'reset') result = await handleReset(args, cwd);
    else throw new Error(`Unknown tool: ${name}`);

    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  } catch (err) {
    const error = err as Error;
    return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
