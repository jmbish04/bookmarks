CREATE TABLE `system_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`level` text NOT NULL,
	`component` text NOT NULL,
	`message` text NOT NULL,
	`metadata` text,
	`created_at` text DEFAULT (datetime('now'))
);
