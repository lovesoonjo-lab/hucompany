CREATE TABLE `youtube_channels` (
	`id` int AUTO_INCREMENT NOT NULL,
	`youtubeChannelId` varchar(128) NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`thumbnailUrl` text,
	`country` varchar(8) NOT NULL,
	`youtubeChannelTopic` enum('shopping','news','info','psychology','economics','beauty','cooking','tech','music','vlog','animation','kids') NOT NULL,
	`subscriberCount` int NOT NULL DEFAULT 0,
	`viewCount` int NOT NULL DEFAULT 0,
	`videoCount` int NOT NULL DEFAULT 0,
	`lastSyncedAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `youtube_channels_id` PRIMARY KEY(`id`),
	CONSTRAINT `youtube_channels_youtubeChannelId_unique` UNIQUE(`youtubeChannelId`)
);
--> statement-breakpoint
ALTER TABLE `user_settings` ADD `openRouterApiKey` text;