CREATE TABLE `crypto_metrics_daily` (
	`id` int AUTO_INCREMENT NOT NULL,
	`dateBjt` varchar(10) NOT NULL,
	`tsBjt` int NOT NULL,
	`funding` decimal(20,10),
	`oiUsd` decimal(20,2),
	`liq24hUsd` decimal(20,2),
	`stableUsdtUsdcUsd` decimal(20,2),
	`sourceFunding` varchar(50),
	`sourceOi` varchar(50),
	`sourceLiq` varchar(100),
	`sourceStable` varchar(50),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `crypto_metrics_daily_id` PRIMARY KEY(`id`),
	CONSTRAINT `crypto_metrics_daily_dateBjt_unique` UNIQUE(`dateBjt`)
);
