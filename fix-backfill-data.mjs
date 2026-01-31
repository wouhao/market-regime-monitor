/**
 * 修复回填数据：
 * 1. 重新回填Funding Rate（移除错误的×100）
 * 2. 修复1/30、1/31的异常OI数据
 */
import mysql from 'mysql2/promise';
import axios from 'axios';

const COINGLASS_BASE_URL = "https://open-api-v4.coinglass.com";

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  // 获取CoinGlass API Key
  const [rows] = await conn.execute("SELECT configValue FROM api_configs WHERE configKey = 'COINGLASS_API_KEY'");
  const apiKey = rows[0]?.configValue;
  
  if (!apiKey) {
    console.log('No CoinGlass API key found');
    await conn.end();
    return;
  }
  
  console.log('=== 修复回填数据 ===\n');
  
  // 1. 重新回填Funding Rate（30天）
  console.log('1. 重新回填Funding Rate...');
  const endTime = Date.now();
  const startTime = endTime - 30 * 24 * 60 * 60 * 1000;
  
  const fundingUrl = `${COINGLASS_BASE_URL}/api/futures/funding-rate/oi-weight-history?symbol=BTC&interval=1d&start_time=${startTime}&end_time=${endTime}`;
  const fundingResp = await axios.get(fundingUrl, {
    headers: { 'accept': 'application/json', 'CG-API-KEY': apiKey },
    timeout: 30000
  });
  
  if (fundingResp.data?.code === '0' && fundingResp.data?.data) {
    let fundingUpdated = 0;
    for (const point of fundingResp.data.data) {
      const date = new Date(point.time);
      const bjDate = new Date(date.getTime() + 8 * 60 * 60 * 1000);
      const dateStr = bjDate.toISOString().split('T')[0];
      
      const rawValue = typeof point.close === 'string' ? parseFloat(point.close) : point.close;
      if (!isNaN(rawValue)) {
        // 更新Funding Rate（不乘100，直接存储原始值）
        await conn.execute(
          `UPDATE crypto_metrics_daily SET funding = ?, sourceFunding = 'CoinGlass OI-Weighted' WHERE dateBjt = ?`,
          [rawValue, dateStr]
        );
        fundingUpdated++;
        console.log(`  ${dateStr}: ${rawValue.toFixed(6)}%`);
      }
    }
    console.log(`  Funding Rate更新: ${fundingUpdated}条\n`);
  }
  
  // 2. 修复1/30、1/31的异常OI数据
  console.log('2. 修复异常OI数据...');
  const oiUrl = `${COINGLASS_BASE_URL}/api/futures/open-interest/aggregated-history?symbol=BTC&interval=1d&start_time=${startTime}&end_time=${endTime}`;
  const oiResp = await axios.get(oiUrl, {
    headers: { 'accept': 'application/json', 'CG-API-KEY': apiKey },
    timeout: 30000
  });
  
  if (oiResp.data?.code === '0' && oiResp.data?.data) {
    // 只更新1/30和1/31的数据
    const datesToFix = ['2026-01-30', '2026-01-31'];
    
    for (const point of oiResp.data.data) {
      const date = new Date(point.time);
      const bjDate = new Date(date.getTime() + 8 * 60 * 60 * 1000);
      const dateStr = bjDate.toISOString().split('T')[0];
      
      if (datesToFix.includes(dateStr)) {
        const oiValue = typeof point.close === 'string' ? parseFloat(point.close) : point.close;
        if (!isNaN(oiValue)) {
          await conn.execute(
            `UPDATE crypto_metrics_daily SET oiUsd = ?, sourceOi = 'CoinGlass Aggregated' WHERE dateBjt = ?`,
            [oiValue, dateStr]
          );
          console.log(`  ${dateStr}: $${(oiValue / 1e9).toFixed(2)}B (修复)`);
        }
      }
    }
  }
  
  // 3. 验证修复结果
  console.log('\n3. 验证修复结果...');
  const [verifyRows] = await conn.execute(
    'SELECT dateBjt, funding, oiUsd FROM crypto_metrics_daily ORDER BY dateBjt DESC LIMIT 10'
  );
  
  console.log('\n=== 最近10天数据 ===');
  console.log('日期       | Funding Rate | OI');
  console.log('-'.repeat(50));
  for (const row of verifyRows) {
    const funding = row.funding ? Number(row.funding).toFixed(6) + '%' : 'null';
    const oi = row.oiUsd ? '$' + (Number(row.oiUsd) / 1e9).toFixed(2) + 'B' : 'null';
    console.log(`${row.dateBjt} | ${funding.padEnd(14)} | ${oi}`);
  }
  
  await conn.end();
  console.log('\n修复完成!');
}

main().catch(console.error);
