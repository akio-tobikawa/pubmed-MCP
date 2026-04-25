import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Plugin } from "./types.js";

const BASE_URL = "https://context7.com/api/v2";

interface LibrarySearchResult {
  id: string;
  title: string;
  description?: string;
  totalSnippets?: number;
  trust?: string;
}

interface Context7Config {
  apiKey?: string;
}

class Context7Client {
  private apiKey?: string;

  constructor(config: Context7Config = {}) {
    this.apiKey = config.apiKey || process.env.CONTEXT7_API_KEY;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  async searchLibraries(libraryName: string, query?: string): Promise<LibrarySearchResult[]> {
    const url = new URL(`${BASE_URL}/libs/search`);
    url.searchParams.set("libraryName", libraryName);
    if (query) url.searchParams.set("query", query);

    const response = await fetch(url.toString(), { headers: this.getHeaders() });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Context7 search error: ${response.status} ${response.statusText} - ${body}`);
    }

    const data = await response.json() as { results?: LibrarySearchResult[] } | LibrarySearchResult[];
    return Array.isArray(data) ? data : (data.results ?? []);
  }

  async getLibraryDocs(
    libraryId: string,
    query?: string,
    tokens?: number
  ): Promise<string> {
    const url = new URL(`${BASE_URL}/context`);
    url.searchParams.set("libraryId", libraryId);
    if (query) url.searchParams.set("query", query);
    if (tokens) url.searchParams.set("tokens", String(tokens));
    url.searchParams.set("type", "txt");

    const response = await fetch(url.toString(), { headers: this.getHeaders() });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Context7 docs error: ${response.status} ${response.statusText} - ${body}`);
    }

    return response.text();
  }
}

function formatLibrary(lib: LibrarySearchResult, index: number): string {
  const lines: string[] = [`--- Library ${index + 1} ---`, `ID: ${lib.id}`, `Title: ${lib.title}`];
  if (lib.description) lines.push(`Description: ${lib.description}`);
  if (lib.totalSnippets !== undefined) lines.push(`Snippets: ${lib.totalSnippets}`);
  if (lib.trust) lines.push(`Trust: ${lib.trust}`);
  return lines.join("\n");
}

const context7Plugin: Plugin = {
  name: "context7",
  version: "1.0.0",
  description: "Up-to-date library documentation via Context7",

  register(server: McpServer): void {
    const client = new Context7Client();

    server.tool(
      "resolve_library_id",
      "Search Context7 for a library and return its Context7 library ID. " +
        "Use this before calling get_library_docs to find the correct library ID.",
      {
        library_name: z
          .string()
          .describe("Library or package name to search for, e.g. 'react', 'fastapi', 'zod'"),
        query: z
          .string()
          .optional()
          .describe("Optional topic hint to improve relevance ranking"),
      },
      async ({ library_name, query }) => {
        try {
          const results = await client.searchLibraries(library_name, query);

          if (!results.length) {
            return {
              content: [
                { type: "text" as const, text: `No libraries found matching: "${library_name}"` },
              ],
            };
          }

          const formatted = results
            .map((lib, i) => formatLibrary(lib, i))
            .join("\n\n");

          return {
            content: [
              {
                type: "text" as const,
                text: `Found ${results.length} matching libraries:\n\n${formatted}`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error searching Context7: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      }
    );

    server.tool(
      "get_library_docs",
      "Fetch up-to-date documentation for a library from Context7. " +
        "Use resolve_library_id first to get the correct library ID.",
      {
        library_id: z
          .string()
          .describe("Context7 library ID returned by resolve_library_id, e.g. '/vercel/next.js'"),
        query: z
          .string()
          .optional()
          .describe("Topic or question to focus the documentation on, e.g. 'routing', 'authentication'"),
        tokens: z
          .number()
          .min(1000)
          .max(20000)
          .optional()
          .describe("Maximum tokens to return (default: 5000, max: 20000)"),
      },
      async ({ library_id, query, tokens }) => {
        try {
          const docs = await client.getLibraryDocs(library_id, query, tokens ?? 5000);

          if (!docs.trim()) {
            return {
              content: [
                { type: "text" as const, text: `No documentation found for library ID: "${library_id}"` },
              ],
            };
          }

          return {
            content: [{ type: "text" as const, text: docs }],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error fetching docs from Context7: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      }
    );
  },
};

export default context7Plugin;
