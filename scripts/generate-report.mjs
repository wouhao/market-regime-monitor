#!/usr/bin/env node
/**
 * Market Regime Monitor - 独立数据采集脚本
 * 运行环境: GitHub Actions Runner (Node.js 20+)
 * 输出: docs/reports/latest.json + docs/reports/YYYY-MM-DD.json
 * 
 * 环境变量:
 *   FRED_API_KEY       - FRED 经济数据 API Key (必须)
 *   COINALYZE_API_KEY  - Coinalyze 清算数据 API Key (可选)
 *   COINGLASS_API_KEY  - CoinGlass OI 数据 API Key (可选)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============ 配置 ============

const INDICATORS_CONFIG = [
  { indicator: "BTC-USD", displayName: "Bitcoin", source: "yahoo" },
  { indicator: "QQQ", displayName: "Nasdaq-100 ETF", source: "yahoo" },
  { indicator: "GLD", displayName: "SPDR Gold", source: "yahoo" },
  { indicator: "VIXCLS", displayName: "VIX Index", source: "fred" },
  { indicator: "DX-Y.NYB", displayName: "US Dollar Index (DXY)", source: "yahoo" },
  { indicator: "DGS10", displayName: "10Y Treasury", source: "fred" },
  { indicator: "DFII10", displayName: "10Y Real Yield", source: "fred" },
  { indicator: "BAMLH0A0HYM2", displayName: "HY OAS", source: "fred" },
  { indicator: "crypto_funding", displayName: "BTC Funding Rate", source: "binance" },
  { indicator: "crypto_oi", displayName: "BTC Open Interest", source: "coinalyze_oi" },
  { indicator: "crypto_liquidations", displayName: "BTC Liquidations (24h)", source: "coinalyze" },
  { indicator: "stablecoin", displayName: "Stablecoin Supply (USDT+USDC)", source: "defillama" },
];

const RULES = {
  A: { description: "QQQ ≤ -2.0% AND GLD ≥ +1.0%", type: "risk_off" },
  B: { description: "VIX ≥ 20 AND QQQ < 0%", type: "risk_off" },
  C: { description: "QQQ < 20D MA AND GLD > 20D MA", type: "risk_off" },
  D: { description: "QQQ ≥ +1.0% AND QQQ > 20D MA", type: "risk_on" },
  E: { description: "GLD ≤ +0.5% OR GLD ≤ 20D MA", type: "risk_on" },
  F: { description: "BTC ≥ 0% OR BTC > 20D MA", type: "risk_on" },
};

// ============ HTTP 请求工具 ============

async function fetchJson(url, options = {}) {
  const { timeout = 10000, headers = {} } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        ...headers,
      },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url, options = {}) {
  const { timeout = 10000, headers = {} } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        ...headers,
      },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.text();
  } finally {
    clearTimeout(timer);
  }
}

// ============ 数据获取函数 ============

async function fetchYahooData(symbol) {
  try {
    const endDate = Math.floor(Date.now() / 1000);
    const startDate = endDate - 60 * 24 * 60 * 60;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${startDate}&period2=${endDate}&interval=1d`;
    const data = await fetchJson(url);
    const result = data?.chart?.result?.[0];
    if (!result?.indicators?.quote?.[0]?.close) return { prices: [], latest: null };
    const closes = result.indicators.quote[0].close.filter((p) => p !== null);
    return { prices: closes, latest: closes.length > 0 ? closes[closes.length - 1] : null };
  } catch (error) {
    console.error(`[Yahoo] Failed to fetch ${symbol}:`, error.message);
    return { prices: [], latest: null };
  }
}

async function fetchFredData(seriesId, apiKey) {
  try {
    if (!apiKey || apiKey === "demo_key") {
      console.warn(`[FRED] No valid API key for ${seriesId}`);
      return { prices: [], latest: null };
    }
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=60`;
    const data = await fetchJson(url);
    const observations = data?.observations || [];
    const prices = observations
      .map((obs) => parseFloat(obs.value))
      .filter((v) => !isNaN(v))
      .reverse();
    return { prices, latest: prices.length > 0 ? prices[prices.length - 1] : null };
  } catch (error) {
    console.error(`[FRED] Failed to fetch ${seriesId}:`, error.message);
    return { prices: [], latest: null };
  }
}

async function fetchFromBinance(dataType) {
  try {
    const baseUrl = "https://fapi.binance.com";
    if (dataType === "funding") {
      const url = `${baseUrl}/fapi/v1/fundingRate?symbol=BTCUSDT&limit=1`;
      const data = await fetchJson(url, { timeout: 8000 });
      if (data && data.length > 0) {
        const rate = parseFloat(data[0].fundingRate);
        return isNaN(rate) ? null : rate * 100;
      }
    } else if (dataType === "oi") {
      const url = `${baseUrl}/fapi/v1/openInterest?symbol=BTCUSDT`;
      const data = await fetchJson(url, { timeout: 8000 });
      if (data?.openInterest) {
        const oi = parseFloat(data.openInterest);
        const priceData = await fetchJson(`${baseUrl}/fapi/v1/ticker/price?symbol=BTCUSDT`, { timeout: 5000 });
        const price = parseFloat(priceData?.price || "0");
        const oiUsd = oi * price;
        return isNaN(oiUsd) ? null : oiUsd;
      }
    }
    return null;
  } catch (error) {
    console.error(`[Binance] Failed to fetch ${dataType}:`, error.message);
    return null;
  }
}

async function fetchFromOKX(dataType) {
  try {
    const baseUrl = "https://www.okx.com";
    if (dataType === "funding") {
      const url = `${baseUrl}/api/v5/public/funding-rate?instId=BTC-USDT-SWAP`;
      const data = await fetchJson(url, { timeout: 8000 });
      if (data?.data && data.data.length > 0) {
        const rate = parseFloat(data.data[0].fundingRate);
        return isNaN(rate) ? null : rate * 100;
      }
    } else if (dataType === "oi") {
      const url = `${baseUrl}/api/v5/public/open-interest?instType=SWAP&instId=BTC-USDT-SWAP`;
      const data = await fetchJson(url, { timeout: 8000 });
      if (data?.data && data.data.length > 0) {
        const oi = parseFloat(data.data[0].oi);
        const priceData = await fetchJson(`${baseUrl}/api/v5/market/ticker?instId=BTC-USDT-SWAP`, { timeout: 5000 });
        const price = parseFloat(priceData?.data?.[0]?.last || "0");
        const oiUsd = oi * price;
        return isNaN(oiUsd) ? null : oiUsd;
      }
    }
    return null;
  } catch (error) {
    console.error(`[OKX] Failed to fetch ${dataType}:`, error.message);
    return null;
  }
}

async function fetchBinanceData(dataType) {
  const result = await fetchFromBinance(dataType);
  if (result !== null) return result;
  console.log(`[Crypto] Binance failed for ${dataType}, trying OKX...`);
  return await fetchFromOKX(dataType);
}

async function fetchCoinGlassOI(apiKey) {
  try {
    const endTime = Date.now();
    const startTime = endTime - 2 * 24 * 60 * 60 * 1000;
    const url = `https://open-api-v4.coinglass.com/api/futures/open-interest/aggregated-history?symbol=BTC&interval=1d&start_time=${startTime}&end_time=${endTime}`;
    const data = await fetchJson(url, { headers: { accept: "application/json", "CG-API-KEY": apiKey } });
    if (data?.code === "0" && data?.data?.length > 0) {
      const latest = data.data[data.data.length - 1];
      const oiUsd = typeof latest.close === "string" ? parseFloat(latest.close) : latest.close;
      console.log(`[CoinGlass] Aggregated OI: $${(oiUsd / 1e9).toFixed(2)}B`);
      return isNaN(oiUsd) ? null : oiUsd;
    }
    return null;
  } catch (error) {
    console.error(`[CoinGlass] Failed:`, error.message);
    return null;
  }
}

async function fetchCoinalyzeOI(apiKey) {
  try {
    const baseUrl = "https://api.coinalyze.net/v1";
    // Get all BTC perpetual markets
    let btcSymbols = [];
    try {
      const marketsData = await fetchJson(`${baseUrl}/future-markets`, { headers: { api_key: apiKey } });
      if (Array.isArray(marketsData)) {
        btcSymbols = marketsData
          .filter((m) => m.base_asset === "BTC" && m.is_perpetual === true && m.symbol)
          .map((m) => m.symbol);
      }
    } catch (e) {
      console.warn(`[Coinalyze OI] Failed to fetch markets`);
    }

    if (btcSymbols.length === 0) {
      btcSymbols = ["BTCUSDT_PERP.A", "BTCUSDT_PERP.6", "BTCUSDT_PERP.4", "BTCUSDT_PERP.7", "BTCUSD_PERP.A", "BTCUSD_PERP.2"];
    }

    // Fetch OI for all symbols in batches
    const batchSize = 20;
    const now = Math.floor(Date.now() / 1000);
    const from = now - 2 * 24 * 60 * 60; // 2 days back
    let totalOiUsd = 0;

    for (let i = 0; i < btcSymbols.length; i += batchSize) {
      const batch = btcSymbols.slice(i, i + batchSize).join(",");
      const url = `${baseUrl}/open-interest-history?symbols=${batch}&interval=daily&convert_to_usd=true&from=${from}&to=${now}`;
      try {
        const data = await fetchJson(url, { headers: { api_key: apiKey }, timeout: 15000 });
        if (Array.isArray(data)) {
          for (const ex of data) {
            const history = ex.history || [];
            if (history.length > 0) {
              // Get the latest data point
              const latest = history[history.length - 1];
              // OI fields: o=open, h=high, l=low, c=close
              totalOiUsd += latest.c || latest.o || 0;
            }
          }
        }
      } catch (e) {
        console.warn(`[Coinalyze OI] Batch failed, continuing...`);
      }
      if (i + batchSize < btcSymbols.length) await new Promise((r) => setTimeout(r, 500));
    }

    if (totalOiUsd > 0) {
      console.log(`[Coinalyze OI] Aggregated BTC OI: $${(totalOiUsd / 1e9).toFixed(2)}B`);
      return totalOiUsd;
    }
    return null;
  } catch (error) {
    console.error(`[Coinalyze OI] Failed:`, error.message);
    return null;
  }
}

async function fetchCoinalyzeLiquidations(apiKey) {
  try {
    const baseUrl = "https://api.coinalyze.net/v1";
    const requestTime = new Date().toISOString();

    // Step 1: Get all BTC perpetual markets
    let btcSymbols = [];
    try {
      const marketsData = await fetchJson(`${baseUrl}/future-markets`, { headers: { api_key: apiKey } });
      if (Array.isArray(marketsData)) {
        btcSymbols = marketsData
          .filter((m) => m.base_asset === "BTC" && m.is_perpetual === true && m.symbol)
          .map((m) => m.symbol);
        console.log(`[Coinalyze] Found ${btcSymbols.length} BTC perpetual contracts`);
      }
    } catch (e) {
      console.warn(`[Coinalyze] Failed to fetch markets, using defaults`);
    }

    if (btcSymbols.length === 0) {
      btcSymbols = ["BTCUSDT_PERP.A", "BTCUSDT_PERP.6", "BTCUSDT_PERP.4", "BTCUSDT_PERP.7", "BTCUSD_PERP.A", "BTCUSD_PERP.2"];
    }

    const batchSize = 20;
    const now = Math.floor(Date.now() / 1000);
    const from = now - 48 * 60 * 60;
    const now24hAgo = now - 24 * 60 * 60;
    const now7dAgo = now - 7 * 24 * 60 * 60;

    let long24h = 0, short24h = 0, total7d = 0;

    for (let i = 0; i < btcSymbols.length; i += batchSize) {
      const batch = btcSymbols.slice(i, i + batchSize).join(",");
      const url = `${baseUrl}/liquidation-history?symbols=${batch}&interval=1hour&convert_to_usd=true&from=${from}&to=${now}`;
      try {
        const data = await fetchJson(url, { headers: { api_key: apiKey }, timeout: 15000 });
        if (Array.isArray(data)) {
          for (const ex of data) {
            for (const point of ex.history || []) {
              if (point.t >= now7dAgo) {
                total7d += (point.l || 0) + (point.s || 0);
                if (point.t >= now24hAgo) {
                  long24h += point.l || 0;
                  short24h += point.s || 0;
                }
              }
            }
          }
        }
      } catch (e) {
        console.warn(`[Coinalyze] Batch failed, continuing...`);
      }
      if (i + batchSize < btcSymbols.length) await new Promise((r) => setTimeout(r, 500));
    }

    const total24h = long24h + short24h;
    console.log(`[Coinalyze] 24h: $${total24h.toLocaleString()}, 7D: $${total7d.toLocaleString()}`);
    return { total24h, long24h, short24h, total7d, requestTime, source: "Coinalyze" };
  } catch (error) {
    console.error(`[Coinalyze] Failed:`, error.message);
    return null;
  }
}

async function fetchOKXLiquidations() {
  try {
    const baseUrl = "https://www.okx.com";
    const requestTime = new Date().toISOString();
    const allDetails = [];
    let after = "";
    let hasMore = true;
    let requestCount = 0;

    while (hasMore && requestCount < 10) {
      const url = `${baseUrl}/api/v5/public/liquidation-orders?instType=SWAP&uly=BTC-USDT&state=filled${after ? `&after=${after}` : ""}`;
      const data = await fetchJson(url, { timeout: 10000 });
      if (data?.code !== "0") break;
      const items = data?.data || [];
      if (items.length === 0) { hasMore = false; break; }
      for (const item of items) {
        if (item.details && Array.isArray(item.details)) allDetails.push(...item.details);
      }
      const lastItem = items[items.length - 1];
      const lastDetails = lastItem?.details;
      if (lastDetails?.length > 0) after = lastDetails[lastDetails.length - 1].ts;
      else hasMore = false;
      requestCount++;
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      if (parseInt(after) < sevenDaysAgo) hasMore = false;
    }

    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    let long24h = 0, short24h = 0, total7d = 0;

    for (const d of allDetails) {
      const ts = parseInt(d.ts);
      const notional = parseFloat(d.bkPx) * parseFloat(d.sz);
      if (isNaN(notional)) continue;
      if (ts >= sevenDaysAgo) {
        total7d += notional;
        if (ts >= oneDayAgo) {
          if (d.posSide === "long") long24h += notional;
          else if (d.posSide === "short") short24h += notional;
        }
      }
    }

    const total24h = long24h + short24h;
    console.log(`[OKX Liq] 24h: $${total24h.toLocaleString()}, 7D: $${total7d.toLocaleString()}`);
    return { total24h, long24h, short24h, total7d, requestTime, source: "OKX" };
  } catch (error) {
    console.error(`[OKX Liq] Failed:`, error.message);
    return null;
  }
}

async function fetchDefiLlamaData() {
  try {
    const url = "https://stablecoins.llama.fi/stablecoins?includePrices=false";
    const data = await fetchJson(url);
    const stablecoins = data?.peggedAssets || [];
    const usdt = stablecoins.find((c) => c.symbol === "USDT");
    const usdc = stablecoins.find((c) => c.symbol === "USDC");
    const total = (usdt?.circulating?.peggedUSD || 0) + (usdc?.circulating?.peggedUSD || 0);
    console.log(`[DefiLlama] Stablecoin Supply: $${(total / 1e9).toFixed(2)}B`);
    return total;
  } catch (error) {
    console.error("[DefiLlama] Failed:", error.message);
    return null;
  }
}

// ============ ETF Flow 数据获取 ============

const FARSIDE_URL = "https://farside.co.uk/bitcoin-etf-flow-all-data/";

function parseEtfValue(value) {
  if (!value || value === "-" || value.trim() === "") return null;
  let cleaned = value.replace(/,/g, "");
  if (cleaned.startsWith("(") && cleaned.endsWith(")")) cleaned = "-" + cleaned.slice(1, -1);
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function parseEtfDate(dateStr) {
  const months = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" };
  const match = dateStr.match(/(\d{1,2})\s+(\w{3})\s+(\d{4})/);
  if (!match) return null;
  const [, day, monthStr, year] = match;
  return months[monthStr] ? `${year}-${months[monthStr]}-${day.padStart(2, "0")}` : null;
}

async function fetchEtfFlowData() {
  try {
    console.log("[ETF] Fetching data from Farside...");
    const html = await fetchText(FARSIDE_URL);
    const tableMatches = html.match(/<table[^>]*>[\s\S]*?<\/table>/gi);
    if (!tableMatches || tableMatches.length < 2) return [];

    const dataTable = tableMatches[1];
    const rows = [];
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;
    while ((rowMatch = rowRegex.exec(dataTable)) !== null) {
      const cells = [];
      const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
      let cellMatch;
      while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
        cells.push(cellMatch[1].replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim());
      }
      if (cells.length > 0) rows.push(cells);
    }

    const results = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (["Total", "Average", "Maximum", "Minimum"].includes(row[0])) continue;
      const date = parseEtfDate(row[0]);
      if (!date) continue;
      const total = parseEtfValue(row[12]);
      const ibit = parseEtfValue(row[1]);
      const fbtc = parseEtfValue(row[2]);
      const gbtc = parseEtfValue(row[10]);
      results.push({ date, total, ibit, fbtc, gbtc });
    }

    console.log(`[ETF] Parsed ${results.length} ETF flow records`);
    return results;
  } catch (error) {
    console.error("[ETF] Failed:", error.message);
    return [];
  }
}

// ============ 计算函数 ============

function calculateChange(prices, days) {
  if (prices.length < days + 1) return null;
  const current = prices[prices.length - 1];
  const past = prices[prices.length - 1 - days];
  if (!current || !past) return null;
  return ((current - past) / past) * 100;
}

function calculateMA20(prices) {
  if (prices.length < 20) return null;
  const last20 = prices.slice(-20);
  return last20.reduce((sum, p) => sum + p, 0) / 20;
}

function classifyRegime(snapshots, previousRegime) {
  const triggeredRules = [];
  const untriggeredRules = [];

  const qqq = snapshots.find((s) => s.indicator === "QQQ");
  const gld = snapshots.find((s) => s.indicator === "GLD");
  const vix = snapshots.find((s) => s.indicator === "VIXCLS");
  const btc = snapshots.find((s) => s.indicator === "BTC-USD");

  // Rule A
  if (qqq && gld && qqq.change1d !== null && gld.change1d !== null) {
    if (qqq.change1d <= -2.0 && gld.change1d >= 1.0) triggeredRules.push("A: " + RULES.A.description);
    else untriggeredRules.push("A: " + RULES.A.description);
  } else untriggeredRules.push("A: " + RULES.A.description + " (数据缺失)");

  // Rule B
  if (vix && qqq && vix.latestValue !== null && qqq.change1d !== null) {
    if (vix.latestValue >= 20 && qqq.change1d < 0) triggeredRules.push("B: " + RULES.B.description);
    else untriggeredRules.push("B: " + RULES.B.description);
  } else untriggeredRules.push("B: " + RULES.B.description + " (数据缺失)");

  // Rule C
  if (qqq && gld && qqq.aboveMa20 !== null && gld.aboveMa20 !== null) {
    if (!qqq.aboveMa20 && gld.aboveMa20) triggeredRules.push("C: " + RULES.C.description);
    else untriggeredRules.push("C: " + RULES.C.description);
  } else untriggeredRules.push("C: " + RULES.C.description + " (MA数据缺失)");

  // Rule D
  if (qqq && qqq.change1d !== null && qqq.aboveMa20 !== null) {
    if (qqq.change1d >= 1.0 && qqq.aboveMa20) triggeredRules.push("D: " + RULES.D.description);
    else untriggeredRules.push("D: " + RULES.D.description);
  } else untriggeredRules.push("D: " + RULES.D.description + " (数据缺失)");

  // Rule E
  if (gld && (gld.change1d !== null || gld.aboveMa20 !== null)) {
    if ((gld.change1d !== null && gld.change1d <= 0.5) || gld.aboveMa20 === false)
      triggeredRules.push("E: " + RULES.E.description);
    else untriggeredRules.push("E: " + RULES.E.description);
  } else untriggeredRules.push("E: " + RULES.E.description + " (数据缺失)");

  // Rule F
  if (btc && (btc.change1d !== null || btc.aboveMa20 !== null)) {
    if ((btc.change1d !== null && btc.change1d >= 0) || btc.aboveMa20 === true)
      triggeredRules.push("F: " + RULES.F.description);
    else untriggeredRules.push("F: " + RULES.F.description);
  } else untriggeredRules.push("F: " + RULES.F.description + " (数据缺失)");

  const riskOffTriggered = triggeredRules.some((r) => r.startsWith("A:") || r.startsWith("B:") || r.startsWith("C:"));
  const riskOnTriggered = triggeredRules.some((r) => r.startsWith("D:") || r.startsWith("E:") || r.startsWith("F:"));

  let regime = "base";
  if (riskOffTriggered && !riskOnTriggered) regime = "risk_off";
  else if (riskOnTriggered && !riskOffTriggered) regime = "risk_on";

  const status = previousRegime === regime ? "confirmed" : "watch";
  const totalRules = 6;
  const validRules = triggeredRules.filter((r) => !r.includes("数据缺失")).length + untriggeredRules.filter((r) => !r.includes("数据缺失")).length;
  const confidence = Math.min(100, 60 + (validRules / totalRules) * 40);

  return { regime, status, confidence, triggeredRules, untriggeredRules };
}

function generateSwitches(regime) {
  switch (regime.regime) {
    case "risk_off":
      return { marginBorrow: "forbidden", putSelling: "aggressive", spotPace: "pause" };
    case "risk_on":
      return { marginBorrow: "allowed", putSelling: "helper", spotPace: "fast" };
    default:
      return { marginBorrow: "allowed", putSelling: "helper", spotPace: "medium" };
  }
}

function calculateDataQuality(snapshots) {
  const total = snapshots.length;
  const valid = snapshots.filter((s) => s.latestValue !== null).length;
  return Math.round((valid / total) * 100);
}

// ============ BTC 分析逻辑 ============

function classifyEtfFlowTag(rolling5d, rolling20d) {
  if (rolling5d === null && rolling20d === null) return { tag: "Neutral", reason: "No ETF flow data" };
  if (rolling5d !== null && rolling5d > 0 && (rolling20d === null || rolling20d > 0))
    return { tag: "Supportive", reason: `5D avg: $${rolling5d.toFixed(1)}M` };
  if (rolling5d !== null && rolling5d < -50)
    return { tag: "Drag", reason: `5D avg: $${rolling5d.toFixed(1)}M (significant outflow)` };
  return { tag: "Neutral", reason: `5D avg: $${(rolling5d || 0).toFixed(1)}M` };
}

function analyzeBtcMarket(snapshots, etfFlowData) {
  const btc = snapshots.find((s) => s.indicator === "BTC-USD");
  const funding = snapshots.find((s) => s.indicator === "crypto_funding");
  const oi = snapshots.find((s) => s.indicator === "crypto_oi");
  const liq = snapshots.find((s) => s.indicator === "crypto_liquidations");
  const stable = snapshots.find((s) => s.indicator === "stablecoin");

  // ETF flow analysis
  let etfFlowToday = null, etfFlowRolling5d = null, etfFlowRolling20d = null, etfFlowAsOfDate = "";
  if (etfFlowData && etfFlowData.length > 0) {
    const sorted = [...etfFlowData].sort((a, b) => a.date.localeCompare(b.date));
    const latest = sorted[sorted.length - 1];
    etfFlowToday = latest.total;
    etfFlowAsOfDate = latest.date;
    // Calculate rolling averages
    const last5 = sorted.slice(-5).filter((d) => d.total !== null);
    const last20 = sorted.slice(-20).filter((d) => d.total !== null);
    if (last5.length >= 3) etfFlowRolling5d = last5.reduce((s, d) => s + d.total, 0) / last5.length;
    if (last20.length >= 10) etfFlowRolling20d = last20.reduce((s, d) => s + d.total, 0) / last20.length;
  }

  const etfTag = classifyEtfFlowTag(etfFlowRolling5d, etfFlowRolling20d);

  // Build evidence
  const evidence = {
    price: {
      latest: btc?.latestValue ?? null,
      pct7d: btc?.change7d ?? null,
      pct30d: btc?.change30d ?? null,
    },
    oi: {
      latest: oi?.latestValue ?? null,
      pct7d: oi?.change7d ?? null,
    },
    funding: {
      latest: funding?.latestValue ?? null,
    },
    liquidations: {
      h24: liq?.latestValue ?? null,
    },
    stablecoin: {
      latest: stable?.latestValue ?? null,
      pct7d: stable?.change7d ?? null,
      pct30d: stable?.change30d ?? null,
    },
    etfFlow: {
      today: etfFlowToday,
      rolling5d: etfFlowRolling5d,
      rolling20d: etfFlowRolling20d,
      asOfDate: etfFlowAsOfDate,
      tag: etfTag.tag,
      tagReason: etfTag.reason,
    },
  };

  // Determine BTC state (S1-S4)
  const priceTrendUp = btc?.change7d !== null && btc.change7d > 0;
  const oiExpanding = oi?.change7d !== null && oi.change7d > 5;
  const oiContracting = oi?.change7d !== null && oi.change7d < -5;

  let state = "S2"; // default: correction
  let liquidityTag = "Unknown";
  const stateReasons = [];

  if (priceTrendUp && oiExpanding) {
    state = "S1"; // Healthy uptrend
    liquidityTag = "Expanding";
    stateReasons.push("Price up + OI expanding");
  } else if (priceTrendUp && !oiExpanding) {
    state = "S1";
    liquidityTag = oiContracting ? "Contracting" : "Unknown";
    stateReasons.push("Price up but OI not expanding");
  } else if (!priceTrendUp && oiContracting) {
    state = "S3"; // Deleveraging
    liquidityTag = "Contracting";
    stateReasons.push("Price down + OI contracting (deleveraging)");
  } else if (!priceTrendUp && oiExpanding) {
    state = "S4"; // Bearish leverage
    liquidityTag = "Expanding";
    stateReasons.push("Price down + OI expanding (bearish leverage)");
  } else {
    state = "S2"; // Correction
    liquidityTag = "Unknown";
    stateReasons.push("Mixed signals");
  }

  return { state, liquidityTag, confidence: "watch", evidence, stateReasons };
}

// ============ 主流程 ============

async function main() {
  console.log("=== Market Regime Monitor - Report Generation ===");
  console.log(`Time: ${new Date().toISOString()}`);

  const FRED_API_KEY = process.env.FRED_API_KEY || "";
  const COINALYZE_API_KEY = process.env.COINALYZE_API_KEY || "";
  const COINGLASS_API_KEY = process.env.COINGLASS_API_KEY || "";

  if (!FRED_API_KEY) {
    console.error("ERROR: FRED_API_KEY is required");
    process.exit(1);
  }

  // 1. 获取所有市场数据
  console.log("\n--- Step 1: Fetching market data ---");
  const snapshots = [];
  let liquidationData = null;

  for (const config of INDICATORS_CONFIG) {
    let prices = [];
    let latest = null;

    try {
      if (config.source === "yahoo") {
        const data = await fetchYahooData(config.indicator);
        prices = data.prices;
        latest = data.latest;
      } else if (config.source === "fred") {
        const data = await fetchFredData(config.indicator, FRED_API_KEY);
        prices = data.prices;
        latest = data.latest;
      } else if (config.source === "binance") {
        if (config.indicator === "crypto_funding") latest = await fetchBinanceData("funding");
        else if (config.indicator === "crypto_oi") latest = await fetchBinanceData("oi");
        else if (config.indicator === "crypto_liquidations") latest = await fetchBinanceData("liquidations");
      } else if (config.source === "defillama") {
        latest = await fetchDefiLlamaData();
      } else if (config.source === "coinalyze_oi") {
        // Try Coinalyze first (aggregated multi-exchange OI), then CoinGlass, then Binance/OKX
        if (COINALYZE_API_KEY) {
          latest = await fetchCoinalyzeOI(COINALYZE_API_KEY);
        }
        if (latest === null && COINGLASS_API_KEY) {
          latest = await fetchCoinGlassOI(COINGLASS_API_KEY);
        }
        if (latest === null) {
          console.log("[Crypto OI] Coinalyze/CoinGlass unavailable, trying Binance+OKX...");
          latest = await fetchBinanceData("oi");
        }
      } else if (config.source === "coinalyze") {
        if (COINALYZE_API_KEY) {
          const liqData = await fetchCoinalyzeLiquidations(COINALYZE_API_KEY);
          if (liqData) { latest = liqData.total24h; liquidationData = liqData; }
        } else {
          // Fallback to OKX
          const liqData = await fetchOKXLiquidations();
          if (liqData) { latest = liqData.total24h; liquidationData = liqData; }
        }
      }
    } catch (error) {
      console.error(`[Error] ${config.indicator}:`, error.message);
    }

    const ma20 = calculateMA20(prices);
    snapshots.push({
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

  console.log(`\nFetched ${snapshots.length} indicators`);

  // 2. 读取前一天的报告获取 previousRegime
  console.log("\n--- Step 2: Loading previous report ---");
  const docsDir = path.resolve(__dirname, "../docs/reports");
  let previousRegime = undefined;
  try {
    const latestPath = path.join(docsDir, "latest.json");
    if (fs.existsSync(latestPath)) {
      const prev = JSON.parse(fs.readFileSync(latestPath, "utf-8"));
      previousRegime = prev?.regime?.regime;
      console.log(`Previous regime: ${previousRegime}`);
    }
  } catch (e) {
    console.log("No previous report found");
  }

  // 3. 判定市场情景
  console.log("\n--- Step 3: Classifying regime ---");
  const regime = classifyRegime(snapshots, previousRegime);
  console.log(`Regime: ${regime.regime} (${regime.status}), Confidence: ${regime.confidence}%`);

  // 4. 生成执行开关
  const switches = generateSwitches(regime);
  console.log(`Switches: Margin=${switches.marginBorrow}, Put=${switches.putSelling}, Spot=${switches.spotPace}`);

  // 5. 计算数据质量
  const dataQuality = calculateDataQuality(snapshots);
  console.log(`Data Quality: ${dataQuality}/100`);

  // 6. 获取 ETF Flow 数据
  console.log("\n--- Step 4: Fetching ETF Flow ---");
  const etfFlowData = await fetchEtfFlowData();

  // 7. BTC 分析
  console.log("\n--- Step 5: BTC Analysis ---");
  const btcAnalysis = analyzeBtcMarket(snapshots, etfFlowData);
  console.log(`BTC State: ${btcAnalysis.state}, Liquidity: ${btcAnalysis.liquidityTag}`);

  // 8. 构建输出 JSON
  const now = new Date();
  const bjTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const dateStr = bjTime.toISOString().split("T")[0];
  const timeStr = bjTime.toISOString().split("T")[1].slice(0, 8);

  const report = {
    version: "2.0",
    generatedAt: now.toISOString(),
    generatedAtBJT: `${dateStr} ${timeStr}`,
    date: dateStr,

    // 核心判定
    regime: {
      regime: regime.regime,
      status: regime.status,
      confidence: regime.confidence,
      triggeredRules: regime.triggeredRules,
      untriggeredRules: regime.untriggeredRules,
    },

    // 执行开关
    switches,

    // 数据质量
    dataQuality: {
      score: dataQuality,
      total: snapshots.length,
      valid: snapshots.filter((s) => s.latestValue !== null).length,
    },

    // 所有指标快照
    snapshots: snapshots.map((s) => ({
      indicator: s.indicator,
      displayName: s.displayName,
      latestValue: s.latestValue,
      change1d: s.change1d,
      change7d: s.change7d,
      change30d: s.change30d,
      ma20: s.ma20,
      aboveMa20: s.aboveMa20,
      sparklineData: s.sparklineData,
    })),

    // BTC 分析
    btcAnalysis: {
      state: btcAnalysis.state,
      liquidityTag: btcAnalysis.liquidityTag,
      confidence: btcAnalysis.confidence,
      evidence: btcAnalysis.evidence,
      stateReasons: btcAnalysis.stateReasons,
    },

    // 清算数据详情
    liquidationData: liquidationData
      ? {
          total24h: liquidationData.total24h,
          long24h: liquidationData.long24h,
          short24h: liquidationData.short24h,
          total7d: liquidationData.total7d,
          source: liquidationData.source,
          requestTime: liquidationData.requestTime,
        }
      : null,

    // ETF Flow 最近数据
    etfFlow: etfFlowData.slice(-30),
  };

  // 9. 写入文件
  console.log("\n--- Step 6: Writing output files ---");
  fs.mkdirSync(docsDir, { recursive: true });

  const latestPath = path.join(docsDir, "latest.json");
  const dailyPath = path.join(docsDir, `${dateStr}.json`);

  fs.writeFileSync(latestPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(dailyPath, JSON.stringify(report, null, 2));

  // 10. 更新 index.json（所有可用报告日期列表）
  const existingFiles = fs.readdirSync(docsDir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f));
  const dates = existingFiles.map((f) => f.replace(".json", "")).sort().reverse();
  fs.writeFileSync(path.join(docsDir, "index.json"), JSON.stringify({ dates, updatedAt: now.toISOString() }, null, 2));

  console.log(`\n✅ Report written:`);
  console.log(`  - ${latestPath}`);
  console.log(`  - ${dailyPath}`);
  console.log(`  - ${path.join(docsDir, "index.json")}`);
  console.log(`\nDone!`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
