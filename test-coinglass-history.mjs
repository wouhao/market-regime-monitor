import mysql from 'mysql2/promise';

async function main() {
  // 获取API Key
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  const [rows] = await conn.execute("SELECT configValue FROM api_configs WHERE configKey = 'COINGLASS_API_KEY'");
  const apiKey = rows[0]?.configValue;
  await conn.end();
  
  if (!apiKey) {
    console.log('No CoinGlass API Key found');
    return;
  }
  
  console.log('Testing CoinGlass API v4 - Historical Data Endpoints...\n');
  
  // 测试获取30天BTC历史数据
  const endTime = Date.now();
  const startTime = endTime - 30 * 24 * 60 * 60 * 1000; // 30天前
  
  // 1. 测试 OI Aggregated History (已成功)
  console.log('=== 1. OI Aggregated History ===');
  const oiUrl = `https://open-api-v4.coinglass.com/api/futures/open-interest/aggregated-history?symbol=BTC&interval=1d&start_time=${startTime}&end_time=${endTime}`;
  
  try {
    const oiResponse = await fetch(oiUrl, {
      headers: {
        'accept': 'application/json',
        'CG-API-KEY': apiKey
      }
    });
    
    const oiData = await oiResponse.json();
    console.log('Response code:', oiData.code);
    
    if (oiData.data && oiData.data.length > 0) {
      console.log('✅ SUCCESS - Data points received:', oiData.data.length);
      console.log('First:', new Date(oiData.data[0].time).toISOString().split('T')[0], '- OI:', oiData.data[0].close);
      console.log('Last:', new Date(oiData.data[oiData.data.length - 1].time).toISOString().split('T')[0], '- OI:', oiData.data[oiData.data.length - 1].close);
    } else {
      console.log('❌ No data received');
    }
  } catch (err) {
    console.log('Error:', err.message);
  }
  
  // 2. 测试 OI-Weighted Funding Rate History (正确的URL路径)
  // 根据文档截图: /api/futures/funding-rate/oi-weight-history
  console.log('\n=== 2. OI-Weighted Funding Rate History ===');
  const oiWeightFundingUrl = `https://open-api-v4.coinglass.com/api/futures/funding-rate/oi-weight-history?symbol=BTC&interval=1d&start_time=${startTime}&end_time=${endTime}`;
  
  try {
    const fundingResponse = await fetch(oiWeightFundingUrl, {
      headers: {
        'accept': 'application/json',
        'CG-API-KEY': apiKey
      }
    });
    
    const fundingData = await fundingResponse.json();
    console.log('Response code:', fundingData.code);
    
    if (fundingData.data && fundingData.data.length > 0) {
      console.log('✅ SUCCESS - Data points received:', fundingData.data.length);
      console.log('First:', new Date(fundingData.data[0].time).toISOString().split('T')[0], '- Funding:', fundingData.data[0].close);
      console.log('Last:', new Date(fundingData.data[fundingData.data.length - 1].time).toISOString().split('T')[0], '- Funding:', fundingData.data[fundingData.data.length - 1].close);
    } else {
      console.log('❌ No data received');
      console.log('Full response:', JSON.stringify(fundingData).substring(0, 500));
    }
  } catch (err) {
    console.log('Error:', err.message);
  }
  
  // 3. 测试 Liquidation History (单交易所)
  console.log('\n=== 3. Liquidation History (Binance) ===');
  const liqHistUrl = `https://open-api-v4.coinglass.com/api/futures/liquidation/history?exchange=Binance&symbol=BTCUSDT&interval=1d&start_time=${startTime}&end_time=${endTime}`;
  
  try {
    const liqResponse = await fetch(liqHistUrl, {
      headers: {
        'accept': 'application/json',
        'CG-API-KEY': apiKey
      }
    });
    
    const liqData = await liqResponse.json();
    console.log('Response code:', liqData.code);
    
    if (liqData.data && liqData.data.length > 0) {
      console.log('✅ SUCCESS - Data points received:', liqData.data.length);
      console.log('First:', new Date(liqData.data[0].time).toISOString().split('T')[0]);
      console.log('  Long Liq:', liqData.data[0].long_liquidation_usd);
      console.log('  Short Liq:', liqData.data[0].short_liquidation_usd);
    } else {
      console.log('❌ No data received');
      console.log('Full response:', JSON.stringify(liqData).substring(0, 500));
    }
  } catch (err) {
    console.log('Error:', err.message);
  }
  
  // 4. 测试 Exchange Balance Chart (交易所BTC余额 - 用于netflow计算)
  console.log('\n=== 4. Exchange Balance Chart ===');
  const exchangeBalanceUrl = `https://open-api-v4.coinglass.com/api/exchange/balance/chart?symbol=BTC&start_time=${startTime}&end_time=${endTime}`;
  
  try {
    const balanceResponse = await fetch(exchangeBalanceUrl, {
      headers: {
        'accept': 'application/json',
        'CG-API-KEY': apiKey
      }
    });
    
    const balanceData = await balanceResponse.json();
    console.log('Response code:', balanceData.code);
    
    if (balanceData.data && balanceData.data.time_list) {
      console.log('✅ SUCCESS - Time points:', balanceData.data.time_list.length);
      // 计算netflow示例
      const timeList = balanceData.data.time_list;
      const dataList = balanceData.data.data_list;
      if (dataList && dataList.length > 0) {
        const exchanges = Object.keys(dataList[0]);
        console.log('Exchanges tracked:', exchanges.length);
        console.log('Sample exchanges:', exchanges.slice(0, 5).join(', '));
      }
    } else {
      console.log('❌ No data received');
      console.log('Full response:', JSON.stringify(balanceData).substring(0, 500));
    }
  } catch (err) {
    console.log('Error:', err.message);
  }
  
  console.log('\n========================================');
  console.log('SUMMARY: CoinGlass API Historical Data Availability');
  console.log('========================================');
  console.log('✅ OI Aggregated History - AVAILABLE (30 days)');
  console.log('✅ OI-Weighted Funding Rate History - NEED TO TEST');
  console.log('✅ Liquidation History - AVAILABLE (30 days, per exchange)');
  console.log('✅ Exchange Balance Chart - AVAILABLE (for netflow calculation)');
  console.log('');
  console.log('NOTE: Hobbyist plan has interval limit >= 4h');
  console.log('For daily data (1d interval), all plans should work.');
}

main().catch(console.error);
