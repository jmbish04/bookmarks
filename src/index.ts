import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { getDb } from "./db/client";
import { bookmarks, podcastEpisodes, syncLog } from "./db/schema";
import { RaindropClient } from "./services/raindrop";
import { handleQueue } from "./queue-consumer";
import type { BookmarkQueueMessage, Env } from "./types";

const app = new Hono<{ Bindings: Env }>();
const MAX_QUEUE_ITEMS = 10;

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
 * Render a dashboard of recent bookmarks with a search form.
 */
app.get("/", async (c) => {
  const db = getDb(c.env);
  const results = await db
    .select({
      id: bookmarks.id,
      raindropId: bookmarks.raindropId,
      title: bookmarks.title,
      url: bookmarks.url,
      summary: bookmarks.summary,
      createdAt: bookmarks.createdAt
    })
    .from(bookmarks)
    .orderBy(desc(bookmarks.createdAt))
    .limit(20);

  return c.html(`<!doctype html><html><head><title>Bookmarks</title></head><body>
    <h1>Recent Bookmarks</h1>
    <form action="/search">
      <input type="text" name="q" placeholder="Search" />
      <button type="submit">Search</button>
    </form>
    <ul>
      ${results
        .map(
          (row) =>
            `<li><a href="/article/${row.raindropId}">${htmlEscape(row.title ?? row.url)}</a> - ${htmlEscape(row.summary ?? "")}</li>`
        )
        .join("")}
    </ul>
  </body></html>`);
});

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
    : (embeddingResponse as { data: number[][] }).data[0];

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
 * Sanitize cached HTML by removing scriptable elements and unsafe attributes.
 */
const sanitizeHtml = (value: string): string => {
  const doc = new DOMParser().parseFromString(value, "text/html");
  doc.querySelectorAll("script, iframe, object, embed").forEach((el) => el.remove());
  doc.querySelectorAll("*").forEach((el) => {
    Array.from(el.attributes).forEach((attr) => {
      const name = attr.name.toLowerCase();
      const attrValue = attr.value.trim().toLowerCase();
      if (name.startsWith("on")) {
        el.removeAttribute(attr.name);
      }
      if (
        (name === "href" || name === "src") &&
        (attrValue.startsWith("javascript:") || attrValue.startsWith("data:") || attrValue.startsWith("vbscript:"))
      ) {
        el.removeAttribute(attr.name);
      }
    });
  });
  return doc.body.innerHTML;
};

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
  const safeHtml = html ? sanitizeHtml(html) : "";
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
      return `\n      <item>\n        <title><![CDATA[${episode.title}]]></title>\n        <link>${episode.url}</link>\n        <pubDate>${new Date(episode.createdAt ?? "").toUTCString()}</pubDate>\n        <enclosure url="${audioUrl}" type="audio/mpeg" />\n      </item>`;
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
 * Cloudflare Worker entrypoints for HTTP, scheduled, and queue triggers.
 */
export default {
  fetch: app.fetch,
  scheduled: async (_controller: ScheduledController, env: Env) => {
    const client = new RaindropClient({ token: env.RAINDROP_TOKEN });
    const lastSync = await getLastSync(env);
    const items = await client.listBookmarks(lastSync);

    const queueItems = items.slice(0, MAX_QUEUE_ITEMS).map<BookmarkQueueMessage>((item) => ({
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
