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
  
  // 获取最近几天的Funding Rate历史
  const endTime = Date.now();
  const startTime = endTime - 7 * 24 * 60 * 60 * 1000;
  
  const url = `https://open-api-v4.coinglass.com/api/futures/funding-rate/oi-weight-history?symbol=BTC&interval=1d&start_time=${startTime}&end_time=${endTime}`;
  
  console.log('Fetching from CoinGlass...');
  const response = await axios.get(url, {
    headers: { 'accept': 'application/json', 'CG-API-KEY': apiKey },
    timeout: 30000
  });
  
  if (response.data?.code === '0' && response.data?.data) {
    console.log('\n=== CoinGlass Raw Funding Rate Data ===');
    for (const point of response.data.data.slice(-7)) {
      const date = new Date(point.time);
      const bjDate = new Date(date.getTime() + 8 * 60 * 60 * 1000);
      const dateStr = bjDate.toISOString().split('T')[0];
      const rawValue = typeof point.close === 'string' ? parseFloat(point.close) : point.close;
      console.log(`${dateStr}: raw=${rawValue.toFixed(8)}, 正确格式=${rawValue.toFixed(6)}%`);
    }
    
    console.log('\n=== 对比：当前实时Funding (Binance) ===');
    const binanceUrl = 'https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&limit=1';
    const binanceResp = await axios.get(binanceUrl, { timeout: 5000 });
    if (binanceResp.data?.[0]) {
      const rate = parseFloat(binanceResp.data[0].fundingRate);
      console.log(`Binance raw: ${rate.toFixed(8)}, *100=${(rate * 100).toFixed(6)}%`);
    }
  }
}

main().catch(console.error);
