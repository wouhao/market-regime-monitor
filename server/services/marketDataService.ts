/**
 * Market Data Service - 市场数据抓取和处理服务
 */
import axios from "axios";

// 数据源接口定义
export interface MarketIndicator {
  indicator: string;
  displayName: string;
  latestValue: number | null;
  change1d: number | null;
  change7d: number | null;
  change30d: number | null;
  ma20: number | null;
  aboveMa20: boolean | null;
  sparklineData: number[];
}

export interface RegimeResult {
  regime: "risk_on" | "risk_off" | "base";
  status: "watch" | "confirmed";
  confidence: number;
  triggeredRules: string[];
  untriggeredRules: string[];
}

export interface ExecutionSwitches {
  marginBorrow: string;
  putSelling: string;
  spotPace: string;
}

export interface MarketReportData {
  regime: RegimeResult;
  switches: ExecutionSwitches;
  snapshots: MarketIndicator[];
  dataQuality: number;
  reportContent: string;
}

// 指标配置
// 传统市场指标 (7个) + 加密指标 (4个)
const INDICATORS_CONFIG = [
  // 传统市场指标
  { indicator: "BTC-USD", displayName: "Bitcoin", source: "yahoo" },
  { indicator: "QQQ", displayName: "Nasdaq-100 ETF", source: "yahoo" },
  { indicator: "GLD", displayName: "SPDR Gold", source: "yahoo" },
  { indicator: "DGS10", displayName: "10Y Treasury", source: "fred" },
  { indicator: "VIXCLS", displayName: "VIX Index", source: "fred" },
  { indicator: "DFII10", displayName: "10Y Real Yield", source: "fred" },
  { indicator: "BAMLH0A0HYM2", displayName: "HY OAS", source: "fred" },
  // 4个加密指标 (使用Binance免费API + DefiLlama)
  { indicator: "crypto_funding", displayName: "BTC Funding Rate", source: "binance" },
  { indicator: "crypto_oi", displayName: "BTC Open Interest", source: "binance" },
  { indicator: "crypto_liquidations", displayName: "BTC Liq Pressure (proxy)", source: "proxy" },
  { indicator: "stablecoin", displayName: "Stablecoin Supply (USDT+USDC)", source: "defillama" },
];

// 规则定义
const RULES = {
  A: { description: "QQQ ≤ -2.0% AND GLD ≥ +1.0%", type: "risk_off" },
  B: { description: "VIX ≥ 20 AND QQQ < 0%", type: "risk_off" },
  C: { description: "QQQ < 20D MA AND GLD > 20D MA", type: "risk_off" },
  D: { description: "QQQ ≥ +1.0% AND QQQ > 20D MA", type: "risk_on" },
  E: { description: "GLD ≤ +0.5% OR GLD ≤ 20D MA", type: "risk_on" },
  F: { description: "BTC ≥ 0% OR BTC > 20D MA", type: "risk_on" },
};

/**
 * 从Yahoo Finance获取数据
 */
async function fetchYahooData(symbol: string): Promise<{ prices: number[]; latest: number | null }> {
  try {
    // 使用yfinance的替代API
    const endDate = Math.floor(Date.now() / 1000);
    const startDate = endDate - 60 * 24 * 60 * 60; // 60天前
    
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${startDate}&period2=${endDate}&interval=1d`;
    
    const response = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      timeout: 10000,
    });
    
    const result = response.data?.chart?.result?.[0];
    if (!result?.indicators?.quote?.[0]?.close) {
      return { prices: [], latest: null };
    }
    
    const closes = result.indicators.quote[0].close.filter((p: number | null) => p !== null);
    return {
      prices: closes,
      latest: closes.length > 0 ? closes[closes.length - 1] : null,
    };
  } catch (error) {
    console.error(`[Yahoo] Failed to fetch ${symbol}:`, error);
    return { prices: [], latest: null };
  }
}

/**
 * 从FRED获取数据
 */
async function fetchFredData(seriesId: string, apiKey: string): Promise<{ prices: number[]; latest: number | null }> {
  try {
    if (!apiKey || apiKey === "demo_key") {
      console.warn(`[FRED] No valid API key for ${seriesId}`);
      return { prices: [], latest: null };
    }
    
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=60`;
    
    const response = await axios.get(url, { timeout: 10000 });
    const observations = response.data?.observations || [];
    
    const prices = observations
      .map((obs: { value: string }) => parseFloat(obs.value))
      .filter((v: number) => !isNaN(v))
      .reverse();
    
    return {
      prices,
      latest: prices.length > 0 ? prices[prices.length - 1] : null,
    };
  } catch (error) {
    console.error(`[FRED] Failed to fetch ${seriesId}:`, error);
    return { prices: [], latest: null };
  }
}

/**
 * 从Binance获取加密数据（免费API）
 * 如果Binance不可用，回退到OKX API
 */
async function fetchBinanceData(dataType: string): Promise<number | null> {
  // 先尝试Binance，如果失败则尝试OKX
  const binanceResult = await fetchFromBinance(dataType);
  if (binanceResult !== null) {
    return binanceResult;
  }
  
  // Binance失败，尝试OKX作为备选
  console.log(`[Crypto] Binance failed for ${dataType}, trying OKX...`);
  return await fetchFromOKX(dataType);
}

/**
 * 从Binance获取数据
 */
async function fetchFromBinance(dataType: string): Promise<number | null> {
  try {
    const baseUrl = "https://fapi.binance.com";
    
    if (dataType === "funding") {
      const url = `${baseUrl}/fapi/v1/fundingRate?symbol=BTCUSDT&limit=1`;
      console.log(`[Binance] Fetching funding rate...`);
      const response = await axios.get(url, { timeout: 8000 });
      if (response.data && response.data.length > 0) {
        const rate = parseFloat(response.data[0].fundingRate);
        console.log(`[Binance] Funding rate: ${rate}`);
        return isNaN(rate) ? null : rate * 100;
      }
    } else if (dataType === "oi") {
      const url = `${baseUrl}/fapi/v1/openInterest?symbol=BTCUSDT`;
      console.log(`[Binance] Fetching open interest...`);
      const response = await axios.get(url, { timeout: 8000 });
      if (response.data?.openInterest) {
        const oi = parseFloat(response.data.openInterest);
        const priceUrl = `${baseUrl}/fapi/v1/ticker/price?symbol=BTCUSDT`;
        const priceResponse = await axios.get(priceUrl, { timeout: 5000 });
        const price = parseFloat(priceResponse.data?.price || "0");
        const oiUsd = oi * price;
        console.log(`[Binance] Open Interest: ${oiUsd} USD`);
        return isNaN(oiUsd) ? null : oiUsd;
      }
    } else if (dataType === "liquidations") {
      // Binance强平数据需要特殊权限，返回null让OKX处理
      return null;
    }
    return null;
  } catch (error: unknown) {
    const axiosError = error as { response?: { status?: number; data?: unknown }; message?: string };
    console.error(`[Binance] Failed to fetch ${dataType}:`, axiosError.response?.status || axiosError.message);
    return null;
  }
}

/**
 * 从OKX获取数据（备选，无地区限制）
 */
async function fetchFromOKX(dataType: string): Promise<number | null> {
  try {
    const baseUrl = "https://www.okx.com";
    
    if (dataType === "funding") {
      // OKX资金费率API
      const url = `${baseUrl}/api/v5/public/funding-rate?instId=BTC-USDT-SWAP`;
      console.log(`[OKX] Fetching funding rate...`);
      const response = await axios.get(url, { timeout: 8000 });
      if (response.data?.data && response.data.data.length > 0) {
        const rate = parseFloat(response.data.data[0].fundingRate);
        console.log(`[OKX] Funding rate: ${rate}`);
        return isNaN(rate) ? null : rate * 100;
      }
    } else if (dataType === "oi") {
      // OKX持仓量API
      const url = `${baseUrl}/api/v5/public/open-interest?instType=SWAP&instId=BTC-USDT-SWAP`;
      console.log(`[OKX] Fetching open interest...`);
      const response = await axios.get(url, { timeout: 8000 });
      if (response.data?.data && response.data.data.length > 0) {
        const oi = parseFloat(response.data.data[0].oi);
        // 获取当前价格
        const priceUrl = `${baseUrl}/api/v5/market/ticker?instId=BTC-USDT-SWAP`;
        const priceResponse = await axios.get(priceUrl, { timeout: 5000 });
        const price = parseFloat(priceResponse.data?.data?.[0]?.last || "0");
        const oiUsd = oi * price;
        console.log(`[OKX] Open Interest: ${oiUsd} USD`);
        return isNaN(oiUsd) ? null : oiUsd;
      }
    } else if (dataType === "liquidations") {
      // OKX没有公开的强平数据API，返回null并标记为missing
      console.log(`[OKX] Liquidations data not available via public API`);
      return null;
    }
    return null;
  } catch (error: unknown) {
    const axiosError = error as { response?: { status?: number; data?: unknown }; message?: string };
    console.error(`[OKX] Failed to fetch ${dataType}:`, axiosError.response?.status || axiosError.message);
    return null;
  }
}

/**
 * 从DefiLlama获取稳定币数据
 */
async function fetchDefiLlamaData(): Promise<number | null> {
  try {
    const url = "https://stablecoins.llama.fi/stablecoins?includePrices=false";
    const response = await axios.get(url, { timeout: 10000 });
    
    const stablecoins = response.data?.peggedAssets || [];
    const totalSupply = stablecoins.reduce((sum: number, coin: { circulating: { peggedUSD: number } }) => {
      return sum + (coin.circulating?.peggedUSD || 0);
    }, 0);
    
    return totalSupply;
  } catch (error) {
    console.error("[DefiLlama] Failed to fetch stablecoin data:", error);
    return null;
  }
}

/**
 * 计算变化率
 */
function calculateChange(prices: number[], days: number): number | null {
  if (prices.length < days + 1) return null;
  const current = prices[prices.length - 1];
  const past = prices[prices.length - 1 - days];
  if (!current || !past) return null;
  return ((current - past) / past) * 100;
}

/**
 * 计算20日均线
 */
function calculateMA20(prices: number[]): number | null {
  if (prices.length < 20) return null;
  const last20 = prices.slice(-20);
  return last20.reduce((sum, p) => sum + p, 0) / 20;
}

/**
 * 获取所有市场数据
 */
export async function fetchAllMarketData(fredApiKey: string): Promise<MarketIndicator[]> {
  console.log("[MarketData] Starting data fetch...");
  const results: MarketIndicator[] = [];
  
  for (const config of INDICATORS_CONFIG) {
    let prices: number[] = [];
    let latest: number | null = null;
    
    try {
      if (config.source === "yahoo") {
        const data = await fetchYahooData(config.indicator);
        prices = data.prices;
        latest = data.latest;
      } else if (config.source === "fred") {
        const data = await fetchFredData(config.indicator, fredApiKey);
        prices = data.prices;
        latest = data.latest;
      } else if (config.source === "binance") {
        // 使用Binance免费API获取加密数据
        if (config.indicator === "crypto_funding") {
          latest = await fetchBinanceData("funding");
        } else if (config.indicator === "crypto_oi") {
          latest = await fetchBinanceData("oi");
        } else if (config.indicator === "crypto_liquidations") {
          latest = await fetchBinanceData("liquidations");
        }
      } else if (config.source === "defillama") {
        latest = await fetchDefiLlamaData();
      } else if (config.source === "proxy") {
        // Liquidations proxy: 将在所有数据获取完成后计算
        // 先设置为占位符，稍后更新
        latest = null;
      }
    } catch (error) {
      console.error(`[MarketData] Error fetching ${config.indicator}:`, error);
    }
    
    const ma20 = calculateMA20(prices);
    
    results.push({
      indicator: config.indicator,
      displayName: config.displayName,
      latestValue: latest,
      change1d: calculateChange(prices, 1),
      change7d: calculateChange(prices, 7),
      change30d: calculateChange(prices, 30),
      ma20,
      aboveMa20: latest !== null && ma20 !== null ? latest > ma20 : null,
      sparklineData: prices.slice(-30),
    });
  }
  
  // 计算 Liquidations Proxy
  // 规则：价格大跌 + OI明显下降 + funding同向回落 = 清算压力高
  const btcData = results.find(r => r.indicator === "BTC-USD");
  const oiData = results.find(r => r.indicator === "crypto_oi");
  const fundingData = results.find(r => r.indicator === "crypto_funding");
  const liqProxyIndex = results.findIndex(r => r.indicator === "crypto_liquidations");
  
  if (liqProxyIndex !== -1) {
    // 计算清算压力指数 (0-100)
    let pressureScore = 50; // 基准值
    
    // 价格因素: 24h跌幅越大，压力越高
    if (btcData && btcData.change1d !== null) {
      const priceChange = btcData.change1d;
      if (priceChange <= -5) pressureScore += 30;      // 大跌
      else if (priceChange <= -3) pressureScore += 20; // 中跌
      else if (priceChange <= -1) pressureScore += 10; // 小跌
      else if (priceChange >= 3) pressureScore -= 15;  // 大涨降低压力
      else if (priceChange >= 1) pressureScore -= 5;   // 小涨降低压力
    }
    
    // OI因素: OI下降表示清算发生
    // 注: 由于我们没有OI历史数据，这里用funding作为代理
    
    // Funding因素: 负资金费率表示空头主导，可能有清算压力
    if (fundingData && fundingData.latestValue !== null) {
      const funding = fundingData.latestValue;
      if (funding < -0.05) pressureScore += 15;        // 强负资金费率
      else if (funding < -0.01) pressureScore += 8;    // 弱负资金费率
      else if (funding > 0.1) pressureScore -= 10;     // 强正资金费率降低压力
    }
    
    // 限制在 0-100 范围
    pressureScore = Math.max(0, Math.min(100, pressureScore));
    
    // 更新 proxy 指标
    results[liqProxyIndex].latestValue = pressureScore;
    console.log(`[Proxy] Liquidation pressure score: ${pressureScore}`);
  }
  
  console.log(`[MarketData] Fetched ${results.length} indicators`);
  return results;
}

/**
 * 判定市场情景
 */
export function classifyRegime(snapshots: MarketIndicator[], previousRegime?: string): RegimeResult {
  const triggeredRules: string[] = [];
  const untriggeredRules: string[] = [];
  
  // 获取关键指标
  const qqq = snapshots.find(s => s.indicator === "QQQ");
  const gld = snapshots.find(s => s.indicator === "GLD");
  const vix = snapshots.find(s => s.indicator === "VIXCLS");
  const btc = snapshots.find(s => s.indicator === "BTC-USD");
  
  // 检查规则A: QQQ ≤ -2.0% AND GLD ≥ +1.0%
  if (qqq && gld && qqq.change1d !== null && gld.change1d !== null) {
    if (qqq.change1d <= -2.0 && gld.change1d >= 1.0) {
      triggeredRules.push("A: " + RULES.A.description);
    } else {
      untriggeredRules.push("A: " + RULES.A.description);
    }
  } else {
    untriggeredRules.push("A: " + RULES.A.description + " (数据缺失)");
  }
  
  // 检查规则B: VIX ≥ 20 AND QQQ < 0%
  if (vix && qqq && vix.latestValue !== null && qqq.change1d !== null) {
    if (vix.latestValue >= 20 && qqq.change1d < 0) {
      triggeredRules.push("B: " + RULES.B.description);
    } else {
      untriggeredRules.push("B: " + RULES.B.description);
    }
  } else {
    untriggeredRules.push("B: " + RULES.B.description + " (数据缺失)");
  }
  
  // 检查规则C: QQQ < 20D MA AND GLD > 20D MA
  if (qqq && gld && qqq.aboveMa20 !== null && gld.aboveMa20 !== null) {
    if (!qqq.aboveMa20 && gld.aboveMa20) {
      triggeredRules.push("C: " + RULES.C.description);
    } else {
      untriggeredRules.push("C: " + RULES.C.description);
    }
  } else {
    untriggeredRules.push("C: " + RULES.C.description + " (MA数据缺失)");
  }
  
  // 检查规则D: QQQ ≥ +1.0% AND QQQ > 20D MA
  if (qqq && qqq.change1d !== null && qqq.aboveMa20 !== null) {
    if (qqq.change1d >= 1.0 && qqq.aboveMa20) {
      triggeredRules.push("D: " + RULES.D.description);
    } else {
      untriggeredRules.push("D: " + RULES.D.description);
    }
  } else {
    untriggeredRules.push("D: " + RULES.D.description + " (数据缺失)");
  }
  
  // 检查规则E: GLD ≤ +0.5% OR GLD ≤ 20D MA
  if (gld && (gld.change1d !== null || gld.aboveMa20 !== null)) {
    if ((gld.change1d !== null && gld.change1d <= 0.5) || (gld.aboveMa20 === false)) {
      triggeredRules.push("E: " + RULES.E.description);
    } else {
      untriggeredRules.push("E: " + RULES.E.description);
    }
  } else {
    untriggeredRules.push("E: " + RULES.E.description + " (数据缺失)");
  }
  
  // 检查规则F: BTC ≥ 0% OR BTC > 20D MA
  if (btc && (btc.change1d !== null || btc.aboveMa20 !== null)) {
    if ((btc.change1d !== null && btc.change1d >= 0) || btc.aboveMa20 === true) {
      triggeredRules.push("F: " + RULES.F.description);
    } else {
      untriggeredRules.push("F: " + RULES.F.description);
    }
  } else {
    untriggeredRules.push("F: " + RULES.F.description + " (数据缺失)");
  }
  
  // 判定情景
  const riskOffTriggered = triggeredRules.some(r => r.startsWith("A:") || r.startsWith("B:") || r.startsWith("C:"));
  const riskOnTriggered = triggeredRules.some(r => r.startsWith("D:") || r.startsWith("E:") || r.startsWith("F:"));
  
  let regime: "risk_on" | "risk_off" | "base" = "base";
  if (riskOffTriggered && !riskOnTriggered) {
    regime = "risk_off";
  } else if (riskOnTriggered && !riskOffTriggered) {
    regime = "risk_on";
  }
  
  // 判定确认状态
  const status: "watch" | "confirmed" = previousRegime === regime ? "confirmed" : "watch";
  
  // 计算置信度
  const totalRules = 6;
  const validRules = triggeredRules.filter(r => !r.includes("数据缺失")).length + 
                     untriggeredRules.filter(r => !r.includes("数据缺失")).length;
  const confidence = Math.min(100, 60 + (validRules / totalRules) * 40);
  
  return {
    regime,
    status,
    confidence,
    triggeredRules,
    untriggeredRules,
  };
}

/**
 * 生成执行开关
 * Risk-off: 卖Put激进（高波动环境下Put收益更高）
 * Risk-on/Base: 卖Put辅助（正常环境下保守操作）
 */
export function generateSwitches(regime: RegimeResult): ExecutionSwitches {
  switch (regime.regime) {
    case "risk_off":
      return {
        marginBorrow: "forbidden",
        putSelling: "aggressive",  // Risk-off时卖Put激进（高波动环境下Put收益更高）
        spotPace: "pause",
      };
    case "risk_on":
      return {
        marginBorrow: "allowed",
        putSelling: "helper",      // Risk-on时卖Put辅助
        spotPace: "fast",
      };
    default: // base
      return {
        marginBorrow: "allowed",
        putSelling: "helper",      // Base时卖Put辅助
        spotPace: "medium",
      };
  }
}

/**
 * 计算数据质量评分
 */
export function calculateDataQuality(snapshots: MarketIndicator[]): number {
  const total = snapshots.length;
  const valid = snapshots.filter(s => s.latestValue !== null).length;
  return Math.round((valid / total) * 100);
}

/**
 * 生成Markdown报告内容
 */
export function generateReportContent(
  regime: RegimeResult,
  switches: ExecutionSwitches,
  snapshots: MarketIndicator[],
  dataQuality: number
): string {
  const now = new Date();
  const bjTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const dateStr = bjTime.toISOString().split("T")[0];
  const timeStr = bjTime.toISOString().split("T")[1].slice(0, 5);
  
  const regimeEmoji = regime.regime === "risk_off" ? "🔴" : regime.regime === "risk_on" ? "🟢" : "🟡";
  const regimeLabel = regime.regime === "risk_off" ? "Risk-Off" : regime.regime === "risk_on" ? "Risk-On" : "Base";
  
  let content = `# Market Regime Monitor | 北京时间 ${dateStr} ${timeStr}\n\n`;
  content += `**数据质量评分**：${dataQuality}/100\n`;
  content += `**报告生成时间**：${dateStr} ${timeStr} BJT\n\n`;
  content += `---\n\n`;
  
  // 情景判定
  content += `## 1. Regime Classification（情景判定）\n\n`;
  content += `**当前情景**：${regimeEmoji} ${regimeLabel.toUpperCase()} (${regime.status})\n`;
  content += `**置信度**：${regime.confidence.toFixed(1)}%\n\n`;
  
  // 触发规则
  content += `### 触发的规则\n`;
  if (regime.triggeredRules.length > 0) {
    regime.triggeredRules.forEach(rule => {
      content += `- ✅ ${rule}\n`;
    });
  } else {
    content += `- 无\n`;
  }
  content += `\n`;
  
  content += `### 未触发的规则\n`;
  regime.untriggeredRules.forEach(rule => {
    content += `- ❌ ${rule}\n`;
  });
  content += `\n---\n\n`;
  
  // 执行开关
  content += `## 2. Execution Switches（执行开关）\n\n`;
  content += `|开关|状态|含义|\n`;
  content += `|---|---|---|\n`;
  content += `|MARGIN_BORROW|${switches.marginBorrow.toUpperCase()}|保证金借款|\n`;
  content += `|PUT_SELLING|${switches.putSelling.toUpperCase()}|卖 Put 策略|\n`;
  content += `|SPOT_PACE|${switches.spotPace.toUpperCase()}|现货积累节奏|\n`;
  content += `\n---\n\n`;
  
  // 市场快照
  content += `## 3. Snapshot（市场快照）\n\n`;
  content += `|指标|最新值|1D|7D|30D|\n`;
  content += `|---|---|---|---|---|\n`;
  snapshots.forEach(s => {
    const value = s.latestValue !== null ? s.latestValue.toFixed(2) : "--";
    const c1d = s.change1d !== null ? `${s.change1d >= 0 ? "+" : ""}${s.change1d.toFixed(2)}%` : "--";
    const c7d = s.change7d !== null ? `${s.change7d >= 0 ? "+" : ""}${s.change7d.toFixed(2)}%` : "--";
    const c30d = s.change30d !== null ? `${s.change30d >= 0 ? "+" : ""}${s.change30d.toFixed(2)}%` : "--";
    content += `|${s.displayName}|${value}|${c1d}|${c7d}|${c30d}|\n`;
  });
  content += `\n---\n\n`;
  
  // 数据质量
  content += `## 4. Data Quality（数据质量）\n\n`;
  const validCount = snapshots.filter(s => s.latestValue !== null).length;
  const missingCount = snapshots.length - validCount;
  content += `- 总指标数：${snapshots.length}\n`;
  content += `- 有效指标：${validCount}\n`;
  content += `- 缺失指标：${missingCount}\n`;
  content += `- 质量评分：${dataQuality}/100\n`;
  if (missingCount > 0) {
    const missing = snapshots.filter(s => s.latestValue === null).map(s => s.indicator);
    content += `- 缺失项：${missing.join(", ")}\n`;
  }
  content += `\n---\n\n`;
  
  // 摘要
  content += `## 5. Summary（摘要）\n\n`;
  if (regime.regime === "risk_off") {
    content += `🔴 **Red Light** - 市场处于风险规避状态。\n`;
    content += `- 建议暂停保证金借款和卖Put操作\n`;
    content += `- 现货积累节奏放缓\n`;
  } else if (regime.regime === "risk_on") {
    content += `🟢 **Green Light** - 市场处于风险偏好状态。\n`;
    content += `- 可以积极使用保证金和卖Put策略\n`;
    content += `- 加快现货积累节奏\n`;
  } else {
    content += `🟡 **Yellow Light** - 市场处于中性状态。\n`;
    content += `- 风险信号不明确；建议维持常规节奏\n`;
  }
  
  if (regime.status === "watch") {
    content += `- ⚠️ 当前为 WATCH 状态（初次检测），请监控下一交易日确认\n`;
  }
  content += `\n---\n\n`;
  
  content += `**报告生成时间**：${dateStr} ${timeStr} BJT\n`;
  content += `**下次运行**：明日 09:00 BJT\n`;
  
  return content;
}

/**
 * 生成完整市场报告
 */
export async function generateMarketReport(
  fredApiKey: string,
  previousRegime?: string
): Promise<MarketReportData> {
  console.log("[MarketReport] Starting report generation...");
  
  // 1. 获取所有市场数据 (使用Binance免费API获取加密数据)
  const snapshots = await fetchAllMarketData(fredApiKey);
  
  // 2. 判定市场情景
  const regime = classifyRegime(snapshots, previousRegime);
  
  // 3. 生成执行开关
  const switches = generateSwitches(regime);
  
  // 4. 计算数据质量
  const dataQuality = calculateDataQuality(snapshots);
  
  // 5. 生成报告内容
  const reportContent = generateReportContent(regime, switches, snapshots, dataQuality);
  
  console.log(`[MarketReport] Report generated: ${regime.regime} (${regime.status}), quality: ${dataQuality}%`);
  
  return {
    regime,
    switches,
    snapshots,
    dataQuality,
    reportContent,
  };
}
