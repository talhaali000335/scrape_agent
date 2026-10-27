import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { runScrape } from '../lib/agent.js';
import { flushTraces } from '../lib/trace.js';
import { getDb } from '../lib/db.js';

// Load .env from the project folder, whatever folder the AI app starts this process in.
dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)) });

// MCP lets an AI app (Claude Desktop, Cursor...) call YOUR code as a tool.
// This server talks over stdin/stdout, so NEVER use console.log here: it would corrupt the protocol.
// Use console.error for messages.
const server = new McpServer({ name: 'scrape-agent', version: '1.0.0' });

server.registerTool(
  'scrape_page',
  {
    description:
      'Fetch one public web page and extract what the user asks for. Respects robots.txt and stops if the site disallows bots.',
    inputSchema: {
      url: z.string().describe('Full page URL, e.g. https://example.com/products'),
      goal: z.string().describe('What to extract, e.g. "product names and prices"'),
    },
  },
  async ({ url, goal }) => {
    const result = await runScrape({ url, goal });
    await flushTraces();
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },
);

server.registerTool(
  'list_recent_scrapes',
  { description: 'List the most recent scrapes saved in MongoDB.', inputSchema: {} },
  async () => {
    const rows = await (await getDb()).collection('scrapes')
      .find({}, { projection: { url: 1, goal: 1, status: 1, totalMs: 1, createdAt: 1 } })
      .sort({ createdAt: -1 }).limit(10).toArray();
    return { content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }] };
  },
);

await server.connect(new StdioServerTransport());
console.error('scrape-agent MCP server running on stdio');
