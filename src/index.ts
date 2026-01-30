import { OpenAPIHono } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { desc, eq, inArray } from "drizzle-orm";
// Removed linkedom import
import { getDb } from "./db/client";
import { bookmarks, podcastEpisodes, syncLog } from "./db/schema";
import { RaindropClient } from "./services/raindrop";
import authRoutes from "./routes/auth";
import bookmarksEndpoints from "./endpoints/bookmarks";
import logsEndpoints from "./endpoints/logs";
import { handleQueue } from "./queue-consumer";
import type { BookmarkQueueMessage } from "./types";

const app = new OpenAPIHono<{ Bindings: Env }>();
const MAX_QUEUE_ITEMS = 10;

// OpenAPI Specification
app.doc("/openapi.json", {
  openapi: "3.1.0",
  info: {
    version: "1.0.0",
    title: "Colby Raindrop Sync API",
    description: "Middleware API for Raindrop.io syncing and smart ingestion.",
  },
});

// Swagger UI
app.get("/swagger", swaggerUI({ url: "/openapi.json" }));

// Mount Routes
app.route("/api", bookmarksEndpoints);
app.route("/api", logsEndpoints);
app.route("/auth", authRoutes);

// Legacy/Other Routes
app.get("/", (c) => c.env.ASSETS.fetch(c.req.raw));
app.get("/assets/*", (c) => c.env.ASSETS.fetch(c.req.raw));

/**
 * Get the most recent sync timestamp from the sync_log table.
 */
async function getLastSync(env: Env): Promise<string | undefined> {
  const db = getDb(env);
  const result = await db.select().from(syncLog).orderBy(desc(syncLog.id)).limit(1);
  return result[0]?.lastSyncedAt;
}

/**
 * Persist a sync timestamp for subsequent ingestion runs.
 */
async function setLastSync(env: Env, timestamp: string): Promise<void> {
  const db = getDb(env);
  await db.insert(syncLog).values({ lastSyncedAt: timestamp });
}

/**
 * Perform vector search using an embedded query.
 */
app.get("/search", async (c) => {
  const query = c.req.query("q");
  if (!query) {
    return c.json({ results: [] });
  }

  const embeddingResponse = await c.env.AI.run("@cf/baai/bge-base-en-v1.5", { text: query });
  const queryVector = Array.isArray(embeddingResponse)
    ? embeddingResponse[0]
    : embeddingResponse && typeof embeddingResponse === "object" && "data" in embeddingResponse && Array.isArray(embeddingResponse.data)
      ? embeddingResponse.data[0]
      : undefined;

  if (!queryVector) {
    return c.json({ error: "Failed to generate query vector" }, 500);
  }

  const searchResults = await c.env.VECTORIZE.query(queryVector, { topK: 5 });
  return c.json({ results: searchResults.matches });
});

/**
 * Escape values for XML output.
 */
const xmlEscape = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/**
 * Escape values for HTML output.
 */
const htmlEscape = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

/**
 * Sanitize cached HTML by removing scriptable elements and unsafe attributes using HTMLRewriter.
 */
async function sanitizeHtml(html: string): Promise<string> {
  const response = new Response(html);
  
  const rewriter = new HTMLRewriter()
    .on("script", { element: (e) => { e.remove(); } })
    .on("iframe", { element: (e) => { e.remove(); } })
    .on("object", { element: (e) => { e.remove(); } })
    .on("embed", { element: (e) => { e.remove(); } })
    .on("*", {
      element(e) {
        // Safe cast to 'any' to avoid type conflict with DOM Element vs HTMLRewriter Element
        // in some Worker type environments. HTMLRewriter Element attributes is iterable.
        const el = e as any;
        for (const [name, value] of el.attributes) {
            if (name.toLowerCase().startsWith("on")) {
                el.removeAttribute(name);
            }
            if ((name === "href" || name === "src") && 
                (value.trim().toLowerCase().startsWith("javascript:") || value.trim().toLowerCase().startsWith("data:"))) {
                el.removeAttribute(name);
            }
        }
      }
    });

  return await rewriter.transform(response).text();
}

/**
 * Render the reader view for a single bookmark.
 */
app.get("/article/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const db = getDb(c.env);
  const result = await db.select().from(bookmarks).where(eq(bookmarks.raindropId, id)).limit(1);
  const record = result[0];

  if (!record) {
    return c.notFound();
  }

  const html = await c.env.HTML_CACHE.get(`html:${id}`);
  const safeHtml = html ? await sanitizeHtml(html) : "";
  
  return c.html(`<!doctype html><html><head><title>${htmlEscape(record.title ?? record.url)}</title></head><body>
    <h1>${htmlEscape(record.title ?? record.url)}</h1>
    <p>${htmlEscape(record.byline ?? "")}</p>
    <article>${htmlEscape(record.textContent ?? "")}</article>
    <section>${safeHtml}</section>
  </body></html>`);
});

/**
 * Generate an RSS feed of recent podcast episodes.
 */
app.get("/podcast.xml", async (c) => {
  const db = getDb(c.env);
  const episodes = await db
    .select({
      title: bookmarks.title,
      url: bookmarks.url,
      createdAt: bookmarks.createdAt,
      audioKey: podcastEpisodes.audioKey
    })
    .from(podcastEpisodes)
    .innerJoin(bookmarks, eq(bookmarks.raindropId, podcastEpisodes.raindropId))
    .orderBy(desc(podcastEpisodes.createdAt))
    .limit(20);

  const items = episodes
    .map((episode) => {
      const audioUrl = `${c.env.PODCAST_BASE_URL.replace(/\/$/, "")}/${episode.audioKey}`;
      const pubDate = episode.createdAt ? new Date(episode.createdAt).toUTCString() : new Date().toUTCString();
      return `\n      <item>\n        <title><![CDATA[${episode.title}]]></title>\n        <link>${episode.url}</link>\n        <pubDate>${pubDate}</pubDate>\n        <enclosure url="${audioUrl}" type="audio/mpeg" />\n      </item>`;
    })
    .join("");

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0"><channel>
      <title>Daily Podcast</title>
      <link>${xmlEscape(c.env.APP_URL)}</link>
      <description>${xmlEscape("Bookmark Podcast Feed")}</description>${items}
    </channel></rss>`;

  return c.text(rss, 200, {
    "Content-Type": "application/rss+xml"
  });
});

/**
 * Fallback to serve static assets (Astro frontend) for any unmatched routes.
 */
app.get("/*", (c) => c.env.ASSETS.fetch(c.req.raw));

/**
 * Cloudflare Worker entrypoints for HTTP, scheduled, and queue triggers.
 */
export default {
  fetch: app.fetch,
  scheduled: async (_controller: ScheduledController, env: Env) => {
    // Use static RAINDROP_TOKEN from env
    const token = env.RAINDROP_TOKEN;
    
    if (!token) {
        console.log("Skipping sync: No RAINDROP_TOKEN configured in environment.");
        return;
    }
    
    const client = new RaindropClient({ token });
    const lastSync = await getLastSync(env);
    const items = await client.listBookmarks(lastSync);
    
    // Deduplicate: Check which URLs are already in D1
    const db = getDb(env);
    const links = items.map(item => item.link);
    
    let validItems = items;
    
    if (links.length > 0) {
        const existingRecords = await db.select({ url: bookmarks.url })
            .from(bookmarks)
            .where(inArray(bookmarks.url, links));
            
        const existingSet = new Set(existingRecords.map(r => r.url));
        
        validItems = items.filter(item => {
            if (existingSet.has(item.link)) {
                // Log duplicate skip? Maybe verbose.
                return false; 
            }
            return true;
        });
        
        if (items.length !== validItems.length) {
            console.log(`[Sync] Skipped ${items.length - validItems.length} duplicate URLs.`);
        }
    }

    const queueItems = validItems.slice(0, MAX_QUEUE_ITEMS).map<BookmarkQueueMessage>((item) => ({
      raindropId: item._id,
      link: item.link,
      title: item.title,
      created: item.created
    }));

    for (const message of queueItems) {
      await env.BOOKMARK_QUEUE.send(message);
    }

    if (items.length > 0) {
      await setLastSync(env, items[0].created);
    }
  },
  queue: (batch: MessageBatch<BookmarkQueueMessage>, env: Env) => handleQueue(batch, env)
};
