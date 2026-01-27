import { eq, inArray } from "drizzle-orm";
// Replaced crawler with Browser Rendering extract
import { extractArticleMetadata, renderScreenshot } from "./services/browser-rendering"; 
import { generateEmbeddings, generatePodcastScript, synthesizeAudio, upsertVectors } from "./services/ai"; // Removed generateSummary import
import { ArticleAnalystAgent } from "./services/openai-agent";
import { uploadToCloudflareImages } from "./services/images";
import { getDb } from "./db/client";
import { bookmarks, contentCache, podcastEpisodes } from "./db/schema";
import { Logger } from "./services/logger";
import type { BookmarkQueueMessage, VectorChunk } from "./types";

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
  const logger = new Logger(env, "QueueConsumer");
  const db = getDb(env);

  // 1. Batch Idempotency Check
  const urls = batch.messages.map(m => m.body.link);
  const existingUrls = new Set<string>();
  
  if (urls.length > 0) {
      try {
          // Check D1 for all URLs in one go
          const found = await db.select({ url: bookmarks.url })
            .from(bookmarks)
            .where(inArray(bookmarks.url, urls));
          found.forEach(f => existingUrls.add(f.url));
      } catch (e) {
          await logger.warn(`Failed to batch check duplicates: ${e instanceof Error ? e.message : e}`);
      }
  }

  const duplicatesCount = batch.messages.filter(m => existingUrls.has(m.body.link)).length;
  await logger.info(`Queue Batch: ${batch.messages.length} received / ${duplicatesCount} duplicates skipped.`);

  for (const message of batch.messages) {
    const { raindropId, link, title, created } = message.body;

    // Silent Skip
    if (existingUrls.has(link)) {
        message.ack();
        continue;
    }
    
    await logger.info(`Processing bookmark: ${title || link} (ID: ${raindropId})`);

    try {
      // 1. Extraction (Using Cloudflare Browser Rendering)
      await logger.info(`Extracting content via Browser Rendering from ${link}...`);
      const content = await extractArticleMetadata(env, link);
      await logger.info(`Extraction complete. Length: ${content.textContent.length} chars.`);
      
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

      // 1.5 Screenshot & Upload
      try {
        await logger.info(`Capturing screenshot for ${link}...`);
        const pngBuffer = await renderScreenshot(env, link);
        const imageUrl = await uploadToCloudflareImages(env, pngBuffer, raindropId.toString());
        
        if (imageUrl) {
            await db.update(bookmarks)
                .set({ coverImage: imageUrl })
                .where(eq(bookmarks.raindropId, raindropId));
            await logger.info(`Screenshot saved: ${imageUrl}`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown (Screenshot)";
        await logger.warn(`Screenshot capture failed: ${msg}`);
      }

      // 2. Summary (Using ArticleAnalystAgent)
      await logger.info("Generating AI summary via Analyst Agent...");
      const agent = new ArticleAnalystAgent(env);
      const summary = await agent.summarize(content.textContent);
      
      await db.update(bookmarks).set({ summary: summary.summary }).where(eq(bookmarks.raindropId, raindropId));
      await logger.info("Summary generated.");

      // 3. Embeddings
      const chunks = chunkText(content.textContent);
      await logger.info(`Generating embeddings for ${chunks.length} chunks...`);
      
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
      await logger.info("Embeddings upserted to Vectorize.");

      // 4. Podcast
      await logger.info("Generating podcast script...");
      // Try to get script from Agent summary, fallback to legacy generator if missing
      let script = summary.podcast_script;
      if (!script) {
          await logger.warn("Podcast script missing in summary. Generating via fallback...");
          const scriptResult = await generatePodcastScript(env, content.textContent);
          script = scriptResult.script;
      }
      
      await logger.info("Synthesizing audio (TTS)...");
      const audioBuffer = await synthesizeAudio(env, script);
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
          script: script
        })
        .onConflictDoUpdate({
          target: podcastEpisodes.raindropId,
          set: {
            audioKey,
            script: script
          }
        });
        
      await logger.info(`Podcast generated: ${audioKey}`);
      await logger.info(`Processing complete for ID: ${raindropId}`);

      message.ack();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      await logger.error(`Failed to process ${link}: ${errorMessage}`);
      
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
        await logger.warn(`Retrying message (Attempt ${message.attempts}/${MAX_QUEUE_ATTEMPTS})...`);
        message.retry();
      } else {
        await logger.error(`Dropping message after ${message.attempts} failed attempts.`);
        message.ack();
      }
    }
  }
}
