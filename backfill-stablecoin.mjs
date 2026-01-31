/**
 * 从DefiLlama回填历史稳定币数据（USDT+USDC）
 */
import mysql from 'mysql2/promise';
import axios from 'axios';

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  console.log('=== 回填DefiLlama历史稳定币数据 ===\n');
  
  // 获取USDT历史数据
  console.log('1. 获取USDT历史数据...');
  const usdtUrl = 'https://stablecoins.llama.fi/stablecoincharts/all?stablecoin=1';
  const usdtResp = await axios.get(usdtUrl, { timeout: 60000 });
  
  // 获取USDC历史数据
  console.log('2. 获取USDC历史数据...');
  const usdcUrl = 'https://stablecoins.llama.fi/stablecoincharts/all?stablecoin=2';
  const usdcResp = await axios.get(usdcUrl, { timeout: 60000 });
  
  // 构建日期到供应量的映射
  const usdtMap = new Map();
  for (const point of usdtResp.data) {
    const date = new Date(point.date * 1000).toISOString().split('T')[0];
    const supply = point.totalCirculatingUSD?.peggedUSD || 0;
    usdtMap.set(date, supply);
  }
  
  const usdcMap = new Map();
  for (const point of usdcResp.data) {
    const date = new Date(point.date * 1000).toISOString().split('T')[0];
    const supply = point.totalCirculatingUSD?.peggedUSD || 0;
    usdcMap.set(date, supply);
  }
  
  console.log(`   USDT数据点: ${usdtMap.size}`);
  console.log(`   USDC数据点: ${usdcMap.size}`);
  
  // 获取数据库中已有的日期
  const [existingRows] = await conn.execute(
    'SELECT dateBjt FROM crypto_metrics_daily ORDER BY dateBjt'
  );
  
  console.log(`\n3. 更新数据库中的稳定币数据...`);
  let updated = 0;
  
  for (const row of existingRows) {
    const dateStr = row.dateBjt;
    const usdt = usdtMap.get(dateStr) || 0;
    const usdc = usdcMap.get(dateStr) || 0;
    const total = usdt + usdc;
    
    if (total > 0) {
      await conn.execute(
        `UPDATE crypto_metrics_daily 
         SET stableUsdtUsdcUsd = ?, sourceStable = 'DefiLlama (USDT+USDC)' 
         WHERE dateBjt = ?`,
        [total, dateStr]
      );
      updated++;
      
      if (updated <= 5 || updated % 10 === 0) {
        console.log(`   ${dateStr}: $${(total / 1e9).toFixed(2)}B (USDT: $${(usdt / 1e9).toFixed(2)}B + USDC: $${(usdc / 1e9).toFixed(2)}B)`);
      }
    }
  }
  
  console.log(`   ... 共更新 ${updated} 条记录`);
  
  // 验证结果
  console.log('\n4. 验证结果 (最近10天):');
  const [verifyRows] = await conn.execute(
    'SELECT dateBjt, stableUsdtUsdcUsd FROM crypto_metrics_daily ORDER BY dateBjt DESC LIMIT 10'
  );
  
  console.log('日期       | Stablecoin Supply');
  console.log('-'.repeat(40));
  for (const row of verifyRows) {
    const stable = row.stableUsdtUsdcUsd ? '$' + (Number(row.stableUsdtUsdcUsd) / 1e9).toFixed(2) + 'B' : 'null';
    console.log(`${row.dateBjt} | ${stable}`);
  }
  
  await conn.end();
  console.log('\n回填完成!');
}

main().catch(console.error);
