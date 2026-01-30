import { eq, desc, and, gte, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { 
  InsertUser, users, 
  marketReports, InsertMarketReport, MarketReport,
  marketSnapshots, InsertMarketSnapshot, MarketSnapshot,
  apiConfigs, InsertApiConfig, ApiConfig,
  systemSettings, InsertSystemSetting, SystemSetting,
  cryptoMetricsDaily, InsertCryptoMetricsDaily, CryptoMetricsDaily
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ============ User Functions ============

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ============ Market Report Functions ============

export async function saveMarketReport(report: InsertMarketReport): Promise<number> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }
  
  const result = await db.insert(marketReports).values(report);
  return result[0].insertId;
}

export async function getLatestReport(): Promise<MarketReport | null> {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db
    .select()
    .from(marketReports)
    .orderBy(desc(marketReports.createdAt))
    .limit(1);
  
  return result.length > 0 ? result[0] : null;
}

export async function getReportByDate(date: string): Promise<MarketReport | null> {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db
    .select()
    .from(marketReports)
    .where(eq(marketReports.reportDate, date))
    .limit(1);
  
  return result.length > 0 ? result[0] : null;
}

export async function getReportById(id: number): Promise<MarketReport | null> {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db
    .select()
    .from(marketReports)
    .where(eq(marketReports.id, id))
    .limit(1);
  
  return result.length > 0 ? result[0] : null;
}

export async function getReportHistory(limit: number = 30): Promise<MarketReport[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db
    .select()
    .from(marketReports)
    .orderBy(desc(marketReports.createdAt))
    .limit(limit);
}

export async function getReportsByDateRange(startDate: string, endDate: string): Promise<MarketReport[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db
    .select()
    .from(marketReports)
    .where(and(
      gte(marketReports.reportDate, startDate),
      lte(marketReports.reportDate, endDate)
    ))
    .orderBy(desc(marketReports.reportDate));
}

// ============ Market Snapshot Functions ============

export async function saveMarketSnapshots(reportId: number, snapshots: InsertMarketSnapshot[]): Promise<void> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }
  
  const snapshotsWithReportId = snapshots.map(s => ({ ...s, reportId }));
  await db.insert(marketSnapshots).values(snapshotsWithReportId);
}

export async function getSnapshotsByReportId(reportId: number): Promise<MarketSnapshot[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db
    .select()
    .from(marketSnapshots)
    .where(eq(marketSnapshots.reportId, reportId));
}

// ============ API Config Functions ============

export async function saveApiConfig(config: InsertApiConfig): Promise<void> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }
  
  // Check if config exists
  const existing = await db
    .select()
    .from(apiConfigs)
    .where(and(
      eq(apiConfigs.userId, config.userId),
      eq(apiConfigs.configKey, config.configKey)
    ))
    .limit(1);
  
  if (existing.length > 0) {
    await db
      .update(apiConfigs)
      .set({ configValue: config.configValue, isActive: config.isActive ?? true })
      .where(eq(apiConfigs.id, existing[0].id));
  } else {
    await db.insert(apiConfigs).values(config);
  }
}

export async function getApiConfigs(userId: number): Promise<ApiConfig[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db
    .select()
    .from(apiConfigs)
    .where(eq(apiConfigs.userId, userId));
}

export async function getApiConfigByKey(userId: number, key: string): Promise<ApiConfig | null> {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db
    .select()
    .from(apiConfigs)
    .where(and(
      eq(apiConfigs.userId, userId),
      eq(apiConfigs.configKey, key)
    ))
    .limit(1);
  
  return result.length > 0 ? result[0] : null;
}

export async function deleteApiConfig(userId: number, key: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  
  await db
    .delete(apiConfigs)
    .where(and(
      eq(apiConfigs.userId, userId),
      eq(apiConfigs.configKey, key)
    ));
}

// ============ System Settings Functions ============

export async function getSystemSetting(key: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.settingKey, key))
    .limit(1);
  
  return result.length > 0 ? result[0].settingValue : null;
}

export async function setSystemSetting(key: string, value: string, description?: string): Promise<void> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }
  
  const existing = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.settingKey, key))
    .limit(1);
  
  if (existing.length > 0) {
    await db
      .update(systemSettings)
      .set({ settingValue: value, description })
      .where(eq(systemSettings.settingKey, key));
  } else {
    await db.insert(systemSettings).values({
      settingKey: key,
      settingValue: value,
      description,
    });
  }
}

// ============ Crypto Metrics Daily Functions ============

export async function upsertCryptoMetricsDaily(metrics: InsertCryptoMetricsDaily): Promise<void> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }
  
  // 使用upsert：如果日期已存在则更新，否则插入
  const existing = await db
    .select()
    .from(cryptoMetricsDaily)
    .where(eq(cryptoMetricsDaily.dateBjt, metrics.dateBjt))
    .limit(1);
  
  if (existing.length > 0) {
    await db
      .update(cryptoMetricsDaily)
      .set({
        tsBjt: metrics.tsBjt,
        funding: metrics.funding,
        oiUsd: metrics.oiUsd,
        liq24hUsd: metrics.liq24hUsd,
        stableUsdtUsdcUsd: metrics.stableUsdtUsdcUsd,
        sourceFunding: metrics.sourceFunding,
        sourceOi: metrics.sourceOi,
        sourceLiq: metrics.sourceLiq,
        sourceStable: metrics.sourceStable,
        notes: metrics.notes,
      })
      .where(eq(cryptoMetricsDaily.dateBjt, metrics.dateBjt));
  } else {
    await db.insert(cryptoMetricsDaily).values(metrics);
  }
}

export async function getCryptoMetricsByDate(dateBjt: string): Promise<CryptoMetricsDaily | null> {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db
    .select()
    .from(cryptoMetricsDaily)
    .where(eq(cryptoMetricsDaily.dateBjt, dateBjt))
    .limit(1);
  
  return result.length > 0 ? result[0] : null;
}

export async function getCryptoMetricsHistory(days: number = 30): Promise<CryptoMetricsDaily[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db
    .select()
    .from(cryptoMetricsDaily)
    .orderBy(desc(cryptoMetricsDaily.dateBjt))
    .limit(days);
}

// 获取指定天数前的指标数据（用于计算变化率）
export async function getCryptoMetricsDaysAgo(daysAgo: number): Promise<CryptoMetricsDaily | null> {
  const db = await getDb();
  if (!db) return null;
  
  // 计算目标日期（北京时间）
  const now = new Date();
  const bjTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  bjTime.setDate(bjTime.getDate() - daysAgo);
  const targetDate = bjTime.toISOString().split("T")[0];
  
  const result = await db
    .select()
    .from(cryptoMetricsDaily)
    .where(eq(cryptoMetricsDaily.dateBjt, targetDate))
    .limit(1);
  
  return result.length > 0 ? result[0] : null;
}


// ============ AI Analysis Functions ============

export interface AIAnalysisData {
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
}

export async function updateReportAIAnalysis(reportId: number, aiAnalysis: AIAnalysisData): Promise<void> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }
  
  await db
    .update(marketReports)
    .set({ aiAnalysis })
    .where(eq(marketReports.id, reportId));
}

export async function getReportAIAnalysis(reportId: number): Promise<AIAnalysisData | null> {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db
    .select({ aiAnalysis: marketReports.aiAnalysis })
    .from(marketReports)
    .where(eq(marketReports.id, reportId))
    .limit(1);
  
  return result.length > 0 ? result[0].aiAnalysis as AIAnalysisData | null : null;
}
