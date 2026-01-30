# Market Regime Monitor - TODO

## 数据库模型
- [x] 市场报告表 (market_reports) - 存储每日报告
- [x] 市场快照表 (market_snapshots) - 存储指标数据
- [x] API配置表 (api_configs) - 存储API密钥配置

## 后端API
- [x] 数据抓取模块 (FRED, Yahoo Finance, CoinGlass, DefiLlama)
- [x] 数据处理模块 (变化率计算、MA穿越检测)
- [x] 情景判定引擎 (A-F规则、Risk-on/Risk-off/Base)
- [x] 执行开关生成器
- [x] 报告生成API (POST /api/generate)
- [x] 最新报告API (GET /api/latest)
- [x] 历史报告API (GET /api/history)
- [x] 系统状态API (GET /api/status)
- [x] API配置管理接口

## 前端界面
- [x] 仪表盘布局 (DashboardLayout)
- [x] 当前情景卡片 (Risk-on/Risk-off/Base + 置信度)
- [x] 执行开关面板 (保证金借款、卖Put策略、现货节奏)
- [x] 市场快照表格 (BTC、QQQ、GLD、VIX等指标)
- [x] 判定规则列表 (A-F规则触发状态)
- [x] 数据质量进度条
- [x] 手动生成报告按钮
- [x] 历史报告页面
- [x] 报告详情页面 (Markdown渲染)
- [x] API配置管理页面

## 定时任务
- [x] 定时任务配置界面

## 测试
- [x] 后端API单元测试
- [x] 前端功能验证

## Bug修复 (2026-01-30)
- [x] 数据质量显示不明确 - 需显示缺失的具体数据项及获取方式
- [x] 历史报告跳转Bug - 点击任何报告都跳转到同一个详情页

## 优化 (2026-01-30)
- [x] 布局优化 - 将市场快照移到执行开关上方

## Bug修复 (2026-01-30 - CoinGlass API)
- [x] CoinGlass API版本错误 - 从V2更新到V4
- [x] 请求头错误 - 从coinglassSecret改为CG-API-KEY
- [x] API地址错误 - 从open-api.coinglass.com改为open-api-v4.coinglass.com
- [x] API接口错误 - 从history接口改为exchange-list接口（爱好版可用）

## Bug修复 (2026-01-30 - 用户反馈)
- [x] Put策略逻辑错误 - Risk-on和Base应为辅助，只有Risk-off才是激进
- [x] 加密指标不一致 - 页面显示与定义的4个加密指标不一致

## 优化 (2026-01-30 - 数据源替换)
- [x] 替换CoinGlass为Binance免费API - Funding Rate
- [x] 替换CoinGlass为Binance免费API - Open Interest
- [x] 新增Binance清算数据 - Liquidations (REST API proxy)
- [x] 保持DefiLlama稳定币数据

## 优化 (2026-01-30 - Liquidations Proxy)
- [x] 实现BTC Liquidations压力proxy - 使用价格变化+OI变化+Funding组合计算
- [x] 界面显示"proxy"而非"missing"
- [x] 在Sources中标注proxy规则

## 修复 (2026-01-30 - OKX Liquidation Orders)
- [x] 测试OKX /api/v5/public/liquidation-orders接口
- [x] 实现REST拉取最近7天爆仓单
- [x] 按timestamp过滤最近24h记录
- [x] 计算24h long/short/total liquidation notional (USD)
- [x] 可选输出7D合计
- [x] Sources标注OKX REST liquidation-orders + 请求时间戳 + 参数口径

## 优化 (2026-01-30 - Funding Rate & Coinalyze)
- [x] BTC Funding Rate 显示优化 - 用百分比格式显示（如 0.01%）
- [x] 切换到 Coinalyze API - 获取多交易所聚合清算数据
- [x] 添加 Coinalyze API Key 配置支持
- [x] 更新前端数据源标注

## 优化 (2026-01-30 - 全市场清算数据聚合)
- [x] 使用Coinalyze /future-markets接口获取所有BTC永续合约
- [x] 聚合全市场清算数据（不仅限于Binance+OKX+Bybit）
- [x] 在日志中记录聚合的交易所列表

## Bug修复 (2026-01-30 - Liquidations数据为0)
- [x] 诊断Coinalyze API Key配置后数据仍为0的问题 - 原因：1) is_perpetual字段过滤错误 2) 时间戳单位错误（秒vs毫秒）
- [x] 修复Liquidations数据获取逻辑 - 现在正确获取$272.8M 24h清算数据

## 优化 (2026-01-30 - 显示格式)
- [x] BTC Funding Rate 保留6位小数显示

## 新功能 (2026-01-30 - 加密指标趋势化)
- [x] 创建crypto_metrics_daily历史快照表
- [x] 实现历史数据存储（每日upsert）
- [x] 实现趋势变化列计算（1D/7D/30D） - 后端已实现，前端等待历史数据积累
- [x] 实现sparkline趋势线生成 - 后端已实现generateSparkline函数
- [x] 严格区分missing和0（缺失显示--而非0） - 前端已修复

## 新功能 (2026-01-30 - AI分析)
- [x] 实现AI解读模块 (aiAnalysisService.ts)
- [x] 三核心组合分析（QQQ/GLD/BTC）
- [x] 系统压力确认组合分析（VIX/HY OAS/Real yield）
- [x] 加密去杠杆/踩踏组合分析（Funding/OI/Liquidations）
- [x] 边际流动性组合分析（Stablecoin supply）
- [x] 输出执行开关建议及理由
- [x] watch vs confirmed去噪机制
- [x] 前端AI解读按钮和卡片UI
