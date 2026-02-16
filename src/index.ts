#!/usr/bin/env node

/**
 * PubMed / OpenScholar MCP Server
 *
 * An MCP server that connects to the Semantic Scholar Academic Graph API
 * (the same API used by OpenScholar) to provide academic paper search,
 * retrieval, citation analysis, and author lookup capabilities.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  SemanticScholarClient,
  Paper,
  AuthorDetail,
} from "./semantic-scholar-client.js";

const client = new SemanticScholarClient();

function formatPaper(paper: Paper): string {
  const lines: string[] = [];
  lines.push(`Title: ${paper.title}`);
  if (paper.authors?.length) {
    lines.push(`Authors: ${paper.authors.map((a) => a.name).join(", ")}`);
  }
  if (paper.year) lines.push(`Year: ${paper.year}`);
  if (paper.venue) lines.push(`Venue: ${paper.venue}`);
  if (paper.citationCount !== undefined) lines.push(`Citations: ${paper.citationCount}`);
  if (paper.referenceCount !== undefined) lines.push(`References: ${paper.referenceCount}`);
  if (paper.fieldsOfStudy?.length) {
    lines.push(`Fields: ${paper.fieldsOfStudy.join(", ")}`);
  }
  if (paper.tldr?.text) lines.push(`TL;DR: ${paper.tldr.text}`);
  if (paper.abstract) lines.push(`Abstract: ${paper.abstract}`);
  if (paper.openAccessPdf?.url) lines.push(`PDF: ${paper.openAccessPdf.url}`);
  if (paper.url) lines.push(`URL: ${paper.url}`);
  if (paper.externalIds) {
    const ids = Object.entries(paper.externalIds)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");
    if (ids) lines.push(`External IDs: ${ids}`);
  }
  lines.push(`Semantic Scholar ID: ${paper.paperId}`);
  return lines.join("\n");
}

function formatAuthor(author: AuthorDetail): string {
  const lines: string[] = [];
  lines.push(`Name: ${author.name}`);
  lines.push(`Author ID: ${author.authorId}`);
  if (author.paperCount !== undefined) lines.push(`Papers: ${author.paperCount}`);
  if (author.citationCount !== undefined) lines.push(`Citations: ${author.citationCount}`);
  if (author.hIndex !== undefined) lines.push(`h-index: ${author.hIndex}`);
  if (author.affiliations?.length) {
    lines.push(`Affiliations: ${author.affiliations.join(", ")}`);
  }
  return lines.join("\n");
}

const server = new McpServer({
  name: "pubmed-openscholar",
  version: "1.0.0",
});

// Tool: search_papers
server.tool(
  "search_papers",
  "Search for academic papers using the Semantic Scholar API (OpenScholar's underlying retrieval engine). " +
    "Supports keyword queries, year filtering, and field-of-study filtering.",
  {
    query: z.string().describe("Search query keywords"),
    limit: z
      .number()
      .min(1)
      .max(100)
      .optional()
      .describe("Number of results to return (default: 10, max: 100)"),
    offset: z.number().min(0).optional().describe("Pagination offset (default: 0)"),
    year: z
      .string()
      .optional()
      .describe("Year filter, e.g. '2020' or '2020-2024'"),
    fields_of_study: z
      .string()
      .optional()
      .describe(
        "Comma-separated fields of study filter, e.g. 'Computer Science,Medicine'"
      ),
  },
  async ({ query, limit, offset, year, fields_of_study }) => {
    try {
      const result = await client.searchPapers({
        query,
        limit,
        offset,
        year,
        fieldsOfStudy: fields_of_study,
      });

      if (!result.data.length) {
        return {
          content: [
            { type: "text" as const, text: `No papers found for query: "${query}"` },
          ],
        };
      }

      const header = `Found ${result.total} papers (showing ${result.data.length}, offset ${result.offset})\n`;
      const papers = result.data
        .map((p, i) => `--- Paper ${i + 1} ---\n${formatPaper(p)}`)
        .join("\n\n");

      return {
        content: [{ type: "text" as const, text: header + "\n" + papers }],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error searching papers: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool: get_paper
server.tool(
  "get_paper",
  "Get detailed information about a specific academic paper. " +
    "Supports Semantic Scholar ID, DOI (prefix with 'DOI:'), ArXiv ID (prefix with 'ArXiv:'), " +
    "PubMed ID (prefix with 'PMID:'), or PubMed Central ID (prefix with 'PMCID:').",
  {
    paper_id: z
      .string()
      .describe(
        "Paper identifier: Semantic Scholar ID, DOI:xxx, ArXiv:xxx, PMID:xxx, or PMCID:xxx"
      ),
  },
  async ({ paper_id }) => {
    try {
      const paper = await client.getPaperDetails(paper_id);
      return {
        content: [{ type: "text" as const, text: formatPaper(paper) }],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error fetching paper: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool: get_citations
server.tool(
  "get_citations",
  "Get papers that cite a given paper. Useful for forward citation tracking.",
  {
    paper_id: z
      .string()
      .describe("Paper identifier (same formats as get_paper)"),
    limit: z
      .number()
      .min(1)
      .max(100)
      .optional()
      .describe("Number of citing papers to return (default: 10)"),
    offset: z.number().min(0).optional().describe("Pagination offset"),
  },
  async ({ paper_id, limit, offset }) => {
    try {
      const result = await client.getPaperCitations(paper_id, { limit, offset });

      if (!result.data.length) {
        return {
          content: [
            { type: "text" as const, text: "No citations found for this paper." },
          ],
        };
      }

      const papers = result.data
        .filter((c) => c.citingPaper)
        .map((c, i) => `--- Citing Paper ${i + 1} ---\n${formatPaper(c.citingPaper)}`)
        .join("\n\n");

      return {
        content: [
          {
            type: "text" as const,
            text: `Citations (${result.data.length} results):\n\n${papers}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error fetching citations: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool: get_references
server.tool(
  "get_references",
  "Get papers referenced by a given paper. Useful for backward reference tracking.",
  {
    paper_id: z
      .string()
      .describe("Paper identifier (same formats as get_paper)"),
    limit: z
      .number()
      .min(1)
      .max(100)
      .optional()
      .describe("Number of referenced papers to return (default: 10)"),
    offset: z.number().min(0).optional().describe("Pagination offset"),
  },
  async ({ paper_id, limit, offset }) => {
    try {
      const result = await client.getPaperReferences(paper_id, { limit, offset });

      if (!result.data.length) {
        return {
          content: [
            { type: "text" as const, text: "No references found for this paper." },
          ],
        };
      }

      const papers = result.data
        .filter((r) => r.citedPaper)
        .map((r, i) => `--- Reference ${i + 1} ---\n${formatPaper(r.citedPaper)}`)
        .join("\n\n");

      return {
        content: [
          {
            type: "text" as const,
            text: `References (${result.data.length} results):\n\n${papers}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error fetching references: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool: search_authors
server.tool(
  "search_authors",
  "Search for academic authors by name.",
  {
    query: z.string().describe("Author name to search for"),
    limit: z
      .number()
      .min(1)
      .max(100)
      .optional()
      .describe("Number of results to return (default: 10)"),
  },
  async ({ query, limit }) => {
    try {
      const result = await client.searchAuthors({ query, limit });

      if (!result.data.length) {
        return {
          content: [
            { type: "text" as const, text: `No authors found for: "${query}"` },
          ],
        };
      }

      const authors = result.data
        .map((a, i) => `--- Author ${i + 1} ---\n${formatAuthor(a)}`)
        .join("\n\n");

      return {
        content: [
          {
            type: "text" as const,
            text: `Found ${result.total} authors (showing ${result.data.length}):\n\n${authors}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error searching authors: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool: get_author_papers
server.tool(
  "get_author_papers",
  "Get papers published by a specific author using their Semantic Scholar author ID.",
  {
    author_id: z.string().describe("Semantic Scholar author ID"),
    limit: z
      .number()
      .min(1)
      .max(100)
      .optional()
      .describe("Number of papers to return (default: 10)"),
    offset: z.number().min(0).optional().describe("Pagination offset"),
  },
  async ({ author_id, limit, offset }) => {
    try {
      const author = await client.getAuthorDetails(author_id);
      const result = await client.getAuthorPapers(author_id, { limit, offset });

      if (!result.data.length) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No papers found for author: ${author.name} (${author_id})`,
            },
          ],
        };
      }

      const header = `Papers by ${author.name} (${result.data.length} results):\n`;
      const papers = result.data
        .map((p, i) => `--- Paper ${i + 1} ---\n${formatPaper(p)}`)
        .join("\n\n");

      return {
        content: [{ type: "text" as const, text: header + "\n" + papers }],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error fetching author papers: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("PubMed/OpenScholar MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
