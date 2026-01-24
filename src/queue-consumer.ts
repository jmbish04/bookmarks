import { extractContent } from "./services/crawler";
import { generateEmbeddings, generatePodcastScript, generateSummary, synthesizeAudio, upsertVectors } from "./services/ai";
import type { BookmarkQueueMessage, Env, VectorChunk } from "./types";

function chunkText(text: string, size = 1200, overlap = 200): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(text.length, start + size);
    chunks.push(text.slice(start, end));
    start = end - overlap;
    if (start < 0) {
      start = 0;
    }
  }
  return chunks;
}

export async function handleQueue(batch: MessageBatch<BookmarkQueueMessage>, env: Env): Promise<void> {
  for (const message of batch.messages) {
    const { raindropId, link, title, created } = message.body;
    try {
      const content = await extractContent(link, env.BROWSER);
      const kvKey = `html:${raindropId}`;
      await env.HTML_CACHE.put(kvKey, content.html);

      await env.DB.prepare(
        `INSERT INTO bookmarks (raindrop_id, title, url, byline, text_content, created_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(raindrop_id) DO UPDATE SET
           title = excluded.title,
           url = excluded.url,
           byline = excluded.byline,
           text_content = excluded.text_content,
           updated_at = datetime('now')`
      )
        .bind(raindropId, content.title ?? title ?? null, link, content.byline, content.textContent, created)
        .run();

      await env.DB.prepare(
        `INSERT INTO content_cache (raindrop_id, html_kv_key, error)
         VALUES (?, ?, NULL)
         ON CONFLICT(raindrop_id) DO UPDATE SET
           html_kv_key = excluded.html_kv_key,
           error = NULL,
           extracted_at = datetime('now')`
      )
        .bind(raindropId, kvKey)
        .run();

      const summary = await generateSummary(env.AI, content.textContent);
      await env.DB.prepare(
        `UPDATE bookmarks
         SET summary = ?, updated_at = datetime('now')
         WHERE raindrop_id = ?`
      )
        .bind(summary.summary, raindropId)
        .run();

      const chunks = chunkText(content.textContent);
      const embeddings = await generateEmbeddings(env.AI, chunks);
      const vectors: VectorChunk[] = embeddings.map((values, index) => ({
        id: `${raindropId}:${index}`,
        values,
        metadata: {
          raindrop_id: raindropId,
          chunk: index
        }
      }));
      await upsertVectors(env.VECTORIZE, vectors);

      const scriptResult = await generatePodcastScript(env.AI, content.textContent);
      const audioBuffer = await synthesizeAudio(env.AI, scriptResult.script);
      const audioKey = `podcast/${raindropId}.mp3`;
      await env.PODCAST_BUCKET.put(audioKey, audioBuffer, {
        httpMetadata: {
          contentType: "audio/mpeg"
        }
      });
      await env.DB.prepare(
        `INSERT INTO podcast_episodes (raindrop_id, audio_key, script)
         VALUES (?, ?, ?)
         ON CONFLICT(raindrop_id) DO UPDATE SET
           audio_key = excluded.audio_key,
           script = excluded.script,
           created_at = datetime('now')`
      )
        .bind(raindropId, audioKey, scriptResult.script)
        .run();

      message.ack();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      await env.DB.prepare(
        `INSERT INTO content_cache (raindrop_id, html_kv_key, error)
         VALUES (?, ?, ?)
         ON CONFLICT(raindrop_id) DO UPDATE SET
           error = excluded.error,
           extracted_at = datetime('now')`
      )
        .bind(raindropId, `html:${raindropId}`, errorMessage)
        .run();
      message.retry();
    }
  }
}
