import { Readability } from "@mozilla/readability";
import type { ExtractedContent } from "../types";

const MIN_TEXT_LENGTH = 200;

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

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "CloudflareWorker"
    }
  });

  if (!response.ok) {
    throw new Error(`Fetch failed ${response.status}`);
  }

  return response.text();
}

async function renderWithBrowser(url: string, browser: Fetcher): Promise<string> {
  const response = await browser.fetch("https://example.com", {
    method: "POST",
    body: JSON.stringify({
      url,
      waitUntil: "networkidle0"
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Browser rendering failed: ${body}`);
  }

  const data = (await response.json()) as { html?: string };
  if (!data.html) {
    throw new Error("Browser rendering returned empty HTML");
  }

  return data.html;
}

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
