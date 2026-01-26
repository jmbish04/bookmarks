import { eq } from "drizzle-orm";
import { extractContent } from "./services/crawler";
import { generateEmbeddings, generatePodcastScript, generateSummary, synthesizeAudio, upsertVectors } from "./services/ai";
import { getDb } from "./db/client";
import { bookmarks, contentCache, podcastEpisodes } from "./db/schema";
import type { BookmarkQueueMessage, Env, VectorChunk } from "./types";

const MAX_QUEUE_ATTEMPTS = 3;

/**
 * Chunk a long string with overlap for embedding generation.
 */
function chunkText(text: string, size = 1200, overlap = 200): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(text.length, start + size);
    chunks.push(text.slice(start, end));
    const nextStart = Math.max(end - overlap, 0);
    if (nextStart <= start || nextStart >= text.length) {
      break;
    }
    start = nextStart;
  }
  return chunks;
}

/**
 * Process queued bookmark messages for extraction, AI processing, and storage.
 */
export async function handleQueue(batch: MessageBatch<BookmarkQueueMessage>, env: Env): Promise<void> {
  for (const message of batch.messages) {
    const { raindropId, link, title, created } = message.body;
    try {
      const db = getDb(env);
      const content = await extractContent(env, link);
      const kvKey = `html:${raindropId}`;
      await env.HTML_CACHE.put(kvKey, content.html);

      await db
        .insert(bookmarks)
        .values({
          raindropId,
          title: content.title ?? title ?? null,
          url: link,
          byline: content.byline,
          textContent: content.textContent,
          createdAt: created
        })
        .onConflictDoUpdate({
          target: bookmarks.raindropId,
          set: {
            title: content.title ?? title ?? null,
            url: link,
            byline: content.byline,
            textContent: content.textContent
          }
        });

      await db
        .insert(contentCache)
        .values({
          raindropId,
          htmlKvKey: kvKey,
          error: null
        })
        .onConflictDoUpdate({
          target: contentCache.raindropId,
          set: {
            htmlKvKey: kvKey,
            error: null
          }
        });

      const summary = await generateSummary(env, content.textContent);
      await db.update(bookmarks).set({ summary: summary.summary }).where(eq(bookmarks.raindropId, raindropId));

      const chunks = chunkText(content.textContent);
      const embeddings = await generateEmbeddings(env, chunks);
      const vectors: VectorChunk[] = embeddings.map((values, index) => ({
        id: `${raindropId}:${index}`,
        values,
        metadata: {
          raindrop_id: raindropId,
          chunk: index
        }
      }));
      await upsertVectors(env, vectors);

      const scriptResult = await generatePodcastScript(env, content.textContent);
      const audioBuffer = await synthesizeAudio(env, scriptResult.script);
      const audioKey = `podcast/${raindropId}.mp3`;
      await env.PODCAST_BUCKET.put(audioKey, audioBuffer, {
        httpMetadata: {
          contentType: "audio/mpeg"
        }
      });
      await db
        .insert(podcastEpisodes)
        .values({
          raindropId,
          audioKey,
          script: scriptResult.script
        })
        .onConflictDoUpdate({
          target: podcastEpisodes.raindropId,
          set: {
            audioKey,
            script: scriptResult.script
          }
        });

      message.ack();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const db = getDb(env);
      await db
        .insert(contentCache)
        .values({
          raindropId,
          htmlKvKey: `html:${raindropId}`,
          error: errorMessage
        })
        .onConflictDoUpdate({
          target: contentCache.raindropId,
          set: {
            error: errorMessage
          }
        });

      if (message.attempts < MAX_QUEUE_ATTEMPTS) {
        message.retry();
      } else {
        message.ack();
      }
    }
  }
}
