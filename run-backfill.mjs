/**
 * 执行CoinGlass历史数据回填脚本
 */
import mysql from 'mysql2/promise';

// CoinGlass API配置
const COINGLASS_BASE_URL = "https://open-api-v4.coinglass.com";

async function main() {
  console.log("=== CoinGlass Historical Data Backfill ===\n");
  
  // 1. 获取API Key
  console.log("[Step 1] Getting CoinGlass API Key from database...");
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  const [rows] = await conn.execute("SELECT configValue FROM api_configs WHERE configKey = 'COINGLASS_API_KEY'");
  const apiKey = rows[0]?.configValue;
  
  if (!apiKey) {
    console.log("❌ No CoinGlass API Key found in database");
    await conn.end();
    return;
  }
  console.log("✅ API Key found\n");
  
  // 2. 计算时间范围（30天）
  const days = 30;
  const endTime = Date.now();
  const startTime = endTime - days * 24 * 60 * 60 * 1000;
  console.log(`[Step 2] Time range: ${new Date(startTime).toISOString().split('T')[0]} to ${new Date(endTime).toISOString().split('T')[0]}\n`);
  
  // 3. 获取OI历史数据
  console.log("[Step 3] Fetching OI Aggregated History...");
  const oiData = new Map();
  try {
    const oiUrl = `${COINGLASS_BASE_URL}/api/futures/open-interest/aggregated-history?symbol=BTC&interval=1d&start_time=${startTime}&end_time=${endTime}`;
    const oiResponse = await fetch(oiUrl, {
      headers: { 'accept': 'application/json', 'CG-API-KEY': apiKey }
    });
    const oiJson = await oiResponse.json();
    if (oiJson.code === "0" && oiJson.data) {
      for (const point of oiJson.data) {
        const date = new Date(point.time);
        const bjDate = new Date(date.getTime() + 8 * 60 * 60 * 1000);
        const dateStr = bjDate.toISOString().split('T')[0];
        const closeValue = typeof point.close === 'string' ? parseFloat(point.close) : point.close;
        if (!isNaN(closeValue)) oiData.set(dateStr, closeValue);
      }
    }
    console.log(`✅ OI data points: ${oiData.size}\n`);
  } catch (err) {
    console.log(`❌ Failed to fetch OI: ${err.message}\n`);
  }
  
  // 4. 获取Funding Rate历史数据
  console.log("[Step 4] Fetching OI-Weighted Funding Rate History...");
  const fundingData = new Map();
  try {
    const fundingUrl = `${COINGLASS_BASE_URL}/api/futures/funding-rate/oi-weight-history?symbol=BTC&interval=1d&start_time=${startTime}&end_time=${endTime}`;
    const fundingResponse = await fetch(fundingUrl, {
      headers: { 'accept': 'application/json', 'CG-API-KEY': apiKey }
    });
    const fundingJson = await fundingResponse.json();
    if (fundingJson.code === "0" && fundingJson.data) {
      for (const point of fundingJson.data) {
        const date = new Date(point.time);
        const bjDate = new Date(date.getTime() + 8 * 60 * 60 * 1000);
        const dateStr = bjDate.toISOString().split('T')[0];
        const closeValue = typeof point.close === 'string' ? parseFloat(point.close) : point.close;
        if (!isNaN(closeValue)) fundingData.set(dateStr, closeValue * 100); // 转换为百分比
      }
    }
    console.log(`✅ Funding data points: ${fundingData.size}\n`);
  } catch (err) {
    console.log(`❌ Failed to fetch Funding: ${err.message}\n`);
  }
  
  // 5. 获取Liquidation历史数据（多交易所聚合）
  console.log("[Step 5] Fetching Liquidation History (multi-exchange)...");
  const liqData = new Map();
  const exchanges = ['Binance', 'OKX', 'Bybit'];
  const symbols = { 'Binance': 'BTCUSDT', 'OKX': 'BTC-USDT-SWAP', 'Bybit': 'BTCUSDT' };
  
  for (const exchange of exchanges) {
    try {
      const symbol = symbols[exchange];
      const liqUrl = `${COINGLASS_BASE_URL}/api/futures/liquidation/history?exchange=${exchange}&symbol=${symbol}&interval=1d&start_time=${startTime}&end_time=${endTime}`;
      const liqResponse = await fetch(liqUrl, {
        headers: { 'accept': 'application/json', 'CG-API-KEY': apiKey }
      });
      const liqJson = await liqResponse.json();
      if (liqJson.code === "0" && liqJson.data) {
        for (const point of liqJson.data) {
          const date = new Date(point.time);
          const bjDate = new Date(date.getTime() + 8 * 60 * 60 * 1000);
          const dateStr = bjDate.toISOString().split('T')[0];
          const longLiq = typeof point.long_liquidation_usd === 'string' ? parseFloat(point.long_liquidation_usd) : point.long_liquidation_usd;
          const shortLiq = typeof point.short_liquidation_usd === 'string' ? parseFloat(point.short_liquidation_usd) : point.short_liquidation_usd;
          if (!isNaN(longLiq) && !isNaN(shortLiq)) {
            const existing = liqData.get(dateStr) || 0;
            liqData.set(dateStr, existing + longLiq + shortLiq);
          }
        }
        console.log(`  ${exchange}: ${liqJson.data.length} points`);
      }
    } catch (err) {
      console.log(`  ${exchange}: Failed - ${err.message}`);
    }
  }
  console.log(`✅ Liquidation data points: ${liqData.size}\n`);
  
  // 6. 合并所有日期
  const allDates = new Set();
  oiData.forEach((_, date) => allDates.add(date));
  fundingData.forEach((_, date) => allDates.add(date));
  liqData.forEach((_, date) => allDates.add(date));
  const sortedDates = Array.from(allDates).sort();
  
  console.log(`[Step 6] Processing ${sortedDates.length} unique dates...\n`);
  
  // 7. 写入数据库
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  
  for (const dateStr of sortedDates) {
    const oi = oiData.get(dateStr);
    const funding = fundingData.get(dateStr);
    const liq = liqData.get(dateStr);
    
    // 检查是否已存在
    const [existing] = await conn.execute(
      "SELECT id, oiUsd, funding, liq24hUsd FROM crypto_metrics_daily WHERE dateBjt = ?",
      [dateStr]
    );
    
    const date = new Date(dateStr + 'T00:00:00+08:00');
    const tsBjt = Math.floor(date.getTime() / 1000);
    
    if (existing.length > 0) {
      // 更新现有记录（只更新缺失的字段）
      const record = existing[0];
      const updates = [];
      const values = [];
      
      if (record.oiUsd === null && oi !== undefined) {
        updates.push("oiUsd = ?");
        values.push(oi.toString());
      }
      if (record.funding === null && funding !== undefined) {
        updates.push("funding = ?");
        values.push(funding.toString());
      }
      if (record.liq24hUsd === null && liq !== undefined) {
        updates.push("liq24hUsd = ?");
        values.push(liq.toString());
      }
      
      if (updates.length > 0) {
        updates.push("sourceOi = ?", "sourceFunding = ?", "sourceLiq = ?");
        values.push("CoinGlass Aggregated", "CoinGlass OI-Weighted", "CoinGlass Multi-Exchange");
        values.push(record.id);
        
        await conn.execute(
          `UPDATE crypto_metrics_daily SET ${updates.join(", ")} WHERE id = ?`,
          values
        );
        updated++;
        console.log(`  Updated ${dateStr}: OI=${oi ? 'Y' : 'N'}, Funding=${funding ? 'Y' : 'N'}, Liq=${liq ? 'Y' : 'N'}`);
      } else {
        skipped++;
      }
    } else {
      // 插入新记录
      await conn.execute(
        `INSERT INTO crypto_metrics_daily (dateBjt, tsBjt, oiUsd, funding, liq24hUsd, sourceOi, sourceFunding, sourceLiq, notes) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          dateStr,
          tsBjt,
          oi !== undefined ? oi.toString() : null,
          funding !== undefined ? funding.toString() : null,
          liq !== undefined ? liq.toString() : null,
          oi !== undefined ? "CoinGlass Aggregated" : null,
          funding !== undefined ? "CoinGlass OI-Weighted" : null,
          liq !== undefined ? "CoinGlass Multi-Exchange" : null,
          JSON.stringify({ backfilled: true, backfillTime: new Date().toISOString() })
        ]
      );
      inserted++;
      console.log(`  Inserted ${dateStr}: OI=${oi ? 'Y' : 'N'}, Funding=${funding ? 'Y' : 'N'}, Liq=${liq ? 'Y' : 'N'}`);
    }
  }
  
  await conn.end();
  
  console.log("\n=== Backfill Complete ===");
  console.log(`Inserted: ${inserted}`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Total: ${sortedDates.length}`);
}

main().catch(console.error);
