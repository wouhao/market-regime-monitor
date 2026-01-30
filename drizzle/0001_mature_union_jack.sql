CREATE TABLE `api_configs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`configKey` varchar(50) NOT NULL,
	`configValue` text NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `api_configs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `market_reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reportDate` varchar(10) NOT NULL,
	`regime` enum('risk_on','risk_off','base') NOT NULL,
	`status` enum('watch','confirmed') NOT NULL,
	`confidence` decimal(5,2) NOT NULL,
	`marginBorrow` varchar(20) NOT NULL,
	`putSelling` varchar(20) NOT NULL,
	`spotPace` varchar(20) NOT NULL,
	`triggeredRules` json DEFAULT ('[]'),
	`untriggeredRules` json DEFAULT ('[]'),
	`dataQuality` decimal(5,2) NOT NULL,
	`reportContent` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `market_reports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `market_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reportId` int NOT NULL,
	`indicator` varchar(50) NOT NULL,
	`displayName` varchar(100) NOT NULL,
	`latestValue` decimal(20,6),
	`change1d` decimal(10,4),
	`change7d` decimal(10,4),
	`change30d` decimal(10,4),
	`ma20` decimal(20,6),
	`aboveMa20` boolean,
	`sparklineData` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `market_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `system_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`settingKey` varchar(50) NOT NULL,
	`settingValue` text NOT NULL,
	`description` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `system_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `system_settings_settingKey_unique` UNIQUE(`settingKey`)
);
