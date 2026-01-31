CREATE TABLE `btc_etf_flows` (
	`id` int AUTO_INCREMENT NOT NULL,
	`date` varchar(10) NOT NULL,
	`total` decimal(12,2),
	`ibit` decimal(12,2),
	`fbtc` decimal(12,2),
	`gbtc` decimal(12,2),
	`unit` varchar(10) NOT NULL DEFAULT 'US$m',
	`sourceUrl` text,
	`fetchTimeUtc` timestamp,
	`httpStatus` int,
	`parseStatus` enum('success','partial','failed'),
	`missingReason` text,
	`rawRowSnippet` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `btc_etf_flows_id` PRIMARY KEY(`id`),
	CONSTRAINT `btc_etf_flows_date_unique` UNIQUE(`date`)
);
