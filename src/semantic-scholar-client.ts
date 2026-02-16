/**
 * Semantic Scholar API Client
 *
 * OpenScholar uses Semantic Scholar as its underlying retrieval API.
 * This client provides programmatic access to paper search, details,
 * citations, and references via the Semantic Scholar Academic Graph API.
 */

const BASE_URL = "https://api.semanticscholar.org/graph/v1";

interface SemanticScholarConfig {
  apiKey?: string;
}

export interface Author {
  authorId: string;
  name: string;
}

export interface Paper {
  paperId: string;
  title: string;
  authors?: Author[];
  year?: number;
  abstract?: string;
  citationCount?: number;
  referenceCount?: number;
  url?: string;
  venue?: string;
  publicationDate?: string;
  fieldsOfStudy?: string[];
  openAccessPdf?: { url: string } | null;
  tldr?: { text: string } | null;
  externalIds?: Record<string, string>;
}

export interface PaperSearchResult {
  total: number;
  offset: number;
  next?: number;
  data: Paper[];
}

export interface AuthorDetail {
  authorId: string;
  name: string;
  paperCount?: number;
  citationCount?: number;
  hIndex?: number;
  affiliations?: string[];
}

export interface AuthorSearchResult {
  total: number;
  offset: number;
  next?: number;
  data: AuthorDetail[];
}

export interface Citation {
  citingPaper: Paper;
}

export interface Reference {
  citedPaper: Paper;
}

const DEFAULT_PAPER_FIELDS = [
  "title",
  "authors",
  "year",
  "abstract",
  "citationCount",
  "referenceCount",
  "url",
  "venue",
  "publicationDate",
  "fieldsOfStudy",
  "openAccessPdf",
  "tldr",
  "externalIds",
].join(",");

const DEFAULT_AUTHOR_FIELDS = [
  "name",
  "paperCount",
  "citationCount",
  "hIndex",
  "affiliations",
].join(",");

export class SemanticScholarClient {
  private apiKey?: string;

  constructor(config: SemanticScholarConfig = {}) {
    this.apiKey = config.apiKey || process.env.S2_API_KEY;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers["x-api-key"] = this.apiKey;
    }
    return headers;
  }

  private async request<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${BASE_URL}${endpoint}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== "") {
          url.searchParams.set(key, value);
        }
      }
    }

    const response = await fetch(url.toString(), {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Semantic Scholar API error: ${response.status} ${response.statusText} - ${errorBody}`
      );
    }

    return response.json() as Promise<T>;
  }

  /**
   * Search for papers by keyword query.
   */
  async searchPapers(options: {
    query: string;
    limit?: number;
    offset?: number;
    year?: string;
    fieldsOfStudy?: string;
    fields?: string;
  }): Promise<PaperSearchResult> {
    const params: Record<string, string> = {
      query: options.query,
      fields: options.fields || DEFAULT_PAPER_FIELDS,
      limit: String(options.limit || 10),
      offset: String(options.offset || 0),
    };
    if (options.year) params.year = options.year;
    if (options.fieldsOfStudy) params.fieldsOfStudy = options.fieldsOfStudy;

    return this.request<PaperSearchResult>("/paper/search", params);
  }

  /**
   * Get details for a specific paper by its Semantic Scholar paper ID,
   * DOI, ArXiv ID, or other supported identifier.
   *
   * Supported ID formats:
   * - Semantic Scholar ID: "649def34f8be52c8b66281af98ae884c09aef38b"
   * - DOI: "DOI:10.1234/example"
   * - ArXiv: "ArXiv:2106.15928"
   * - PubMed: "PMID:12345678"
   * - PubMed Central: "PMCID:PMC1234567"
   */
  async getPaperDetails(paperId: string, fields?: string): Promise<Paper> {
    const params: Record<string, string> = {
      fields: fields || DEFAULT_PAPER_FIELDS,
    };
    return this.request<Paper>(`/paper/${encodeURIComponent(paperId)}`, params);
  }

  /**
   * Get papers that cite the given paper.
   */
  async getPaperCitations(
    paperId: string,
    options?: { limit?: number; offset?: number; fields?: string }
  ): Promise<{ data: Citation[] }> {
    const params: Record<string, string> = {
      fields: options?.fields || DEFAULT_PAPER_FIELDS,
      limit: String(options?.limit || 10),
      offset: String(options?.offset || 0),
    };
    return this.request<{ data: Citation[] }>(
      `/paper/${encodeURIComponent(paperId)}/citations`,
      params
    );
  }

  /**
   * Get papers referenced by the given paper.
   */
  async getPaperReferences(
    paperId: string,
    options?: { limit?: number; offset?: number; fields?: string }
  ): Promise<{ data: Reference[] }> {
    const params: Record<string, string> = {
      fields: options?.fields || DEFAULT_PAPER_FIELDS,
      limit: String(options?.limit || 10),
      offset: String(options?.offset || 0),
    };
    return this.request<{ data: Reference[] }>(
      `/paper/${encodeURIComponent(paperId)}/references`,
      params
    );
  }

  /**
   * Search for authors by name.
   */
  async searchAuthors(options: {
    query: string;
    limit?: number;
    offset?: number;
  }): Promise<AuthorSearchResult> {
    const params: Record<string, string> = {
      query: options.query,
      fields: DEFAULT_AUTHOR_FIELDS,
      limit: String(options.limit || 10),
      offset: String(options.offset || 0),
    };
    return this.request<AuthorSearchResult>("/author/search", params);
  }

  /**
   * Get details for a specific author.
   */
  async getAuthorDetails(authorId: string): Promise<AuthorDetail> {
    const params: Record<string, string> = {
      fields: DEFAULT_AUTHOR_FIELDS,
    };
    return this.request<AuthorDetail>(`/author/${encodeURIComponent(authorId)}`, params);
  }

  /**
   * Get papers by a specific author.
   */
  async getAuthorPapers(
    authorId: string,
    options?: { limit?: number; offset?: number; fields?: string }
  ): Promise<{ data: Paper[] }> {
    const params: Record<string, string> = {
      fields: options?.fields || DEFAULT_PAPER_FIELDS,
      limit: String(options?.limit || 10),
      offset: String(options?.offset || 0),
    };
    return this.request<{ data: Paper[] }>(
      `/author/${encodeURIComponent(authorId)}/papers`,
      params
    );
  }
}
