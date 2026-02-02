import { Logger } from "./logger";
import type { RaindropItem, RaindropResponse } from "../types";

const BASE_URL = "https://api.raindrop.io/rest/v1";
const PER_PAGE = 50;

export interface RaindropClientOptions {
  token: string;
  fetcher?: typeof fetch;
  logger?: Logger; // Optional logger instance
}

/**
 * Raindrop API client with rate-limit handling and pagination.
 */
export class RaindropClient {
  private readonly token: string;
  private readonly fetcher: typeof fetch;
  private readonly logger?: Logger;

  constructor(options: RaindropClientOptions) {
    this.token = options.token;
    // Wrap fetch to ensure correct 'this' context (prevents Illegal Invocation in Workers)
    this.fetcher = options.fetcher ?? ((...args) => fetch(...args));
    this.logger = options.logger;
  }

  /**
   * Create a single bookmark in Raindrop.
   * @param link - The URL to bookmark.
   * @param collectionId - The ID of the collection to add the bookmark to (default: 0).
   * @returns The JSON response from Raindrop.
   */
  async createRaindrop(link: string, collectionId = 0): Promise<unknown> {
    await this.logger?.info(`Creating bookmark for: ${link}`, { collectionId });
    const response = await this.fetchWithRateLimit("/raindrop", undefined, {
      method: "POST",
      body: JSON.stringify({ link, collectionId }),
      headers: { "Content-Type": "application/json" }
    });
    return response.json();
  }

  /**
   * Create multiple bookmarks in Raindrop (batch).
   * @param items - Array of items containing link and optional collectionId.
   * @returns The JSON response from Raindrop.
   */
  async createRaindrops(items: Array<{ link: string; collectionId?: number }>): Promise<unknown> {
    await this.logger?.info(`Batch creating ${items.length} bookmarks`);
    // Raindrop batch API expects { items: [] }
    const payload = {
      items: items.map((item) => ({
        link: item.link,
        collectionId: item.collectionId ?? 0
      }))
    };

    const response = await this.fetchWithRateLimit("/raindrops", undefined, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" }
    });
    return response.json();
  }

  /**
   * List bookmarks optionally filtered by creation timestamp.
   * @param sinceIso - ISO timestamp to filter bookmarks created after.
   * @param page - Page number (0-indexed).
   * @returns Array of RaindropItems.
   */
  async listBookmarks(sinceIso?: string, page = 0, singlePage = false): Promise<RaindropItem[]> {
    const items: RaindropItem[] = [];
    let currentPage = page;

    while (true) {
      const response = await this.fetchWithRateLimit(`/raindrops/0?sort=-created&perpage=${PER_PAGE}&page=${currentPage}`, sinceIso);
      const data = (await response.json()) as { items: RaindropItem[]; count: number };
      const pageItems = data.items ?? [];

      items.push(...pageItems);

      if (singlePage || pageItems.length < PER_PAGE) {
        break;
      }

      currentPage += 1;
    }

    return items;
  }

  /**
   * Fetch from the Raindrop API and honor rate-limit reset headers.
   */
  private async fetchWithRateLimit(path: string, sinceIso?: string, init?: RequestInit): Promise<Response> {
    const url = new URL(`${BASE_URL}${path}`);
    if (sinceIso) {
      url.searchParams.set("created", `>${sinceIso}`);
    }

    const headers = {
      Authorization: `Bearer ${this.token}`,
      ...init?.headers
    };

    const doFetch = async () =>
      this.fetcher(url.toString(), {
        ...init,
        headers
      });

    // Debug Log
    const maskedToken = this.token ? `${this.token.substring(0, 5)}...` : "UNDEFINED";
    console.log(`[RaindropClient] Fetching ${url.toString()} with token: ${maskedToken} (Authorization Header Present: ${!!headers.Authorization})`);

    let response = await doFetch();

    if (response.status === 429) {
      const reset = response.headers.get("X-RateLimit-Reset");
      if (reset) {
        const delayMs = Math.max(Number(reset) * 1000 - Date.now(), 0);
        if (delayMs > 0) {
          await this.logger?.warn(`Rate limit hit. Waiting ${delayMs}ms`);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
        response = await doFetch();
      }
    }

    if (!response.ok) {
      const errorText = await response.text();
      const errorMsg = `Raindrop API error ${response.status}: ${errorText}`;
      await this.logger?.error(errorMsg);
      throw new Error(errorMsg);
    }

    return response;
  }
}

export type { RaindropItem, RaindropResponse };
