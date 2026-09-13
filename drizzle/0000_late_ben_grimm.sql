CREATE TABLE `demo_sessions` (
	`token` text PRIMARY KEY NOT NULL,
	`identity` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_demo_sessions_expires` ON `demo_sessions` (`expires`);--> statement-breakpoint
CREATE TABLE `demo_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`revision` integer NOT NULL
);
