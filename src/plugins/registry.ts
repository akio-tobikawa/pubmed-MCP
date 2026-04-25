import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Plugin } from "./types.js";

export class PluginRegistry {
  private plugins: Map<string, Plugin> = new Map();

  register(plugin: Plugin): void {
    if (this.plugins.has(plugin.name)) {
      throw new Error(`Plugin "${plugin.name}" is already registered`);
    }
    this.plugins.set(plugin.name, plugin);
  }

  getAll(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  get(name: string): Plugin | undefined {
    return this.plugins.get(name);
  }

  async loadAll(server: McpServer): Promise<void> {
    for (const plugin of this.plugins.values()) {
      await plugin.register(server);
      console.error(`Loaded plugin: ${plugin.name} v${plugin.version} - ${plugin.description}`);
    }
  }
}
