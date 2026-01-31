import mysql from 'mysql2/promise';
import axios from 'axios';

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  const [rows] = await conn.execute("SELECT configValue FROM api_configs WHERE configKey = 'COINGLASS_API_KEY'");
  const apiKey = rows[0]?.configValue;
  await conn.end();
  
  if (!apiKey) {
    console.log('No API key found');
    return;
  }
  
  // 获取最近几天的OI历史
  const endTime = Date.now();
  const startTime = endTime - 7 * 24 * 60 * 60 * 1000;
  
  const url = `https://open-api-v4.coinglass.com/api/futures/open-interest/aggregated-history?symbol=BTC&interval=1d&start_time=${startTime}&end_time=${endTime}`;
  
  console.log('Fetching OI from CoinGlass...');
  const response = await axios.get(url, {
    headers: { 'accept': 'application/json', 'CG-API-KEY': apiKey },
    timeout: 30000
  });
  
  if (response.data?.code === '0' && response.data?.data) {
    console.log('\n=== CoinGlass Raw OI Data (Aggregated) ===');
    for (const point of response.data.data.slice(-7)) {
      const date = new Date(point.time);
      const bjDate = new Date(date.getTime() + 8 * 60 * 60 * 1000);
      const dateStr = bjDate.toISOString().split('T')[0];
      const rawValue = typeof point.close === 'string' ? parseFloat(point.close) : point.close;
      console.log(`${dateStr}: $${(rawValue / 1e9).toFixed(2)}B (raw: ${rawValue.toExponential(4)})`);
    }
  }
  
  console.log('\n=== 对比：当前实时OI (Binance单交易所) ===');
  const binanceOiUrl = 'https://fapi.binance.com/fapi/v1/openInterest?symbol=BTCUSDT';
  const binancePriceUrl = 'https://fapi.binance.com/fapi/v1/ticker/price?symbol=BTCUSDT';
  
  const [oiResp, priceResp] = await Promise.all([
    axios.get(binanceOiUrl, { timeout: 5000 }),
    axios.get(binancePriceUrl, { timeout: 5000 })
  ]);
  
  const oiBtc = parseFloat(oiResp.data.openInterest);
  const price = parseFloat(priceResp.data.price);
  const oiUsd = oiBtc * price;
  
  console.log(`Binance OI: ${oiBtc.toFixed(2)} BTC × $${price.toFixed(2)} = $${(oiUsd / 1e9).toFixed(2)}B`);
  
  // 查看数据库中存储的值
  const conn2 = await mysql.createConnection(process.env.DATABASE_URL);
  const [dbRows] = await conn2.execute(
    'SELECT dateBjt, oiUsd, sourceOi FROM crypto_metrics_daily ORDER BY dateBjt DESC LIMIT 7'
  );
  await conn2.end();
  
  console.log('\n=== 数据库中存储的OI值 ===');
  for (const row of dbRows) {
    const oi = row.oiUsd ? Number(row.oiUsd) : null;
    console.log(`${row.dateBjt}: $${oi ? (oi / 1e9).toFixed(2) + 'B' : 'null'} (source: ${row.sourceOi || 'N/A'})`);
  }
}

main().catch(console.error);
