CREATE TABLE `auditLog` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`actorId` int unsigned,
	`action` varchar(80) NOT NULL,
	`entity` varchar(40) NOT NULL,
	`entityId` varchar(40),
	`detail` json,
	`createdAt` datetime(3) NOT NULL,
	CONSTRAINT `auditLog_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `charges` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`matchId` int unsigned NOT NULL,
	`memberId` int unsigned NOT NULL,
	`amountAgorot` int unsigned NOT NULL,
	`billingMonth` char(7) NOT NULL,
	`status` enum('charged','waived') NOT NULL DEFAULT 'charged',
	`waivedBy` int unsigned,
	`waiveReason` varchar(255),
	`createdAt` datetime(3) NOT NULL,
	`updatedAt` datetime(3) NOT NULL,
	CONSTRAINT `charges_id` PRIMARY KEY(`id`),
	CONSTRAINT `charges_matchId_memberId_unique` UNIQUE(`matchId`,`memberId`)
);
--> statement-breakpoint
CREATE TABLE `entries` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`matchId` int unsigned NOT NULL,
	`kind` enum('member','guest') NOT NULL,
	`memberId` int unsigned,
	`guestName` varchar(120),
	`hostMemberId` int unsigned,
	`status` enum('confirmed','queued','offered','withdrawn','expired','removed') NOT NULL DEFAULT 'confirmed',
	`attended` boolean,
	`offeredAt` datetime(3),
	`offerExpiresAt` datetime(3),
	`createdAt` datetime(3) NOT NULL,
	`updatedAt` datetime(3) NOT NULL,
	CONSTRAINT `entries_id` PRIMARY KEY(`id`),
	CONSTRAINT `entries_matchId_memberId_unique` UNIQUE(`matchId`,`memberId`)
);
--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`billingMonth` char(7) NOT NULL,
	`fieldCostAgorot` int unsigned NOT NULL,
	`updatedBy` int unsigned NOT NULL,
	`updatedAt` datetime(3) NOT NULL,
	CONSTRAINT `expenses_id` PRIMARY KEY(`id`),
	CONSTRAINT `expenses_billingMonth_unique` UNIQUE(`billingMonth`)
);
--> statement-breakpoint
CREATE TABLE `guestPayments` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`entryId` int unsigned NOT NULL,
	`amountAgorot` int NOT NULL,
	`kind` enum('payment','refund') NOT NULL,
	`refundOfId` int unsigned,
	`paidAt` datetime(3) NOT NULL,
	`recordedBy` int unsigned NOT NULL,
	`note` varchar(255),
	`createdAt` datetime(3) NOT NULL,
	CONSTRAINT `guestPayments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `loginTokens` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`memberId` int unsigned NOT NULL,
	`tokenHash` char(64) NOT NULL,
	`lastUsedAt` datetime(3),
	`revokedAt` datetime(3),
	`createdAt` datetime(3) NOT NULL,
	CONSTRAINT `loginTokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `loginTokens_tokenHash_unique` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
CREATE TABLE `matches` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`matchDate` char(10) NOT NULL,
	`kickoffAt` datetime(3) NOT NULL,
	`signupOpensAt` datetime(3) NOT NULL,
	`guestPhaseAt` datetime(3) NOT NULL,
	`lockAt` datetime(3) NOT NULL,
	`venue` varchar(160) NOT NULL DEFAULT '',
	`costAgorot` int unsigned NOT NULL,
	`capacity` smallint unsigned NOT NULL,
	`status` enum('scheduled','locked','played','cancelled') NOT NULL DEFAULT 'scheduled',
	`notes` text,
	`createdAt` datetime(3) NOT NULL,
	`updatedAt` datetime(3) NOT NULL,
	CONSTRAINT `matches_id` PRIMARY KEY(`id`),
	CONSTRAINT `matches_matchDate_unique` UNIQUE(`matchDate`)
);
--> statement-breakpoint
CREATE TABLE `members` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`role` enum('member','admin') NOT NULL DEFAULT 'member',
	`locale` varchar(5) NOT NULL DEFAULT 'en',
	`status` enum('active','disabled') NOT NULL DEFAULT 'active',
	`createdAt` datetime(3) NOT NULL,
	`updatedAt` datetime(3) NOT NULL,
	CONSTRAINT `members_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notificationLog` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`eventKey` varchar(200) NOT NULL,
	`memberId` int unsigned NOT NULL,
	`sentAt` datetime(3) NOT NULL,
	CONSTRAINT `notificationLog_id` PRIMARY KEY(`id`),
	CONSTRAINT `notificationLog_eventKey_memberId_unique` UNIQUE(`eventKey`,`memberId`)
);
--> statement-breakpoint
CREATE TABLE `notificationPrefs` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`memberId` int unsigned NOT NULL,
	`category` enum('signup_open','guest_phase','lock_reminder','queue_offer','bill_ready','payment_reminder') NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	CONSTRAINT `notificationPrefs_id` PRIMARY KEY(`id`),
	CONSTRAINT `notificationPrefs_memberId_category_unique` UNIQUE(`memberId`,`category`)
);
--> statement-breakpoint
CREATE TABLE `paymentAllocations` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`paymentId` int unsigned NOT NULL,
	`billingMonth` char(7) NOT NULL,
	`amountAgorot` int NOT NULL,
	`createdAt` datetime(3) NOT NULL,
	CONSTRAINT `paymentAllocations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`memberId` int unsigned NOT NULL,
	`amountAgorot` int NOT NULL,
	`paidAt` datetime(3) NOT NULL,
	`method` enum('paybox','cash','other') NOT NULL,
	`note` varchar(255),
	`recordedBy` int unsigned NOT NULL,
	`createdAt` datetime(3) NOT NULL,
	CONSTRAINT `payments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pushSubscriptions` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`memberId` int unsigned NOT NULL,
	`endpoint` varchar(500) NOT NULL,
	`p256dh` varchar(255) NOT NULL,
	`auth` varchar(255) NOT NULL,
	`userAgent` varchar(255),
	`createdAt` datetime(3) NOT NULL,
	CONSTRAINT `pushSubscriptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `pushSubscriptions_endpoint_unique` UNIQUE(`endpoint`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`memberId` int unsigned NOT NULL,
	`tokenHash` char(64) NOT NULL,
	`expiresAt` datetime(3) NOT NULL,
	`userAgent` varchar(255),
	`createdAt` datetime(3) NOT NULL,
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `sessions_tokenHash_unique` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` varchar(80) NOT NULL,
	`value` varchar(255) NOT NULL,
	`updatedAt` datetime(3) NOT NULL,
	CONSTRAINT `settings_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
ALTER TABLE `auditLog` ADD CONSTRAINT `auditLog_actorId_members_id_fk` FOREIGN KEY (`actorId`) REFERENCES `members`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `charges` ADD CONSTRAINT `charges_matchId_matches_id_fk` FOREIGN KEY (`matchId`) REFERENCES `matches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `charges` ADD CONSTRAINT `charges_memberId_members_id_fk` FOREIGN KEY (`memberId`) REFERENCES `members`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `charges` ADD CONSTRAINT `charges_waivedBy_members_id_fk` FOREIGN KEY (`waivedBy`) REFERENCES `members`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `entries` ADD CONSTRAINT `entries_matchId_matches_id_fk` FOREIGN KEY (`matchId`) REFERENCES `matches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `entries` ADD CONSTRAINT `entries_memberId_members_id_fk` FOREIGN KEY (`memberId`) REFERENCES `members`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `entries` ADD CONSTRAINT `entries_hostMemberId_members_id_fk` FOREIGN KEY (`hostMemberId`) REFERENCES `members`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_updatedBy_members_id_fk` FOREIGN KEY (`updatedBy`) REFERENCES `members`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `guestPayments` ADD CONSTRAINT `guestPayments_entryId_entries_id_fk` FOREIGN KEY (`entryId`) REFERENCES `entries`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `guestPayments` ADD CONSTRAINT `guestPayments_recordedBy_members_id_fk` FOREIGN KEY (`recordedBy`) REFERENCES `members`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `loginTokens` ADD CONSTRAINT `loginTokens_memberId_members_id_fk` FOREIGN KEY (`memberId`) REFERENCES `members`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notificationLog` ADD CONSTRAINT `notificationLog_memberId_members_id_fk` FOREIGN KEY (`memberId`) REFERENCES `members`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notificationPrefs` ADD CONSTRAINT `notificationPrefs_memberId_members_id_fk` FOREIGN KEY (`memberId`) REFERENCES `members`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `paymentAllocations` ADD CONSTRAINT `paymentAllocations_paymentId_payments_id_fk` FOREIGN KEY (`paymentId`) REFERENCES `payments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payments` ADD CONSTRAINT `payments_memberId_members_id_fk` FOREIGN KEY (`memberId`) REFERENCES `members`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payments` ADD CONSTRAINT `payments_recordedBy_members_id_fk` FOREIGN KEY (`recordedBy`) REFERENCES `members`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pushSubscriptions` ADD CONSTRAINT `pushSubscriptions_memberId_members_id_fk` FOREIGN KEY (`memberId`) REFERENCES `members`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_memberId_members_id_fk` FOREIGN KEY (`memberId`) REFERENCES `members`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `charges_memberId_billingMonth_idx` ON `charges` (`memberId`,`billingMonth`);--> statement-breakpoint
CREATE INDEX `entries_matchId_status_idx` ON `entries` (`matchId`,`status`);--> statement-breakpoint
CREATE INDEX `paymentAllocations_billingMonth_idx` ON `paymentAllocations` (`billingMonth`);