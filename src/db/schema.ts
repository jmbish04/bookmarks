import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const syncLog = sqliteTable("sync_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  lastSyncedAt: text("last_synced_at").notNull(),
  createdAt: text("created_at").default(sql`(datetime('now'))`)
});

export const bookmarks = sqliteTable("bookmarks", {
  id: integer("id").primaryKey(),
  raindropId: integer("raindrop_id").notNull().unique(),
  title: text("title"),
  url: text("url").notNull(),
  byline: text("byline"),
  summary: text("summary"),
  textContent: text("text_content"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`)
});

export const contentCache = sqliteTable("content_cache", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  raindropId: integer("raindrop_id").notNull().unique(),
  htmlKvKey: text("html_kv_key").notNull(),
  extractedAt: text("extracted_at").default(sql`(datetime('now'))`),
  error: text("error")
});

export const podcastEpisodes = sqliteTable("podcast_episodes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  raindropId: integer("raindrop_id").notNull().unique(),
  audioKey: text("audio_key").notNull(),
  script: text("script"),
  createdAt: text("created_at").default(sql`(datetime('now'))`)
});
