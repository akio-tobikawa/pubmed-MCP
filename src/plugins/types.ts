import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export interface Plugin {
  name: string;
  version: string;
  description: string;
  register(server: McpServer): void | Promise<void>;
}
