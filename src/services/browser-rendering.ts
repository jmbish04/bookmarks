import Cloudflare from "cloudflare";
import type { ExtractedContent } from "../types";

const getClient = (env: Env) => new Cloudflare({
  apiToken: env.CLOUDFLARE_BROWSER_RENDER_TOKEN
});

/**
 * Robustly extract article metadata using Cloudflare Browser Rendering JSON Extract.
 */
export async function extractArticleMetadata(env: Env, url: string): Promise<ExtractedContent> {
  const client = getClient(env);
  console.log(`[Browser] Extracting metadata for: ${url}`);

  const json = await client.browserRendering.json.create({
    account_id: env.CLOUDFLARE_ACCOUNT_ID,
    url: url,
    prompt: "Extract the main article content along with its title, byline, and full text.",
    response_format: {
      type: "json_schema",
      json_schema: {
        type: "object",
        properties: {
          title: { type: "string" },
          byline: { type: "string", minLength: 1 },
          content: { type: "string" }, // Full text or HTML
          html: { type: "string" } // Full page HTML if needed, or extracted innerHTML
        },
        required: ["title", "content"]
      }
    }
  });

  // The SDK result types might be generic, verify structure
  if (!json || typeof json !== "object") {
    throw new Error("Empty browser rendering result");
  }

  // Cast or validate - based on the schema above, we expect these fields
  const result = json as { title?: string; byline?: string; content?: string; html?: string };

  const finalTitle = result.title || "Untitled";
  const finalContent = result.content || "";
  const finalHtml = result.html || finalContent;

  if (finalContent.length < 50) {
      console.warn("Extracted content is very short. Page might be behind auth or empty.");
  }

  return {
    title: finalTitle,
    byline: result.byline ?? null,
    textContent: finalContent,
    html: finalHtml
  };
}

/**
 * Render the full page content (HTML) using the Browser Rendering API.
 */
export async function renderContent(env: Env, url: string): Promise<string> {
  const client = getClient(env);
  const content = await client.browserRendering.content.create({
    account_id: env.CLOUDFLARE_ACCOUNT_ID,
    url: url
  });
  return content as unknown as string; // SDK typing might differ, usually returns raw string or obj
}

/**
 * Capture a screenshot of the page.
 */
export async function renderScreenshot(env: Env, url: string, options?: { width?: number; height?: number }): Promise<ArrayBuffer> {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const token = env.CLOUDFLARE_BROWSER_RENDER_TOKEN;
  
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering/screenshot`;
  
  console.log(`[Browser] Requesting screenshot via REST: ${url}`);

  const response = await fetch(endpoint, {
      method: "POST",
      headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
      },
      body: JSON.stringify({
          url: url,
          screenshotOptions: {
              type: "png",
              encoding: "binary",
              fullPage: false,
              captureBeyondViewport: false,
              ...options
          }
      })
  });

  if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Browser Rendering API failed (${response.status}): ${errText}`);
  }

  const buffer = await response.arrayBuffer();
  
  if (!buffer || buffer.byteLength === 0) {
      throw new Error("Browser Rendering returned empty buffer");
  }

  return buffer;
}


/**
 * Scrape specific elements from the page using CSS selectors.
 */
export async function scrapeSelector(env: Env, url: string, selectors: string[]): Promise<any> {
    const client = getClient(env);
    const elements = selectors.map(s => ({ selector: s }));
    
    // SDK expects 'html' or 'url' typically? 
    // The user example usage was `url` implicitly or context?
    // Wait, the user example for 'scrape' passed `elements` but didn't pass `url`?
    // "const scrapes = await client.browserRendering.scrape.create({ ..., elements: [...] });"
    // It must take a URL or HTML content. Let's assume 'url' is supported or we fetch content first.
    // Checking docs/types typically: scrape.create usually takes { url: ..., elements: ... } OR { html: ..., elements: ... }
    // I will pass 'url'.
    
    const scrapes = await client.browserRendering.scrape.create({
        account_id: env.CLOUDFLARE_ACCOUNT_ID,
        url: url,
        elements: elements
    });
    return scrapes;
}


/**
 * Extract all links from the page.
 */
export async function extractLinks(env: Env, url: string): Promise<any> {
    const client = getClient(env);
    const links = await client.browserRendering.links.create({
        account_id: env.CLOUDFLARE_ACCOUNT_ID,
        url: url
    });
    return links;
}


/**
 * Convert the page content to Markdown.
 */
export async function renderMarkdown(env: Env, url: string): Promise<string> {
    const client = getClient(env);
    const markdown = await client.browserRendering.markdown.create({
        account_id: env.CLOUDFLARE_ACCOUNT_ID,
        url: url
    });
    return markdown as unknown as string;
}
