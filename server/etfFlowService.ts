/**
 * BTC Spot ETF Flow Service
 * 抓取Farside Investors的BTC ETF日净流入数据
 * 
 * 数据源: https://farside.co.uk/bitcoin-etf-flow-all-data/
 * 单位: US$m (百万美元)
 * 
 * 解析规则:
 * - (528.3) → -528.3 (括号表示负数)
 * - "-" → null (缺失数据)
 * - 0.0 → 0 (零值)
 */

import { getDb, getSystemSetting, setSystemSetting } from "./db";
import { btcEtfFlows, systemSettings } from "../drizzle/schema";
import { eq, desc, lte } from "drizzle-orm";

const FARSIDE_URL = "https://farside.co.uk/bitcoin-etf-flow-all-data/";

// 需要提取的列索引 (基于表头顺序)
// Date(0), IBIT(1), FBTC(2), BITB(3), ARKB(4), BTCO(5), EZBC(6), BRRR(7), HODL(8), BTCW(9), GBTC(10), BTC(11), Total(12)
const COLUMN_INDICES = {
  date: 0,
  ibit: 1,
  fbtc: 2,
  gbtc: 10,
  total: 12
};

export interface EtfFlowData {
  date: string; // YYYY-MM-DD
  total: number | null;
  ibit: number | null;
  fbtc: number | null;
  gbtc: number | null;
  totalExGbtc: number | null; // total - gbtc (如果gbtc为null则为null)
  totalExGbtcReason?: string; // 为null的原因
}

export interface EtfFlowManifest {
  sourceUrl: string;
  fetchTimeUtc: string;
  asOfDate: string;
  unit: string;
  parseStatus: "success" | "partial" | "failed";
  httpStatus: number;
  missingReason?: string;
  rawRowSnippet?: string;
}

export interface EtfFlowWithRolling extends EtfFlowData {
  rolling5d: number | null;
  rolling5dReason?: string;
  rolling20d: number | null;
  rolling20dReason?: string;
  alert?: string;
}

/**
 * 解析Farside数据值
 * - (528.3) → -528.3
 * - "-" → null
 * - "0.0" → 0
 */
function parseValue(value: string): number | null {
  if (!value || value === "-" || value.trim() === "") {
    return null;
  }
  
  // 移除逗号
  let cleaned = value.replace(/,/g, "");
  
  // 处理括号表示的负数
  if (cleaned.startsWith("(") && cleaned.endsWith(")")) {
    cleaned = "-" + cleaned.slice(1, -1);
  }
  
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * 解析日期格式
 * "30 Jan 2026" → "2026-01-30"
 */
function parseDate(dateStr: string): string | null {
  const months: Record<string, string> = {
    "Jan": "01", "Feb": "02", "Mar": "03", "Apr": "04",
    "May": "05", "Jun": "06", "Jul": "07", "Aug": "08",
    "Sep": "09", "Oct": "10", "Nov": "11", "Dec": "12"
  };
  
  const match = dateStr.match(/(\d{1,2})\s+(\w{3})\s+(\d{4})/);
  if (!match) return null;
  
  const [, day, monthStr, year] = match;
  const month = months[monthStr];
  if (!month) return null;
  
  return `${year}-${month}-${day.padStart(2, "0")}`;
}

/**
 * 从HTML中提取表格数据
 */
function parseHtmlTable(html: string): { rows: string[][], rawSnippet: string } {
  const rows: string[][] = [];
  let rawSnippet = "";
  
  // 使用正则提取表格行
  const tableMatches = html.match(/<table[^>]*>[\s\S]*?<\/table>/gi);
  if (!tableMatches || tableMatches.length < 2) {
    return { rows, rawSnippet: "No data table found" };
  }
  
  // 第二个表格是数据表
  const dataTable = tableMatches[1];
  
  // 提取所有行
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  
  while ((rowMatch = rowRegex.exec(dataTable)) !== null) {
    const rowHtml = rowMatch[1];
    const cells: string[] = [];
    
    // 提取单元格内容
    const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let cellMatch;
    
    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      // 清理HTML标签和空白
      const text = cellMatch[1]
        .replace(/<[^>]*>/g, "")
        .replace(/&nbsp;/g, " ")
        .trim();
      cells.push(text);
    }
    
    if (cells.length > 0) {
      rows.push(cells);
    }
  }
  
  // 保存最后几行作为原始片段
  if (rows.length > 5) {
    const lastRows = rows.slice(-5);
    rawSnippet = lastRows.map(r => r.join(" | ")).join("\n");
  }
  
  return { rows, rawSnippet };
}

/**
 * 抓取Farside ETF数据
 */
export async function fetchFarsideData(): Promise<{
  data: EtfFlowData[];
  manifest: EtfFlowManifest;
}> {
  const fetchTimeUtc = new Date().toISOString();
  let httpStatus = 0;
  let parseStatus: "success" | "partial" | "failed" = "failed";
  let missingReason: string | undefined;
  let rawRowSnippet: string | undefined;
  const data: EtfFlowData[] = [];
  
  try {
    console.log("[ETF Service] Fetching data from Farside...");
    
    const response = await fetch(FARSIDE_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      }
    });
    
    httpStatus = response.status;
    
    if (!response.ok) {
      missingReason = `HTTP error: ${response.status} ${response.statusText}`;
      return {
        data,
        manifest: {
          sourceUrl: FARSIDE_URL,
          fetchTimeUtc,
          asOfDate: "",
          unit: "US$m",
          parseStatus: "failed",
          httpStatus,
          missingReason
        }
      };
    }
    
    const html = await response.text();
    const { rows, rawSnippet } = parseHtmlTable(html);
    rawRowSnippet = rawSnippet;
    
    console.log(`[ETF Service] Parsed ${rows.length} rows from table`);
    
    if (rows.length < 2) {
      missingReason = "Table parsing failed: insufficient rows";
      return {
        data,
        manifest: {
          sourceUrl: FARSIDE_URL,
          fetchTimeUtc,
          asOfDate: "",
          unit: "US$m",
          parseStatus: "failed",
          httpStatus,
          missingReason,
          rawRowSnippet
        }
      };
    }
    
    // 跳过表头行，解析数据行
    let successCount = 0;
    let partialCount = 0;
    let latestDate = "";
    
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      
      // 跳过统计行 (Total, Average, Maximum, Minimum)
      if (row[0] && ["Total", "Average", "Maximum", "Minimum"].includes(row[0])) {
        continue;
      }
      
      // 解析日期
      const date = parseDate(row[COLUMN_INDICES.date]);
      if (!date) continue;
      
      // 解析数值
      const total = parseValue(row[COLUMN_INDICES.total]);
      const ibit = parseValue(row[COLUMN_INDICES.ibit]);
      const fbtc = parseValue(row[COLUMN_INDICES.fbtc]);
      const gbtc = parseValue(row[COLUMN_INDICES.gbtc]);
      
      // 计算 total_ex_gbtc
      let totalExGbtc: number | null = null;
      let totalExGbtcReason: string | undefined;
      
      if (total !== null && gbtc !== null) {
        totalExGbtc = total - gbtc;
      } else if (gbtc === null) {
        totalExGbtcReason = "GBTC value is missing";
      } else if (total === null) {
        totalExGbtcReason = "Total value is missing";
      }
      
      data.push({
        date,
        total,
        ibit,
        fbtc,
        gbtc,
        totalExGbtc,
        totalExGbtcReason
      });
      
      // 统计解析状态
      if (total !== null && ibit !== null && fbtc !== null && gbtc !== null) {
        successCount++;
      } else {
        partialCount++;
      }
      
      // 记录最新日期
      if (date > latestDate) {
        latestDate = date;
      }
    }
    
    // 确定解析状态
    if (successCount > 0 && partialCount === 0) {
      parseStatus = "success";
    } else if (successCount > 0) {
      parseStatus = "partial";
      missingReason = `${partialCount} rows have missing values`;
    } else {
      parseStatus = "failed";
      missingReason = "No valid data rows parsed";
    }
    
    console.log(`[ETF Service] Parse complete: ${successCount} success, ${partialCount} partial, latest date: ${latestDate}`);
    
    return {
      data,
      manifest: {
        sourceUrl: FARSIDE_URL,
        fetchTimeUtc,
        asOfDate: latestDate,
        unit: "US$m",
        parseStatus,
        httpStatus,
        missingReason,
        rawRowSnippet
      }
    };
    
  } catch (error) {
    console.error("[ETF Service] Fetch error:", error);
    missingReason = error instanceof Error ? error.message : "Unknown error";
    
    return {
      data,
      manifest: {
        sourceUrl: FARSIDE_URL,
        fetchTimeUtc,
        asOfDate: "",
        unit: "US$m",
        parseStatus: "failed",
        httpStatus,
        missingReason
      }
    };
  }
}

/**
 * 保存ETF数据到数据库 (upsert)
 */
export async function saveEtfFlowData(
  data: EtfFlowData[],
  manifest: EtfFlowManifest
): Promise<{ inserted: number; updated: number }> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }
  
  let inserted = 0;
  let updated = 0;
  
  for (const row of data) {
    try {
      // 检查是否已存在
      const existing = await db
        .select()
        .from(btcEtfFlows)
        .where(eq(btcEtfFlows.date, row.date))
        .limit(1);
      
      const record = {
        date: row.date,
        total: row.total !== null ? String(row.total) : null,
        ibit: row.ibit !== null ? String(row.ibit) : null,
        fbtc: row.fbtc !== null ? String(row.fbtc) : null,
        gbtc: row.gbtc !== null ? String(row.gbtc) : null,
        unit: manifest.unit,
        sourceUrl: manifest.sourceUrl,
        fetchTimeUtc: new Date(manifest.fetchTimeUtc),
        httpStatus: manifest.httpStatus,
        parseStatus: manifest.parseStatus,
        missingReason: manifest.missingReason || null,
        rawRowSnippet: manifest.rawRowSnippet || null
      };
      
      if (existing.length > 0) {
        // 更新
        await db
          .update(btcEtfFlows)
          .set(record)
          .where(eq(btcEtfFlows.date, row.date));
        updated++;
      } else {
        // 插入
        await db.insert(btcEtfFlows).values(record);
        inserted++;
      }
    } catch (error) {
      console.error(`[ETF Service] Error saving row for ${row.date}:`, error);
    }
  }
  
  console.log(`[ETF Service] Saved ${inserted} new, ${updated} updated records`);
  return { inserted, updated };
}

/**
 * 计算滚动平均 (5D/20D交易日)
 * 如果窗口内有任何NULL值，返回NULL并说明原因
 */
export async function calculateRolling(
  date: string,
  windowSize: number
): Promise<{ value: number | null; reason?: string }> {
  const db = await getDb();
  if (!db) {
    return { value: null, reason: "Database not available" };
  }
  
  // 获取该日期及之前的N个交易日数据
  const records = await db
    .select()
    .from(btcEtfFlows)
    .where(lte(btcEtfFlows.date, date))
    .orderBy(desc(btcEtfFlows.date))
    .limit(windowSize);
  
  if (records.length < windowSize) {
    return {
      value: null,
      reason: `Insufficient data: only ${records.length} of ${windowSize} trading days available`
    };
  }
  
  // 检查是否有NULL值
  const nullDates: string[] = [];
  let sum = 0;
  
  for (const record of records) {
    if (record.total === null) {
      nullDates.push(record.date);
    } else {
      sum += parseFloat(record.total);
    }
  }
  
  if (nullDates.length > 0) {
    return {
      value: null,
      reason: `Missing total values on: ${nullDates.join(", ")}`
    };
  }
  
  return {
    value: sum / windowSize
  };
}

/**
 * 获取最新的ETF Flow数据（带滚动计算）
 */
export async function getLatestEtfFlow(): Promise<EtfFlowWithRolling | null> {
  const db = await getDb();
  if (!db) return null;
  
  const latest = await db
    .select()
    .from(btcEtfFlows)
    .orderBy(desc(btcEtfFlows.date))
    .limit(1);
  
  if (latest.length === 0) return null;
  
  const record = latest[0];
  
  // 计算 total_ex_gbtc
  let totalExGbtc: number | null = null;
  let totalExGbtcReason: string | undefined;
  
  if (record.total !== null && record.gbtc !== null) {
    totalExGbtc = parseFloat(record.total) - parseFloat(record.gbtc);
  } else if (record.gbtc === null) {
    totalExGbtcReason = "GBTC value is missing";
  } else if (record.total === null) {
    totalExGbtcReason = "Total value is missing";
  }
  
  // 计算滚动平均
  const rolling5d = await calculateRolling(record.date, 5);
  const rolling20d = await calculateRolling(record.date, 20);
  
  // 生成提示
  const alert = generateAlert({
    date: record.date,
    total: record.total !== null ? parseFloat(record.total) : null,
    ibit: record.ibit !== null ? parseFloat(record.ibit) : null,
    fbtc: record.fbtc !== null ? parseFloat(record.fbtc) : null,
    gbtc: record.gbtc !== null ? parseFloat(record.gbtc) : null,
    totalExGbtc,
    totalExGbtcReason
  }, rolling5d.value, rolling20d.value);
  
  return {
    date: record.date,
    total: record.total !== null ? parseFloat(record.total) : null,
    ibit: record.ibit !== null ? parseFloat(record.ibit) : null,
    fbtc: record.fbtc !== null ? parseFloat(record.fbtc) : null,
    gbtc: record.gbtc !== null ? parseFloat(record.gbtc) : null,
    totalExGbtc,
    totalExGbtcReason,
    rolling5d: rolling5d.value,
    rolling5dReason: rolling5d.reason,
    rolling20d: rolling20d.value,
    rolling20dReason: rolling20d.reason,
    alert
  };
}

/**
 * 生成ETF Flow提示
 */
function generateAlert(
  data: EtfFlowData,
  rolling5d: number | null,
  rolling20d: number | null
): string {
  const alerts: string[] = [];
  
  // 单日大额流入/流出
  if (data.total !== null) {
    if (data.total > 500) {
      alerts.push(`Large inflow: ${data.total.toFixed(1)}m`);
    } else if (data.total < -500) {
      alerts.push(`Large outflow: ${data.total.toFixed(1)}m`);
    }
  }
  
  // GBTC噪音检测
  if (data.gbtc !== null && data.totalExGbtc !== null) {
    const gbtcRatio = Math.abs(data.gbtc) / (Math.abs(data.total || 1));
    if (gbtcRatio > 0.5 && Math.abs(data.gbtc) > 100) {
      alerts.push(`GBTC noise: ${data.gbtc.toFixed(1)}m (${(gbtcRatio * 100).toFixed(0)}% of total)`);
    }
  }
  
  // 滚动趋势
  if (rolling5d !== null && rolling20d !== null) {
    if (rolling5d > rolling20d * 1.5) {
      alerts.push("Short-term momentum: 5D > 20D by 50%+");
    } else if (rolling5d < rolling20d * 0.5) {
      alerts.push("Weakening momentum: 5D < 20D by 50%+");
    }
  }
  
  // IBIT主导检测
  if (data.ibit !== null && data.total !== null && data.total !== 0) {
    const ibitRatio = data.ibit / data.total;
    if (Math.abs(ibitRatio) > 0.7) {
      alerts.push(`IBIT dominated: ${(ibitRatio * 100).toFixed(0)}% of total`);
    }
  }
  
  return alerts.length > 0 ? alerts.join(" | ") : "No significant signals";
}

/**
 * 检查ETF Flow模块是否启用
 */
export async function isEtfFlowEnabled(): Promise<boolean> {
  try {
    const value = await getSystemSetting("etf_flow_enabled");
    if (value === null) {
      // 默认启用
      return true;
    }
    return value === "true";
  } catch (error) {
    console.error("[ETF Service] Error checking settings:", error);
    return true; // 默认启用
  }
}

/**
 * 设置ETF Flow模块启用状态
 */
export async function setEtfFlowEnabled(enabled: boolean): Promise<void> {
  await setSystemSetting(
    "etf_flow_enabled",
    enabled ? "true" : "false",
    "Enable/disable BTC ETF Flow module"
  );
}

/**
 * 获取历史ETF Flow数据
 */
export async function getEtfFlowHistory(
  limit: number = 30
): Promise<EtfFlowData[]> {
  const db = await getDb();
  if (!db) return [];
  
  const records = await db
    .select()
    .from(btcEtfFlows)
    .orderBy(desc(btcEtfFlows.date))
    .limit(limit);
  
  return records.map((record) => ({
    date: record.date,
    total: record.total !== null ? parseFloat(record.total) : null,
    ibit: record.ibit !== null ? parseFloat(record.ibit) : null,
    fbtc: record.fbtc !== null ? parseFloat(record.fbtc) : null,
    gbtc: record.gbtc !== null ? parseFloat(record.gbtc) : null,
    totalExGbtc: record.total !== null && record.gbtc !== null
      ? parseFloat(record.total) - parseFloat(record.gbtc)
      : null,
    totalExGbtcReason: record.gbtc === null ? "GBTC value is missing" : undefined
  }));
}

/**
 * 获取ETF Flow历史数据（带滚动平均计算，用于图表展示）
 */
export interface EtfFlowChartData {
  date: string;
  total: number | null;
  rolling5d: number | null;
  rolling20d: number | null;
}

export async function getEtfFlowHistoryWithRolling(
  limit: number = 30
): Promise<EtfFlowChartData[]> {
  const db = await getDb();
  if (!db) return [];
  
  // 获取足够的数据用于计算20日滚动平均
  const extraDays = 20;
  const records = await db
    .select()
    .from(btcEtfFlows)
    .orderBy(desc(btcEtfFlows.date))
    .limit(limit + extraDays);
  
  if (records.length === 0) return [];
  
  // 计算每一天的滚动平均
  const result: EtfFlowChartData[] = [];
  
  for (let i = 0; i < Math.min(limit, records.length); i++) {
    const record = records[i];
    const total = record.total !== null ? parseFloat(record.total) : null;
    
    // 计算5D滚动平均
    let rolling5d: number | null = null;
    if (i + 5 <= records.length) {
      const window5 = records.slice(i, i + 5);
      const values5 = window5.map(r => r.total !== null ? parseFloat(r.total) : null);
      if (values5.every(v => v !== null)) {
        rolling5d = (values5 as number[]).reduce((a, b) => a + b, 0) / 5;
      }
    }
    
    // 计算20D滚动平均
    let rolling20d: number | null = null;
    if (i + 20 <= records.length) {
      const window20 = records.slice(i, i + 20);
      const values20 = window20.map(r => r.total !== null ? parseFloat(r.total) : null);
      if (values20.every(v => v !== null)) {
        rolling20d = (values20 as number[]).reduce((a, b) => a + b, 0) / 20;
      }
    }
    
    result.push({
      date: record.date,
      total,
      rolling5d,
      rolling20d
    });
  }
  
  // 返回按日期升序排列（图表从左到右显示）
  return result.reverse();
}

/**
 * 判断是否为交易日
 * 简单实现：排除周六日
 */
export function isTradingDay(date: Date): boolean {
  // 使用UTC日期避免时区问题
  const day = date.getUTCDay();
  return day !== 0 && day !== 6; // 0=周日, 6=周六
}

/**
 * 获取上一个交易日
 */
export function getLastTradingDay(): string {
  const now = new Date();
  let date = new Date(now);
  
  // 如果当前是周末，回退到周五
  while (!isTradingDay(date)) {
    date.setDate(date.getDate() - 1);
  }
  
  // 如果是交易日但还没到美股收盘时间(UTC 21:00)，使用前一个交易日
  const utcHour = now.getUTCHours();
  if (utcHour < 21) {
    date.setDate(date.getDate() - 1);
    while (!isTradingDay(date)) {
      date.setDate(date.getDate() - 1);
    }
  }
  
  return date.toISOString().split("T")[0];
}

/**
 * 执行ETF数据抓取和保存
 */
export async function runEtfFlowFetch(): Promise<{
  success: boolean;
  message: string;
  manifest?: EtfFlowManifest;
}> {
  // 检查是否启用
  const enabled = await isEtfFlowEnabled();
  if (!enabled) {
    return {
      success: false,
      message: "ETF Flow module is disabled"
    };
  }
  
  // 抓取数据
  const { data, manifest } = await fetchFarsideData();
  
  if (manifest.parseStatus === "failed") {
    return {
      success: false,
      message: manifest.missingReason || "Failed to fetch data",
      manifest
    };
  }
  
  // 保存数据
  const { inserted, updated } = await saveEtfFlowData(data, manifest);
  
  return {
    success: true,
    message: `Fetched ${data.length} records, inserted ${inserted}, updated ${updated}`,
    manifest
  };
}

/**
 * 获取ETF Flow数据统计
 */
export async function getEtfFlowStats(): Promise<{
  totalRecords: number;
  latestDate: string | null;
  oldestDate: string | null;
}> {
  const db = await getDb();
  if (!db) {
    return { totalRecords: 0, latestDate: null, oldestDate: null };
  }
  
  const records = await db
    .select()
    .from(btcEtfFlows)
    .orderBy(desc(btcEtfFlows.date));
  
  if (records.length === 0) {
    return { totalRecords: 0, latestDate: null, oldestDate: null };
  }
  
  return {
    totalRecords: records.length,
    latestDate: records[0].date,
    oldestDate: records[records.length - 1].date
  };
}

/**
 * 检查ETF Flow数据库是否为空
 */
export async function isEtfFlowDbEmpty(): Promise<boolean> {
  const stats = await getEtfFlowStats();
  return stats.totalRecords === 0;
}

/**
 * 初始化ETF Flow数据（如果数据库为空则自动拉取历史数据）
 * 服务器启动时调用
 */
export async function initEtfFlowData(): Promise<{
  initialized: boolean;
  message: string;
}> {
  console.log("[ETF Service] Checking if ETF Flow data needs initialization...");
  
  // 检查是否启用
  const enabled = await isEtfFlowEnabled();
  if (!enabled) {
    console.log("[ETF Service] ETF Flow module is disabled, skipping initialization");
    return {
      initialized: false,
      message: "ETF Flow module is disabled"
    };
  }
  
  // 检查数据库是否为空
  const isEmpty = await isEtfFlowDbEmpty();
  if (!isEmpty) {
    const stats = await getEtfFlowStats();
    console.log(`[ETF Service] ETF Flow data already exists: ${stats.totalRecords} records, latest: ${stats.latestDate}`);
    return {
      initialized: false,
      message: `Data already exists: ${stats.totalRecords} records`
    };
  }
  
  // 数据库为空，执行初始化
  console.log("[ETF Service] Database is empty, starting initial data fetch...");
  
  try {
    const result = await runEtfFlowFetch();
    if (result.success) {
      console.log(`[ETF Service] Initial data fetch completed: ${result.message}`);
      return {
        initialized: true,
        message: result.message
      };
    } else {
      console.warn(`[ETF Service] Initial data fetch failed: ${result.message}`);
      return {
        initialized: false,
        message: result.message
      };
    }
  } catch (error) {
    console.error("[ETF Service] Initial data fetch error:", error);
    return {
      initialized: false,
      message: `Error: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}
