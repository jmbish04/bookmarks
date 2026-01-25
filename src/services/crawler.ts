import { Readability } from "@mozilla/readability";
import puppeteer from "@cloudflare/puppeteer";
import type { ExtractedContent } from "../types";

const MIN_TEXT_LENGTH = 200;

/**
 * Parse HTML into readable article content using Readability.
 */
function parseHtml(html: string, url: string): ExtractedContent | null {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const reader = new Readability(doc);
  const article = reader.parse();

  if (!article || !article.textContent || article.textContent.trim().length < MIN_TEXT_LENGTH) {
    return null;
  }

  return {
    title: article.title ?? doc.title ?? url,
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
 * Render HTML via Browser Rendering when lightweight fetch fails.
 */
async function renderWithBrowser(url: string, browserBinding: Fetcher): Promise<string> {
  const browser = await puppeteer.launch(browserBinding);
  const page = await browser.newPage();

  try {
    await page.goto(url, { waitUntil: "networkidle0" });
    return await page.content();
  } finally {
    await page.close();
    await browser.close();
  }
}

/**
 * Hybrid extraction: attempt fetch + Readability, then fall back to browser rendering.
 */
export async function extractContent(url: string, browser: Fetcher): Promise<ExtractedContent> {
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

  html = await renderWithBrowser(url, browser);
  const parsed = parseHtml(html, url);
  if (!parsed) {
    throw new Error("Failed to extract readable content");
  }

  return parsed;
}
