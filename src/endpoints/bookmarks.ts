import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { getCookie } from "hono/cookie";
import { HybridService } from "../services/hybrid";
import { RaindropClient } from "../services/raindrop";
import { Logger } from "../services/logger";
import { BookmarkListSchema, BookmarkSubmitSchema, BookmarkListResponseSchema } from "../schemas/bookmark";
import type { BookmarkQueueMessage } from "../types";

const app = new OpenAPIHono<{ Bindings: Env }>();

/**
 * Route: List Bookmarks
 * OperationId: listBookmarks
 */
const listRoute = createRoute({
  method: "get",
  path: "/bookmarks",
  operationId: "listBookmarks",
  summary: "List bookmarks from Raindrop (Enriched with D1)",
  request: {
    query: BookmarkListSchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: BookmarkListResponseSchema,
        },
      },
      description: "List of bookmarks",
    },
    500: {
      description: "Internal Server Error",
    },
  },
});

app.openapi(listRoute, async (c) => {
  const { page, perpage, collectionId } = c.req.valid("query");
  
  const logger = new Logger(c.env, "API:Bookmarks");
  const cookieHeader = c.req.header("Cookie");
  await logger.info(`Cookie Header: ${cookieHeader ? "PRESENT" : "MISSING"} | Value: ${cookieHeader ? cookieHeader.substring(0, 15) + "..." : "-"}`);
  
  const userToken = getCookie(c, "raindrop_access_token");
  await logger.info(`Extracted Token: ${userToken ? "PRESENT" : "MISSING"}`);
  
  const service = new HybridService(c.env, userToken);

  try {
    // HybridService handles fetching from Raindrop and merging with D1
    const { items, count } = await service.listBookmarks(page, perpage, collectionId);
    return c.json({ items, count }, 200);
  } catch (error) {
    return c.json({ items: [], count: 0 }, 500);
  }
});

/**
 * Route: Submit Bookmarks
 * OperationId: submitBookmarks
 */
const submitRoute = createRoute({
  method: "post",
  path: "/bookmarks",
  operationId: "submitBookmarks",
  summary: "Ingest bookmarks (single or batch)",
  request: {
    body: {
      content: {
        "application/json": {
          schema: BookmarkSubmitSchema,
        },
      },
      description: "URL or array of URLs",
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ success: z.boolean(), result: z.unknown() }),
        },
      },
      description: "Submission successful",
    },
    500: {
      description: "Internal Server Error",
    },
  },
});

app.openapi(submitRoute, async (c) => {
  const { urls, collectionId } = c.req.valid("json");
  const userToken = getCookie(c, "raindrop_access_token");
  const service = new HybridService(c.env, userToken);
  
  // Resolve collectionId: passed > env > default(0)
  const targetCollectionId = collectionId ?? Number(c.env.RAINDROP_COLLECTION_ID ?? 0);
  
  try {
    const inputUrls = Array.isArray(urls) ? urls : [urls];
    
    // HybridService handles dedup, checks D1, creates in Raindrop, and queues
    const result = await service.addBookmarks(inputUrls, targetCollectionId);
    
    return c.json({ success: true, result }, 200);
  } catch (error) {
    return c.json({ success: false, result: (error as Error).message }, 500);
  }
});

/**
 * Route: Sync Bookmarks (Manual Trigger)
 * OperationId: syncBookmarks
 */
const syncRoute = createRoute({
  method: "get",
  path: "/bookmarks/sync",
  operationId: "syncBookmarks",
  summary: "Trigger manual sync from Raindrop",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ 
            success: z.boolean(), 
            count: z.number(),
            message: z.string() 
          }),
        },
      },
      description: "Sync initiated",
    },
    500: {
      description: "Internal Server Error",
    },
  },
});

app.openapi(syncRoute, async (c) => {
  const logger = new Logger(c.env, "RaindropSync");
  const token = c.env.RAINDROP_TOKEN;

  if (!token) {
    await logger.error("Sync aborted: Missing RAINDROP_TOKEN");
    return c.json({ success: false, count: 0, message: "Missing RAINDROP_TOKEN" }, 500);
  }

  try {
    await logger.info("Starting manual sync...");
    const client = new RaindropClient({ token, logger });
    
    // Fetch latest 50 items (page 0)
    const items = await client.listBookmarks(undefined, 0, true);
    await logger.info(`Fetched ${items.length} items from Raindrop.`);

    let queuedCount = 0;
    for (const item of items) {
      const message: BookmarkQueueMessage = {
        raindropId: item._id,
        link: item.link,
        title: item.title,
        created: item.created
      };
      
      await c.env.BOOKMARK_QUEUE.send(message);
      queuedCount++;
    }

    await logger.info(`Successfully queued ${queuedCount} items for processing.`);
    return c.json({ success: true, count: queuedCount, message: "Sync complete" }, 200);

  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logger.error(`Sync failed: ${msg}`);
    return c.json({ success: false, count: 0, message: msg }, 500);
  }
});

export default app;
