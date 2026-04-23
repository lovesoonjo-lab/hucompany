ALTER TABLE `user_settings` ADD `gcsProjectId` varchar(255);--> statement-breakpoint
ALTER TABLE `user_settings` ADD `gcsBucketName` varchar(255);--> statement-breakpoint
ALTER TABLE `user_settings` ADD `gcsServiceAccountEmail` varchar(320);--> statement-breakpoint
ALTER TABLE `user_settings` ADD `gcsPrivateKey` text;--> statement-breakpoint
ALTER TABLE `user_settings` ADD `gcsVerifiedAt` timestamp;