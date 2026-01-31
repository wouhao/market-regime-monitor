/**
 * CoinGlass Historical Data Backfill Service
 * 从CoinGlass API获取历史数据并回填到crypto_metrics_daily表
 */
import axios from "axios";
import { upsertCryptoMetricsDaily, getCryptoMetricsByDate } from "../db";
import type { InsertCryptoMetricsDaily } from "../../drizzle/schema";

// CoinGlass API配置
const COINGLASS_BASE_URL = "https://open-api-v4.coinglass.com";

// 数据类型定义
interface OIHistoryPoint {
  time: number;
  open: string | number;
  high: string | number;
  low: string | number;
  close: string | number;
}

interface FundingHistoryPoint {
  time: number;
  open: string | number;
  high: string | number;
  low: string | number;
  close: string | number;
}

interface LiquidationHistoryPoint {
  time: number;
  long_liquidation_usd: string | number;
  short_liquidation_usd: string | number;
}

interface BackfillResult {
  success: boolean;
  daysProcessed: number;
  daysSkipped: number;
  errors: string[];
  details: {
    oi: { fetched: number; failed: number };
    funding: { fetched: number; failed: number };
    liquidations: { fetched: number; failed: number };
  };
}

/**
 * 从CoinGlass获取OI聚合历史数据
 */
async function fetchOIHistory(apiKey: string, startTime: number, endTime: number): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  
  try {
    const url = `${COINGLASS_BASE_URL}/api/futures/open-interest/aggregated-history?symbol=BTC&interval=1d&start_time=${startTime}&end_time=${endTime}`;
    
    console.log(`[CoinGlass Backfill] Fetching OI history...`);
    
    const response = await axios.get(url, {
      headers: {
        'accept': 'application/json',
        'CG-API-KEY': apiKey
      },
      timeout: 30000
    });
    
    if (response.data?.code === "0" && response.data?.data) {
      const data = response.data.data as OIHistoryPoint[];
      console.log(`[CoinGlass Backfill] OI data points received: ${data.length}`);
      
      for (const point of data) {
        // 将时间戳转换为北京时间日期
        const date = new Date(point.time);
        const bjDate = new Date(date.getTime() + 8 * 60 * 60 * 1000);
        const dateStr = bjDate.toISOString().split('T')[0];
        
        const closeValue = typeof point.close === 'string' ? parseFloat(point.close) : point.close;
        if (!isNaN(closeValue)) {
          result.set(dateStr, closeValue);
        }
      }
    }
  } catch (error) {
    console.error(`[CoinGlass Backfill] Failed to fetch OI history:`, error);
  }
  
  return result;
}

/**
 * 从CoinGlass获取OI加权Funding Rate历史数据
 */
async function fetchFundingHistory(apiKey: string, startTime: number, endTime: number): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  
  try {
    // 使用正确的端点路径: /api/futures/funding-rate/oi-weight-history
    const url = `${COINGLASS_BASE_URL}/api/futures/funding-rate/oi-weight-history?symbol=BTC&interval=1d&start_time=${startTime}&end_time=${endTime}`;
    
    console.log(`[CoinGlass Backfill] Fetching Funding Rate history...`);
    
    const response = await axios.get(url, {
      headers: {
        'accept': 'application/json',
        'CG-API-KEY': apiKey
      },
      timeout: 30000
    });
    
    if (response.data?.code === "0" && response.data?.data) {
      const data = response.data.data as FundingHistoryPoint[];
      console.log(`[CoinGlass Backfill] Funding data points received: ${data.length}`);
      
      for (const point of data) {
        const date = new Date(point.time);
        const bjDate = new Date(date.getTime() + 8 * 60 * 60 * 1000);
        const dateStr = bjDate.toISOString().split('T')[0];
        
        const closeValue = typeof point.close === 'string' ? parseFloat(point.close) : point.close;
        if (!isNaN(closeValue)) {
          // CoinGlass返回的值已经是百分比形式（如 0.00589700 表示 0.5897%）
          // 不需要再乘100，直接存储原始值
          result.set(dateStr, closeValue);
        }
      }
    }
  } catch (error) {
    console.error(`[CoinGlass Backfill] Failed to fetch Funding history:`, error);
  }
  
  return result;
}

/**
 * 从CoinGlass获取清算历史数据（多交易所聚合）
 */
async function fetchLiquidationHistory(apiKey: string, startTime: number, endTime: number): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  
  // 主要交易所列表
  const exchanges = ['Binance', 'OKX', 'Bybit', 'Bitget', 'BitMEX', 'Huobi', 'Gate', 'Kraken', 'dYdX'];
  const symbols: { [key: string]: string } = {
    'Binance': 'BTCUSDT',
    'OKX': 'BTC-USDT-SWAP',
    'Bybit': 'BTCUSDT',
    'Bitget': 'BTCUSDT',
    'BitMEX': 'XBTUSD',
    'Huobi': 'BTC-USDT',
    'Gate': 'BTC_USDT',
    'Kraken': 'PI_XBTUSD',
    'dYdX': 'BTC-USD'
  };
  
  // 临时存储每天每个交易所的数据
  const dailyData = new Map<string, { long: number; short: number }>();
  
  try {
    // 尝试从Binance获取数据（最大的交易所）
    const url = `${COINGLASS_BASE_URL}/api/futures/liquidation/history?exchange=Binance&symbol=BTCUSDT&interval=1d&start_time=${startTime}&end_time=${endTime}`;
    
    console.log(`[CoinGlass Backfill] Fetching Liquidation history from Binance...`);
    
    const response = await axios.get(url, {
      headers: {
        'accept': 'application/json',
        'CG-API-KEY': apiKey
      },
      timeout: 30000
    });
    
    if (response.data?.code === "0" && response.data?.data) {
      const data = response.data.data as LiquidationHistoryPoint[];
      console.log(`[CoinGlass Backfill] Liquidation data points received: ${data.length}`);
      
      for (const point of data) {
        const date = new Date(point.time);
        const bjDate = new Date(date.getTime() + 8 * 60 * 60 * 1000);
        const dateStr = bjDate.toISOString().split('T')[0];
        
        const longLiq = typeof point.long_liquidation_usd === 'string' 
          ? parseFloat(point.long_liquidation_usd) 
          : point.long_liquidation_usd;
        const shortLiq = typeof point.short_liquidation_usd === 'string' 
          ? parseFloat(point.short_liquidation_usd) 
          : point.short_liquidation_usd;
        
        if (!isNaN(longLiq) && !isNaN(shortLiq)) {
          const existing = dailyData.get(dateStr) || { long: 0, short: 0 };
          existing.long += longLiq;
          existing.short += shortLiq;
          dailyData.set(dateStr, existing);
        }
      }
    }
    
    // 尝试从其他主要交易所获取数据并聚合
    for (const exchange of ['OKX', 'Bybit']) {
      try {
        const symbol = symbols[exchange] || 'BTCUSDT';
        const exchUrl = `${COINGLASS_BASE_URL}/api/futures/liquidation/history?exchange=${exchange}&symbol=${symbol}&interval=1d&start_time=${startTime}&end_time=${endTime}`;
        
        console.log(`[CoinGlass Backfill] Fetching Liquidation history from ${exchange}...`);
        
        const exchResponse = await axios.get(exchUrl, {
          headers: {
            'accept': 'application/json',
            'CG-API-KEY': apiKey
          },
          timeout: 15000
        });
        
        if (exchResponse.data?.code === "0" && exchResponse.data?.data) {
          const exchData = exchResponse.data.data as LiquidationHistoryPoint[];
          console.log(`[CoinGlass Backfill] ${exchange} liquidation data points: ${exchData.length}`);
          
          for (const point of exchData) {
            const date = new Date(point.time);
            const bjDate = new Date(date.getTime() + 8 * 60 * 60 * 1000);
            const dateStr = bjDate.toISOString().split('T')[0];
            
            const longLiq = typeof point.long_liquidation_usd === 'string' 
              ? parseFloat(point.long_liquidation_usd) 
              : point.long_liquidation_usd;
            const shortLiq = typeof point.short_liquidation_usd === 'string' 
              ? parseFloat(point.short_liquidation_usd) 
              : point.short_liquidation_usd;
            
            if (!isNaN(longLiq) && !isNaN(shortLiq)) {
              const existing = dailyData.get(dateStr) || { long: 0, short: 0 };
              existing.long += longLiq;
              existing.short += shortLiq;
              dailyData.set(dateStr, existing);
            }
          }
        }
      } catch (exchError) {
        console.warn(`[CoinGlass Backfill] Failed to fetch ${exchange} liquidations:`, exchError);
      }
    }
    
    // 汇总每天的总清算量
    dailyData.forEach((data, dateStr) => {
      result.set(dateStr, data.long + data.short);
    });
    
  } catch (error) {
    console.error(`[CoinGlass Backfill] Failed to fetch Liquidation history:`, error);
  }
  
  return result;
}

/**
 * 执行历史数据回填
 * @param apiKey CoinGlass API Key
 * @param days 回填天数（默认30天）
 * @param overwrite 是否覆盖已存在的数据（默认false）
 */
export async function backfillCryptoMetrics(
  apiKey: string,
  days: number = 30,
  overwrite: boolean = false
): Promise<BackfillResult> {
  const result: BackfillResult = {
    success: false,
    daysProcessed: 0,
    daysSkipped: 0,
    errors: [],
    details: {
      oi: { fetched: 0, failed: 0 },
      funding: { fetched: 0, failed: 0 },
      liquidations: { fetched: 0, failed: 0 }
    }
  };
  
  if (!apiKey) {
    result.errors.push("CoinGlass API Key is required");
    return result;
  }
  
  console.log(`[CoinGlass Backfill] Starting backfill for ${days} days...`);
  
  // 计算时间范围
  const endTime = Date.now();
  const startTime = endTime - days * 24 * 60 * 60 * 1000;
  
  try {
    // 并行获取所有历史数据
    const [oiData, fundingData, liqData] = await Promise.all([
      fetchOIHistory(apiKey, startTime, endTime),
      fetchFundingHistory(apiKey, startTime, endTime),
      fetchLiquidationHistory(apiKey, startTime, endTime)
    ]);
    
    result.details.oi.fetched = oiData.size;
    result.details.funding.fetched = fundingData.size;
    result.details.liquidations.fetched = liqData.size;
    
    console.log(`[CoinGlass Backfill] Data fetched - OI: ${oiData.size}, Funding: ${fundingData.size}, Liq: ${liqData.size}`);
    
    // 获取所有唯一日期
    const allDates = new Set<string>();
    oiData.forEach((_, date) => allDates.add(date));
    fundingData.forEach((_, date) => allDates.add(date));
    liqData.forEach((_, date) => allDates.add(date));
    
    // 按日期排序处理
    const sortedDates = Array.from(allDates).sort();
    
    for (const dateStr of sortedDates) {
      try {
        // 检查是否已存在数据
        const existing = await getCryptoMetricsByDate(dateStr);
        
        if (existing && !overwrite) {
          // 检查是否有缺失的字段需要补充
          const needsUpdate = 
            (existing.oiUsd === null && oiData.has(dateStr)) ||
            (existing.funding === null && fundingData.has(dateStr)) ||
            (existing.liq24hUsd === null && liqData.has(dateStr));
          
          if (!needsUpdate) {
            result.daysSkipped++;
            continue;
          }
        }
        
        // 准备数据
        const date = new Date(dateStr + 'T00:00:00+08:00');
        const tsBjt = Math.floor(date.getTime() / 1000);
        
        const metrics: InsertCryptoMetricsDaily = {
          dateBjt: dateStr,
          tsBjt,
          oiUsd: oiData.has(dateStr) ? String(oiData.get(dateStr)) : (existing?.oiUsd ?? null),
          funding: fundingData.has(dateStr) ? String(fundingData.get(dateStr)) : (existing?.funding ?? null),
          liq24hUsd: liqData.has(dateStr) ? String(liqData.get(dateStr)) : (existing?.liq24hUsd ?? null),
          stableUsdtUsdcUsd: existing?.stableUsdtUsdcUsd ?? null, // 保留现有的稳定币数据
          sourceFunding: fundingData.has(dateStr) ? "CoinGlass OI-Weighted" : existing?.sourceFunding,
          sourceOi: oiData.has(dateStr) ? "CoinGlass Aggregated" : existing?.sourceOi,
          sourceLiq: liqData.has(dateStr) ? "CoinGlass Multi-Exchange" : existing?.sourceLiq,
          sourceStable: existing?.sourceStable,
          notes: JSON.stringify({
            backfilled: true,
            backfillTime: new Date().toISOString(),
            sources: {
              oi: oiData.has(dateStr) ? "CoinGlass" : "existing",
              funding: fundingData.has(dateStr) ? "CoinGlass" : "existing",
              liq: liqData.has(dateStr) ? "CoinGlass" : "existing"
            }
          })
        };
        
        await upsertCryptoMetricsDaily(metrics);
        result.daysProcessed++;
        
        console.log(`[CoinGlass Backfill] Processed ${dateStr}: OI=${metrics.oiUsd ? 'Y' : 'N'}, Funding=${metrics.funding ? 'Y' : 'N'}, Liq=${metrics.liq24hUsd ? 'Y' : 'N'}`);
        
      } catch (dateError) {
        console.error(`[CoinGlass Backfill] Failed to process ${dateStr}:`, dateError);
        result.errors.push(`Failed to process ${dateStr}: ${dateError}`);
      }
    }
    
    result.success = result.errors.length === 0;
    console.log(`[CoinGlass Backfill] Completed. Processed: ${result.daysProcessed}, Skipped: ${result.daysSkipped}, Errors: ${result.errors.length}`);
    
  } catch (error) {
    console.error(`[CoinGlass Backfill] Fatal error:`, error);
    result.errors.push(`Fatal error: ${error}`);
  }
  
  return result;
}

/**
 * 获取回填状态（检查数据完整性）
 */
export async function getBackfillStatus(days: number = 30): Promise<{
  totalDays: number;
  daysWithData: number;
  daysWithOI: number;
  daysWithFunding: number;
  daysWithLiq: number;
  missingDates: string[];
}> {
  const status = {
    totalDays: days,
    daysWithData: 0,
    daysWithOI: 0,
    daysWithFunding: 0,
    daysWithLiq: 0,
    missingDates: [] as string[]
  };
  
  const now = new Date();
  const bjTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  
  for (let i = 0; i < days; i++) {
    const checkDate = new Date(bjTime);
    checkDate.setDate(checkDate.getDate() - i);
    const dateStr = checkDate.toISOString().split('T')[0];
    
    const metrics = await getCryptoMetricsByDate(dateStr);
    
    if (metrics) {
      status.daysWithData++;
      if (metrics.oiUsd !== null) status.daysWithOI++;
      if (metrics.funding !== null) status.daysWithFunding++;
      if (metrics.liq24hUsd !== null) status.daysWithLiq++;
    } else {
      status.missingDates.push(dateStr);
    }
  }
  
  return status;
}
