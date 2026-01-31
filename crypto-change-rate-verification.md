# 加密指标变化率功能验证结果

## 验证时间
2026-02-01 (北京时间 2026-01-31 17:49)

## 功能实现
在市场快照表格中显示加密货币指标的 1D/7D/30D 变化率

## 验证结果 ✅ 成功

| 指标 | 最新值 | 1D | 7D | 30D |
|------|--------|-----|-----|------|
| BTC Funding Rate | 0.006585% | +95.87% | +11.67% | +324.74% |
| BTC Open Interest | $55.09B | -2.01% | -5.52% | -2.84% |
| BTC Liquidations (24h) | $27.75M | -67.28% | -52.12% | -46.93% |
| Stablecoin Supply | $304.42B | +19.22% | +17.44% | +16.14% |

## 实现方式
1. 从 `crypto_metrics_daily` 表获取历史数据（31天）
2. 通过全局变量 `__cryptoHistory` 传递给 `fetchAllMarketData` 函数
3. 在构建 MarketIndicator 时，从历史数据计算 1D/7D/30D 变化率

## 数据来源
- 历史数据：crypto_metrics_daily 表（每日快照）
- 当前值：实时 API（Binance/CoinGlass/Coinalyze/DefiLlama）

## 注意事项
- MA20 列仍显示 `--`，因为加密指标没有足够的历史价格数据计算移动平均线
- 变化率计算公式：`(current - past) / |past| * 100`
