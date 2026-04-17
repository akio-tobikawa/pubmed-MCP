import { readdir } from "fs/promises";
import { resolve } from "path";
import { Plugin } from "./types.js";

/**
 * Loads plugins from a directory. Each .js file in the directory should
 * export a default Plugin object or a named `plugin` export.
 *
 * Example plugin file:
 *   export default {
 *     name: "my-plugin",
 *     version: "1.0.0",
 *     description: "My custom plugin",
 *     register(server) { server.tool(...); }
 *   };
 */
export async function loadPluginsFromDir(dir: string): Promise<Plugin[]> {
  const plugins: Plugin[] = [];

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return plugins;
  }

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".js")) continue;

    const pluginPath = resolve(dir, entry.name);
    try {
      const mod = await import(pluginPath);
      const plugin: Plugin = mod.default ?? mod.plugin;
      if (
        plugin &&
        typeof plugin.name === "string" &&
        typeof plugin.register === "function"
      ) {
        plugins.push(plugin);
      } else {
        console.error(
          `Skipping ${entry.name}: missing required Plugin fields (name, register)`
        );
      }
    } catch (err) {
      console.error(`Failed to load plugin from ${pluginPath}:`, err);
    }
  }

  return plugins;
}
