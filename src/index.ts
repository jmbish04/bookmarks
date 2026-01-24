import { Hono } from "hono";
import { RaindropClient } from "./services/raindrop";
import { handleQueue } from "./queue-consumer";
import type { BookmarkRecord, BookmarkQueueMessage, Env } from "./types";

const app = new Hono<{ Bindings: Env }>();
const MAX_QUEUE_ITEMS = 10;

async function getLastSync(env: Env): Promise<string | undefined> {
  const result = await env.DB.prepare("SELECT last_synced_at FROM sync_log ORDER BY id DESC LIMIT 1").first<{ last_synced_at: string }>();
  return result?.last_synced_at;
}

async function setLastSync(env: Env, timestamp: string): Promise<void> {
  await env.DB.prepare("INSERT INTO sync_log (last_synced_at) VALUES (?)").bind(timestamp).run();
}

app.get("/", async (c) => {
  const results = await c.env.DB.prepare(
    "SELECT id, raindrop_id, title, url, summary, created_at FROM bookmarks ORDER BY created_at DESC LIMIT 20"
  ).all<BookmarkRecord>();

  return c.html(`<!doctype html><html><head><title>Bookmarks</title></head><body>
    <h1>Recent Bookmarks</h1>
    <form action="/search">
      <input type="text" name="q" placeholder="Search" />
      <button type="submit">Search</button>
    </form>
    <ul>
      ${(results.results ?? [])
        .map(
          (row) =>
            `<li><a href="/article/${row.raindrop_id}">${row.title ?? row.url}</a> - ${row.summary ?? ""}</li>`
        )
        .join("")}
    </ul>
  </body></html>`);
});

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

const xmlEscape = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

app.get("/article/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const record = await c.env.DB.prepare("SELECT * FROM bookmarks WHERE raindrop_id = ?")
    .bind(id)
    .first<BookmarkRecord>();

  if (!record) {
    return c.notFound();
  }

  const html = await c.env.HTML_CACHE.get(`html:${id}`);
  return c.html(`<!doctype html><html><head><title>${record.title ?? record.url}</title></head><body>
    <h1>${record.title ?? record.url}</h1>
    <p>${record.byline ?? ""}</p>
    <article>${record.text_content ?? ""}</article>
    <pre>${html ?? ""}</pre>
  </body></html>`);
});

app.get("/podcast.xml", async (c) => {
  const episodes = await c.env.DB.prepare(
    `SELECT b.title, b.url, b.created_at, p.audio_key
     FROM podcast_episodes p
     JOIN bookmarks b ON b.raindrop_id = p.raindrop_id
     ORDER BY p.created_at DESC LIMIT 20`
  ).all<{ title: string; url: string; created_at: string; audio_key: string }>();

  const items = (episodes.results ?? [])
    .map((episode) => {
      const audioUrl = `${c.env.PODCAST_BASE_URL.replace(/\/$/, "")}/${episode.audio_key}`;
      return `\n      <item>\n        <title><![CDATA[${episode.title}]]></title>\n        <link>${episode.url}</link>\n        <pubDate>${new Date(episode.created_at).toUTCString()}</pubDate>\n        <enclosure url="${audioUrl}" type="audio/mpeg" />\n      </item>`;
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
