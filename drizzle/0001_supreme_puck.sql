CREATE TABLE `checkpoints` (
	`id` int AUTO_INCREMENT NOT NULL,
	`threadId` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`checkpoint` text NOT NULL,
	`metadata` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `checkpoints_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `checkpoints` ADD CONSTRAINT `checkpoints_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;