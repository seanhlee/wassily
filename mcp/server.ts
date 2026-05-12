/**
 * Wassily MCP Server
 *
 * Exposes the color engine as tools for Claude.
 * Run via: npx tsx --tsconfig tsconfig.mcp.json mcp/server.ts
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools.js";

const server = new McpServer({
  name: "wassily",
  version: "1.0.0",
});

registerTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
