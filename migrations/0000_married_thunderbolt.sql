CREATE TABLE `bookmarks` (
	`raindrop_id` integer PRIMARY KEY NOT NULL,
	`title` text,
	`url` text NOT NULL,
	`byline` text,
	`summary` text,
	`text_content` text,
	`created_at` text NOT NULL,
	`updated_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE TABLE `content_cache` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`raindrop_id` integer NOT NULL,
	`html_kv_key` text NOT NULL,
	`extracted_at` text DEFAULT (datetime('now')),
	`error` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_cache_raindrop_id_unique` ON `content_cache` (`raindrop_id`);--> statement-breakpoint
CREATE TABLE `podcast_episodes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`raindrop_id` integer NOT NULL,
	`audio_key` text NOT NULL,
	`script` text,
	`created_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `podcast_episodes_raindrop_id_unique` ON `podcast_episodes` (`raindrop_id`);--> statement-breakpoint
CREATE TABLE `sync_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`last_synced_at` text NOT NULL,
	`created_at` text DEFAULT (datetime('now'))
);
