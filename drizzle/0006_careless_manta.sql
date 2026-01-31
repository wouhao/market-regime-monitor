ALTER TABLE `market_reports` ADD `btcState` enum('S1','S2','S3','S4');--> statement-breakpoint
ALTER TABLE `market_reports` ADD `btcLiquidityTag` enum('Expanding','Contracting','Unknown');--> statement-breakpoint
ALTER TABLE `market_reports` ADD `btcConfidence` enum('watch','confirmed');--> statement-breakpoint
ALTER TABLE `market_reports` ADD `btcEvidenceJson` json;