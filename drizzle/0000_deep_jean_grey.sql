CREATE TABLE `audit_logs` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`actor_id` int unsigned,
	`action` varchar(80) NOT NULL,
	`entity` varchar(40) NOT NULL,
	`entity_id` varchar(40),
	`detail` json,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `charges` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`match_id` int unsigned NOT NULL,
	`member_id` int unsigned NOT NULL,
	`amount_agorot` int unsigned NOT NULL,
	`billing_month` char(7) NOT NULL,
	`status` enum('charged','waived') NOT NULL DEFAULT 'charged',
	`waived_by` int unsigned,
	`waive_reason` varchar(255),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `charges_id` PRIMARY KEY(`id`),
	CONSTRAINT `charges_match_id_member_id_unique` UNIQUE(`match_id`,`member_id`)
);
--> statement-breakpoint
CREATE TABLE `entries` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`match_id` int unsigned NOT NULL,
	`kind` enum('member','guest') NOT NULL,
	`member_id` int unsigned,
	`guest_name` varchar(120),
	`host_member_id` int unsigned,
	`status` enum('confirmed','queued','offered','withdrawn','expired','removed') NOT NULL DEFAULT 'confirmed',
	`attended` boolean,
	`offered_at` datetime(3),
	`offer_expires_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `entries_id` PRIMARY KEY(`id`),
	CONSTRAINT `entries_match_id_member_id_unique` UNIQUE(`match_id`,`member_id`)
);
--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`billing_month` char(7) NOT NULL,
	`field_cost_agorot` int unsigned NOT NULL,
	`updated_by` int unsigned NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `expenses_id` PRIMARY KEY(`id`),
	CONSTRAINT `expenses_billing_month_unique` UNIQUE(`billing_month`)
);
--> statement-breakpoint
CREATE TABLE `guest_payments` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`entry_id` int unsigned NOT NULL,
	`amount_agorot` int NOT NULL,
	`kind` enum('payment','refund') NOT NULL,
	`refund_of_id` int unsigned,
	`paid_at` datetime(3) NOT NULL,
	`recorded_by` int unsigned NOT NULL,
	`note` varchar(255),
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `guest_payments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `login_tokens` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`member_id` int unsigned NOT NULL,
	`token_hash` char(64) NOT NULL,
	`last_used_at` datetime(3),
	`revoked_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `login_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `login_tokens_token_hash_unique` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `matches` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`match_date` char(10) NOT NULL,
	`kickoff_at` datetime(3) NOT NULL,
	`signup_opens_at` datetime(3) NOT NULL,
	`guest_phase_at` datetime(3) NOT NULL,
	`lock_at` datetime(3) NOT NULL,
	`venue` varchar(160) NOT NULL DEFAULT '',
	`venue_url` varchar(500),
	`cost_agorot` int unsigned NOT NULL,
	`capacity` smallint unsigned NOT NULL,
	`status` enum('scheduled','locked','played','cancelled') NOT NULL DEFAULT 'scheduled',
	`notes` text,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `matches_id` PRIMARY KEY(`id`),
	CONSTRAINT `matches_match_date_unique` UNIQUE(`match_date`)
);
--> statement-breakpoint
CREATE TABLE `members` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`email` varchar(254),
	`phone` varchar(40),
	`nickname` varchar(60),
	`image` text,
	`role` enum('member','admin') NOT NULL DEFAULT 'member',
	`locale` varchar(5) NOT NULL DEFAULT 'en',
	`status` enum('pending','active','disabled') NOT NULL DEFAULT 'active',
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `members_id` PRIMARY KEY(`id`),
	CONSTRAINT `members_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `notification_logs` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`event_key` varchar(200) NOT NULL,
	`member_id` int unsigned NOT NULL,
	`sent_at` datetime(3) NOT NULL,
	CONSTRAINT `notification_logs_id` PRIMARY KEY(`id`),
	CONSTRAINT `notification_logs_event_key_member_id_unique` UNIQUE(`event_key`,`member_id`)
);
--> statement-breakpoint
CREATE TABLE `notification_prefs` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`member_id` int unsigned NOT NULL,
	`category` enum('signup_open','guest_phase','lock_reminder','queue_offer','bill_ready','payment_reminder') NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	CONSTRAINT `notification_prefs_id` PRIMARY KEY(`id`),
	CONSTRAINT `notification_prefs_member_id_category_unique` UNIQUE(`member_id`,`category`)
);
--> statement-breakpoint
CREATE TABLE `payment_allocations` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`payment_id` int unsigned NOT NULL,
	`billing_month` char(7) NOT NULL,
	`amount_agorot` int NOT NULL,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `payment_allocations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`member_id` int unsigned NOT NULL,
	`amount_agorot` int NOT NULL,
	`paid_at` datetime(3) NOT NULL,
	`method` enum('paybox','cash','other') NOT NULL,
	`note` varchar(255),
	`recorded_by` int unsigned NOT NULL,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `payments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`member_id` int unsigned NOT NULL,
	`endpoint` varchar(500) NOT NULL,
	`p256dh` varchar(255) NOT NULL,
	`auth` varchar(255) NOT NULL,
	`user_agent` varchar(255),
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `push_subscriptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `push_subscriptions_endpoint_unique` UNIQUE(`endpoint`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`member_id` int unsigned NOT NULL,
	`token_hash` char(64) NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	`user_agent` varchar(255),
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `sessions_token_hash_unique` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` varchar(80) NOT NULL,
	`value` varchar(255) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `settings_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_actor_id_members_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `members`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `charges` ADD CONSTRAINT `charges_match_id_matches_id_fk` FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `charges` ADD CONSTRAINT `charges_member_id_members_id_fk` FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `charges` ADD CONSTRAINT `charges_waived_by_members_id_fk` FOREIGN KEY (`waived_by`) REFERENCES `members`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `entries` ADD CONSTRAINT `entries_match_id_matches_id_fk` FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `entries` ADD CONSTRAINT `entries_member_id_members_id_fk` FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `entries` ADD CONSTRAINT `entries_host_member_id_members_id_fk` FOREIGN KEY (`host_member_id`) REFERENCES `members`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_updated_by_members_id_fk` FOREIGN KEY (`updated_by`) REFERENCES `members`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `guest_payments` ADD CONSTRAINT `guest_payments_entry_id_entries_id_fk` FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `guest_payments` ADD CONSTRAINT `guest_payments_recorded_by_members_id_fk` FOREIGN KEY (`recorded_by`) REFERENCES `members`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `login_tokens` ADD CONSTRAINT `login_tokens_member_id_members_id_fk` FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notification_logs` ADD CONSTRAINT `notification_logs_member_id_members_id_fk` FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notification_prefs` ADD CONSTRAINT `notification_prefs_member_id_members_id_fk` FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payment_allocations` ADD CONSTRAINT `payment_allocations_payment_id_payments_id_fk` FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payments` ADD CONSTRAINT `payments_member_id_members_id_fk` FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payments` ADD CONSTRAINT `payments_recorded_by_members_id_fk` FOREIGN KEY (`recorded_by`) REFERENCES `members`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `push_subscriptions` ADD CONSTRAINT `push_subscriptions_member_id_members_id_fk` FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_member_id_members_id_fk` FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `charges_member_id_billing_month_idx` ON `charges` (`member_id`,`billing_month`);--> statement-breakpoint
CREATE INDEX `entries_match_id_status_idx` ON `entries` (`match_id`,`status`);--> statement-breakpoint
CREATE INDEX `payment_allocations_billing_month_idx` ON `payment_allocations` (`billing_month`);