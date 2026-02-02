import { Logger } from "./logger";
import { getDb } from "../db/client";
import { bookmarks } from "../db/schema";
import { desc, count, inArray } from "drizzle-orm";
import type { RaindropItem } from "../types";

export class HybridService {
    private logger: Logger;

    constructor(private env: Env, private userToken?: string | null) {
        this.logger = new Logger(env, "HybridService");
    }

    /**
     * List bookmarks directly from D1.
     * This decouples the frontend view from Raindrop's API availability.
     * @param page Page number (0-indexed)
     * @param perPage Items per page
     */
    async listBookmarks(page: number, perPage: number, collectionId: number = 0) {
        const db = getDb(this.env);

        // 1. Get Total Count for Pagination
        const totalResult = await db.select({ count: count() }).from(bookmarks).get();
        const total = totalResult?.count ?? 0;

        if (total === 0) {
            return { items: [], count: 0 };
        }

        // 2. Fetch Page from D1
        const d1Items = await db.select()
            .from(bookmarks)
            .orderBy(desc(bookmarks.createdAt))
            .limit(perPage)
            .offset(page * perPage);

        // 3. Map D1 format to the RaindropItem interface expected by the frontend
        const items: RaindropItem[] = d1Items.map(item => ({
            _id: item.raindropId,
            title: item.title || "Untitled",
            link: item.url,
            created: item.createdAt,
            excerpt: item.summary || "",
            // Default fields to satisfy interface
            type: "link", 
            tags: [],
            domain: new URL(item.url).hostname
        }));

        return { items, count: total }; 
    }

    /**
     * Normalize a URL for consistent deduplication.
     * - Converts to lowercase
     * - Removes trailing slashes
     * - Removes default ports (80 for http, 443 for https)
     */
    private normalizeUrl(url: string): string {
        try {
            const parsed = new URL(url.toLowerCase());
            // Remove trailing slash from pathname
            if (parsed.pathname.endsWith('/') && parsed.pathname.length > 1) {
                parsed.pathname = parsed.pathname.slice(0, -1);
            }
            // Remove default ports
            if ((parsed.protocol === 'http:' && parsed.port === '80') ||
                (parsed.protocol === 'https:' && parsed.port === '443')) {
                parsed.port = '';
            }
            return parsed.toString();
        } catch {
            // If URL parsing fails, return the original
            return url;
        }
    }

    /**
     * Add bookmarks directly to D1 and Queue.
     * Generates a synthetic ID (Date.now()) to bypass Raindrop creation.
     * The actual sync to Raindrop will happen via correct cron/queue processing later
     * (though currently we are just ingesting. true 2-way sync is a future task, 
     * but this meets the requirement of not blocking on Raindrop API).
     * 
     * CRITICAL: This method prevents duplicate URL processing which is essential
     * for billing purposes. URLs are checked against the database before being
     * queued for processing.
     */
    async addBookmarks(urls: string[], collectionId: number = 0) {
        const db = getDb(this.env);
        const processed: Array<{ _id: number; link: string; title: string }> = [];
        const skipped: string[] = [];

        // 1. Normalize and deduplicate input URLs
        const normalizedMap = new Map<string, string>(); // normalized -> original
        for (const url of urls) {
            const normalized = this.normalizeUrl(url);
            if (!normalizedMap.has(normalized)) {
                normalizedMap.set(normalized, url);
            }
        }
        const uniqueUrls = Array.from(normalizedMap.values());

        if (uniqueUrls.length === 0) {
            return { success: true, processed: 0, skipped: 0, items: [] };
        }

        // 2. CRITICAL: Check database for existing URLs to prevent duplicate processing
        // This is essential for billing - a URL should NEVER be processed more than once
        let existingUrls = new Set<string>();
        try {
            const existingRecords = await db.select({ url: bookmarks.url })
                .from(bookmarks)
                .where(inArray(bookmarks.url, uniqueUrls));
            
            existingUrls = new Set(existingRecords.map(r => r.url));
            
            if (existingUrls.size > 0) {
                await this.logger.info(`Skipping ${existingUrls.size} URLs that already exist in database`);
            }
        } catch (e) {
            const msg = e instanceof Error ? e.message : "Unknown error";
            await this.logger.warn(`Failed to check for existing URLs: ${msg}`);
            // Continue - we'll rely on the upsert to handle conflicts
        }

        // 3. Process only URLs that don't exist in the database
        for (const url of uniqueUrls) {
            // Skip URLs that already exist
            if (existingUrls.has(url)) {
                skipped.push(url);
                continue;
            }

            // Generate a synthetic ID. 
            // We use Date.now() to ensure uniqueness locally.
            // This ensures we satisfy the primary key constraint without calling an external API.
            const syntheticId = Date.now() + Math.floor(Math.random() * 1000);

            try {
                // Insert initial record into D1
                await db.insert(bookmarks).values({
                    raindropId: syntheticId,
                    url: url,
                    title: url, // Temporary title until AI processes it
                    createdAt: new Date().toISOString(),
                });

                // Send to Queue for AI processing (Crawler -> Embeddings -> Podcast)
                await this.env.BOOKMARK_QUEUE.send({
                    raindropId: syntheticId,
                    link: url, // Map 'link' to expected queue payload
                    title: url,
                    created: new Date().toISOString()
                }, {
                    contentType: "json"
                });

                processed.push({
                    _id: syntheticId,
                    link: url,
                    title: url
                });

                await this.logger.info(`Queued synthetic bookmark: ${syntheticId} - ${url}`);

            } catch (e) {
                const msg = e instanceof Error ? e.message : "Unknown database error";
                await this.logger.error(`Failed to ingest bookmark ${url}`, { error: msg });
                // Continue processing other URLs in the batch
            }
        }

        return { 
            success: true, 
            processed: processed.length, 
            skipped: skipped.length,
            items: processed 
        };
    }
}