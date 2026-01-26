import { z } from "zod";

/**
 * Zod Schema for listing bookmarks.
 * @description Query parameters for the list endpoint.
 */
export const BookmarkListSchema = z.object({
  page: z.coerce.number().min(0).default(0).openapi({
    param: {
      name: "page",
      in: "query",
      description: "Page number (0-indexed)",
    },
    example: 0,
  }),
  perpage: z.coerce.number().min(1).max(50).default(50).openapi({
    param: {
      name: "perpage",
      in: "query",
      description: "Items per page (max 50)",
    },
    example: 50,
  }),
  collectionId: z.coerce.number().optional().openapi({
    param: {
      name: "collectionId",
      in: "query",
      description: "Raindrop collection ID (default: 0/All)",
    },
    example: 0,
  }),
});

/**
 * Zod Schema for submitting bookmarks.
 * @description Body payload for the ingest endpoint.
 */
export const BookmarkSubmitSchema = z.object({
  urls: z.union([
    z.string().url().openapi({
      description: "A single URL to bookmark",
      example: "https://example.com"
    }),
    z.array(z.string().url()).openapi({
      description: "Array of URLs to bookmark",
      example: ["https://example.com", "https://test.com"]
    })
  ]).openapi({
    description: "URL or array of URLs to add to Raindrop",
    example: "https://cloudflare.com"
  }),
  collectionId: z.coerce.number().optional().default(0).openapi({
    description: "Target Collection ID (optional, defaults to 0/Unsorted)",
    example: 0
  })
});

/**
 * Response schema for a single Raindrop item.
 */
export const RaindropItemSchema = z.object({
  _id: z.number(),
  title: z.string(),
  link: z.string().url(),
  created: z.string(),
  // Add other fields as necessary from the Raindrop API
}).openapi("RaindropItem");

/**
 * Response schema for list operation
 */
export const BookmarkListResponseSchema = z.object({
  items: z.array(RaindropItemSchema),
  count: z.number()
}).openapi("BookmarkListResponse");
