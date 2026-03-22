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
