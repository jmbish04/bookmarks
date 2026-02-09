import { Readability } from "@mozilla/readability";
import { DOMParser } from "linkedom";
import type { ExtractedContent, Env } from "../types";
import { renderJson } from "./browser-rendering";

const MIN_TEXT_LENGTH = 200;

/**
 * Parse HTML into readable article content using Readability.
 */
function parseHtml(html: string, url: string): ExtractedContent | null {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const reader = new Readability(doc as unknown as Document);
  const article = reader.parse();

  if (!article || !article.textContent || article.textContent.trim().length < MIN_TEXT_LENGTH) {
    return null;
  }

  return {
    title: article.title ?? (doc.title as unknown as string) ?? url,
    byline: article.byline ?? null,
    textContent: article.textContent ?? "",
    html
  };
}

/**
 * Fetch HTML directly for lightweight extraction attempts.
 */
async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "BookmarkArchiver/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(`Fetch failed ${response.status}`);
  }

  return response.text();
}

/**
 * Render HTML via Browser Rendering REST API when lightweight fetch fails.
 */
async function renderWithBrowser(env: Env, url: string): Promise<string> {
  const payload = await renderJson(env, url);
  if (payload && typeof payload === "object" && "html" in payload && typeof payload.html === "string") {
    return payload.html;
  }
  throw new Error("Browser rendering response missing HTML");
}

/**
 * Hybrid extraction: attempt fetch + Readability, then fall back to browser rendering.
 */
export async function extractContent(env: Env, url: string): Promise<ExtractedContent> {
  let html = "";
  try {
    html = await fetchHtml(url);
    const parsed = parseHtml(html, url);
    if (parsed) {
      return parsed;
    }
  } catch (error) {
    console.warn("Light fetch failed, falling back to browser", error);
  }

  html = await renderWithBrowser(env, url);
  const parsed = parseHtml(html, url);
  if (!parsed) {
    throw new Error("Failed to extract readable content");
  }

  return parsed;
}
