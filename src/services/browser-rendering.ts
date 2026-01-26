import type { Env } from "../types";

const API_BASE = "https://api.cloudflare.com/client/v4/accounts";

interface BrowserRenderResult {
  html?: string;
  [key: string]: unknown;
}

const isBrowserRenderResult = (value: unknown): value is BrowserRenderResult =>
  typeof value === "object" &&
  value !== null &&
  (!("html" in value) || typeof (value as { html: unknown }).html === "string");

/**
 * Invoke the Cloudflare Browser Rendering REST API for JSON output.
 */
export async function renderJson(env: Env, url: string): Promise<BrowserRenderResult> {
  const response = await fetch(`${API_BASE}/${env.CLOUDFLARE_ACCOUNT_ID}/browser-rendering/json`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.CLOUDFLARE_BROWSER_RENDER_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ url })
  });

  if (!response.ok) {
    throw new Error(`Browser rendering JSON failed: ${response.status}`);
  }

  const payload: unknown = await response.json();
  if (!isBrowserRenderResult(payload)) {
    throw new Error("Browser rendering JSON response invalid");
  }

  return payload;
}

/**
 * Invoke the Cloudflare Browser Rendering REST API for markdown output.
 */
export async function renderMarkdown(env: Env, url: string): Promise<string> {
  const response = await fetch(`${API_BASE}/${env.CLOUDFLARE_ACCOUNT_ID}/browser-rendering/markdown`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.CLOUDFLARE_BROWSER_RENDER_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ url })
  });

  if (!response.ok) {
    throw new Error(`Browser rendering markdown failed: ${response.status}`);
  }

  return response.text();
}

/**
 * Invoke the Cloudflare Browser Rendering REST API for screenshots.
 */
export async function renderScreenshot(env: Env, url: string): Promise<ArrayBuffer> {
  const response = await fetch(`${API_BASE}/${env.CLOUDFLARE_ACCOUNT_ID}/browser-rendering/screenshot`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.CLOUDFLARE_BROWSER_RENDER_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ url })
  });

  if (!response.ok) {
    throw new Error(`Browser rendering screenshot failed: ${response.status}`);
  }

  return response.arrayBuffer();
}
