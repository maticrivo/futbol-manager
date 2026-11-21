ALTER TABLE `members` ADD `email` varchar(254);--> statement-breakpoint
ALTER TABLE `members` ADD `phone` varchar(40);--> statement-breakpoint
ALTER TABLE `members` ADD `nickname` varchar(60);--> statement-breakpoint
ALTER TABLE `members` ADD `image` varchar(500);--> statement-breakpoint
UPDATE members SET email = LOWER(name) WHERE email IS NULL AND name LIKE '%@%';--> statement-breakpoint
ALTER TABLE `members` ADD CONSTRAINT `members_email_unique` UNIQUE(`email`);
