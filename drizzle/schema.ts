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
  // AI分析结果
  aiAnalysis: json("aiAnalysis").$type<{
    conclusion: string;
    evidenceChain: string[];
    leverageJudgment: string;
    switchRationale: {
      margin: string;
      put: string;
      spot: string;
    };
    riskAlerts: string[];
    fullText: string;
    generatedAt: number;
  }>(),
  // BTC市场分析独立模块
  btcState: mysqlEnum("btcState", ["S1", "S2", "S3", "S4"]), // S1杠杆堆积/S2去杠杆/S3低杠杆修复/S4中性
  btcLiquidityTag: mysqlEnum("btcLiquidityTag", ["Expanding", "Contracting", "Unknown"]),
  btcConfidence: mysqlEnum("btcConfidence", ["watch", "confirmed"]),
  btcEvidenceJson: json("btcEvidenceJson").$type<{
    price: { latest: number | null; pct7d: number | null; pct30d: number | null; asOf: string };
    oi: { latest: number | null; pct7d: number | null; abs7d: number | null; asOf: string };
    funding: { latest: number | null; avg7d: number | null; asOf: string };
    liquidations: { h24: number | null; total7d: number | null; avg7d: number | null; asOf: string; missingDays?: number };
    stablecoin: { latest: number | null; pct7d: number | null; pct30d: number | null; asOf: string };
    etfFlow: { today: number | null; rolling5d: number | null; rolling20d: number | null; asOfDate: string; fetchTimeUtc: string | null; tag: "Supportive" | "Drag" | "Neutral"; tagReason: string };
    missingFields: string[];
  }>(),
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

/**
 * Crypto Metrics Daily - 存储加密指标日频快照（用于计算趋势变化）
 */
export const cryptoMetricsDaily = mysqlTable("crypto_metrics_daily", {
  id: int("id").autoincrement().primaryKey(),
  dateBjt: varchar("dateBjt", { length: 10 }).notNull().unique(), // YYYY-MM-DD 北京时间
  tsBjt: int("tsBjt").notNull(), // Unix时间戳(秒)
  // 加密指标值
  funding: decimal("funding", { precision: 20, scale: 10 }), // BTC Funding Rate (%)
  oiUsd: decimal("oiUsd", { precision: 20, scale: 2 }), // BTC Open Interest (USD)
  liq24hUsd: decimal("liq24hUsd", { precision: 20, scale: 2 }), // BTC Liquidations 24h (USD)
  stableUsdtUsdcUsd: decimal("stableUsdtUsdcUsd", { precision: 20, scale: 2 }), // Stablecoin Supply (USD)
  // 数据源元数据
  sourceFunding: varchar("sourceFunding", { length: 50 }),
  sourceOi: varchar("sourceOi", { length: 50 }),
  sourceLiq: varchar("sourceLiq", { length: 100 }),
  sourceStable: varchar("sourceStable", { length: 50 }),
  // 备注（JSON字符串：missing_reason, symbol, unit, asof等）
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CryptoMetricsDaily = typeof cryptoMetricsDaily.$inferSelect;
export type InsertCryptoMetricsDaily = typeof cryptoMetricsDaily.$inferInsert;

/**
 * BTC ETF Flows - 存储BTC现货ETF日净流入数据
 */
export const btcEtfFlows = mysqlTable("btc_etf_flows", {
  id: int("id").autoincrement().primaryKey(),
  date: varchar("date", { length: 10 }).notNull().unique(), // 交易日期 YYYY-MM-DD (as_of_date)
  total: decimal("total", { precision: 12, scale: 2 }), // Total Net Flow (US$m)
  ibit: decimal("ibit", { precision: 12, scale: 2 }), // IBIT
  fbtc: decimal("fbtc", { precision: 12, scale: 2 }), // FBTC
  gbtc: decimal("gbtc", { precision: 12, scale: 2 }), // GBTC
  unit: varchar("unit", { length: 10 }).default("US$m").notNull(), // 单位
  sourceUrl: text("sourceUrl"), // 数据源URL
  fetchTimeUtc: timestamp("fetchTimeUtc"), // 抓取时间 (UTC)
  httpStatus: int("httpStatus"), // HTTP状态码
  parseStatus: mysqlEnum("parseStatus", ["success", "partial", "failed"]), // 解析状态
  missingReason: text("missingReason"), // 失败原因
  rawRowSnippet: text("rawRowSnippet"), // 原始行截断
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type BtcEtfFlow = typeof btcEtfFlows.$inferSelect;
export type InsertBtcEtfFlow = typeof btcEtfFlows.$inferInsert;
