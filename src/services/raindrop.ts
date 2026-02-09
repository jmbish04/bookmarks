import type { RaindropItem, RaindropResponse } from "../types";

const BASE_URL = "https://api.raindrop.io/rest/v1";
const PER_PAGE = 50;

export interface RaindropClientOptions {
  token: string;
  fetcher?: typeof fetch;
}

/**
 * Raindrop API client with rate-limit handling and pagination.
 */
export class RaindropClient {
  private readonly token: string;
  private readonly fetcher: typeof fetch;

  constructor(options: RaindropClientOptions) {
    this.token = options.token;
    this.fetcher = options.fetcher ?? fetch;
  }

  /**
   * List bookmarks optionally filtered by creation timestamp.
   */
  async listBookmarks(sinceIso?: string, page = 0): Promise<RaindropItem[]> {
    const items: RaindropItem[] = [];
    let currentPage = page;

    while (true) {
      const response = await this.fetchWithRateLimit(`/raindrops/0?sort=-created&perpage=${PER_PAGE}&page=${currentPage}`, sinceIso);
      const data = (await response.json()) as { items: RaindropItem[]; count: number };
      const pageItems = data.items ?? [];

      items.push(...pageItems);

      if (pageItems.length < PER_PAGE) {
        break;
      }

      currentPage += 1;
    }

    return items;
  }

  /**
   * Fetch from the Raindrop API and honor rate-limit reset headers.
   */
  private async fetchWithRateLimit(path: string, sinceIso?: string): Promise<Response> {
    const url = new URL(`${BASE_URL}${path}`);
    if (sinceIso) {
      url.searchParams.set("created", `>${sinceIso}`);
    }

    let response = await this.fetcher(url.toString(), {
      headers: {
        Authorization: `Bearer ${this.token}`
      }
    });

    if (response.status === 429) {
      const reset = response.headers.get("X-RateLimit-Reset");
      if (reset) {
        const delayMs = Math.max(Number(reset) * 1000 - Date.now(), 0);
        if (delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
        response = await this.fetcher(url.toString(), {
          headers: {
            Authorization: `Bearer ${this.token}`
          }
        });
      }
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Raindrop API error ${response.status}: ${errorText}`);
    }

    return response;
  }
}

export type { RaindropItem, RaindropResponse };
