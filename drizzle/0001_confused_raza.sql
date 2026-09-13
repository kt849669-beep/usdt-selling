CREATE TABLE `auth_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`attempts` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_auth_limits_expires` ON `auth_limits` (`expires`);--> statement-breakpoint
CREATE TABLE `local_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`mobile` text NOT NULL,
	`password_hash` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `local_accounts_email_unique` ON `local_accounts` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `local_accounts_mobile_unique` ON `local_accounts` (`mobile`);