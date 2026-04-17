#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { PluginRegistry } from "./plugins/registry.js";
import { loadPluginsFromDir } from "./plugins/loader.js";
import semanticScholarPlugin from "./plugins/semantic-scholar.js";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const server = new McpServer({
  name: "pubmed-openscholar",
  version: "1.0.0",
});

async function main() {
  const registry = new PluginRegistry();

  // Built-in plugin
  registry.register(semanticScholarPlugin);

  // Load external plugins from the plugins/ directory next to the dist output
  const externalPluginsDir =
    process.env.PLUGINS_DIR ?? resolve(__dirname, "..", "plugins");
  const externalPlugins = await loadPluginsFromDir(externalPluginsDir);
  for (const plugin of externalPlugins) {
    registry.register(plugin);
  }

  await registry.loadAll(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("PubMed/OpenScholar MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
