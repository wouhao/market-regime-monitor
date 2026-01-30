import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, json, boolean } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Market Reports - 存储每日市场状态报告
 */
export const marketReports = mysqlTable("market_reports", {
  id: int("id").autoincrement().primaryKey(),
  reportDate: varchar("reportDate", { length: 10 }).notNull(), // YYYY-MM-DD
  regime: mysqlEnum("regime", ["risk_on", "risk_off", "base"]).notNull(),
  status: mysqlEnum("status", ["watch", "confirmed"]).notNull(),
  confidence: decimal("confidence", { precision: 5, scale: 2 }).notNull(),
  marginBorrow: varchar("marginBorrow", { length: 20 }).notNull(),
  putSelling: varchar("putSelling", { length: 20 }).notNull(),
  spotPace: varchar("spotPace", { length: 20 }).notNull(),
  triggeredRules: json("triggeredRules").$type<string[]>(),
  untriggeredRules: json("untriggeredRules").$type<string[]>(),
  dataQuality: decimal("dataQuality", { precision: 5, scale: 2 }).notNull(),
  reportContent: text("reportContent"), // Markdown内容
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MarketReport = typeof marketReports.$inferSelect;
export type InsertMarketReport = typeof marketReports.$inferInsert;

/**
 * Market Snapshots - 存储市场指标快照数据
 */
export const marketSnapshots = mysqlTable("market_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  reportId: int("reportId").notNull(),
  indicator: varchar("indicator", { length: 50 }).notNull(), // BTC-USD, QQQ, GLD, VIX等
  displayName: varchar("displayName", { length: 100 }).notNull(),
  latestValue: decimal("latestValue", { precision: 20, scale: 6 }),
  change1d: decimal("change1d", { precision: 10, scale: 4 }),
  change7d: decimal("change7d", { precision: 10, scale: 4 }),
  change30d: decimal("change30d", { precision: 10, scale: 4 }),
  ma20: decimal("ma20", { precision: 20, scale: 6 }),
  aboveMa20: boolean("aboveMa20"),
  sparklineData: json("sparklineData").$type<number[]>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MarketSnapshot = typeof marketSnapshots.$inferSelect;
export type InsertMarketSnapshot = typeof marketSnapshots.$inferInsert;

/**
 * API Configs - 存储API密钥配置
 */
export const apiConfigs = mysqlTable("api_configs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  configKey: varchar("configKey", { length: 50 }).notNull(), // FRED_API_KEY, COINGLASS_API_KEY
  configValue: text("configValue").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ApiConfig = typeof apiConfigs.$inferSelect;
export type InsertApiConfig = typeof apiConfigs.$inferInsert;

/**
 * System Settings - 存储系统配置
 */
export const systemSettings = mysqlTable("system_settings", {
  id: int("id").autoincrement().primaryKey(),
  settingKey: varchar("settingKey", { length: 50 }).notNull().unique(),
  settingValue: text("settingValue").notNull(),
  description: text("description"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SystemSetting = typeof systemSettings.$inferSelect;
export type InsertSystemSetting = typeof systemSettings.$inferInsert;
