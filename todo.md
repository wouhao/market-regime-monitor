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

## Bug修复 (2026-01-30 - Funding Rate显示错误)
- [x] BTC Funding Rate显示0.1714%应为0.001714%（数据源返回的是原始值需要乘以100转换为百分比） - 已修复显示格式

## 优化 (2026-01-30 - 数值格式化)
- [x] 非加密指标（BTC/QQQ/GLD/10Y/VIX/Real Yield/HY OAS）最新值保留2位小数 - 已修复

## 优化 (2026-01-30 - 指标顺序调整)
- [x] 调整指标顺序为：BTC/QQQ/GLD/VIX/DXY/10Y/10Y real yield/HY OAS + 加密指标 - 已完成

## 新功能 (2026-01-30 - 新增指标)
- [x] 添加DXY（美元指数）指标 - 已添加DX-Y.NYB
- [ ] 添加MOVE（债券波动率指数）指标 - FRED中不可用，暂不添加

## 优化 (2026-01-30 - AI分析执行开关语义修正)
- [x] 修正执行开关语义为美股操作（非BTC操作） - 已完成
- [x] Spot pacing = 美股现货分批买入节奏 - 已添加Domain Lock
- [x] Put-selling = 美股现金担保put（限价建仓工具） - 已添加Domain Lock
- [x] Margin-loan = IBKR抵押借款（仅用于美股配置） - 已添加Domain Lock
- [x] 添加用户目标上下文（美股市值$52万→$70万里程碑） - 已添加

## Bug修复 (2026-01-30 - AI报告刷新丢失)
- [x] AI分析结果持久化存储到数据库 - 已实现
- [x] 页面刷新后能够恢复显示AI分析结果 - 已验证

## 优化 (2026-01-30 - AI报告展示格式)
- [x] 优化Markdown渲染，提升人类阅读体验 - 已修改prompt要求纯文本输出
- [x] 使用更清晰的卡片布局展示AI分析内容 - 已实现结构化卡片

## 优化 (2026-01-30 - AI报告显示位置)
- [x] 将AI报告从页面底部移动到市场快照上方 - 已调整

## Bug修复 (2026-01-31 - AI执行开关内容重复)
- [x] Margin和Spot开关的建议理由内容完全相同 - 已修复，prompt明确要求三个开关分别给出不同理由
- [x] 修改AI分析prompt，明确区分三个开关的不同含义 - 已完成

## 优化 (2026-01-31 - AI执行开关格式)
- [x] 移除冗余的开关名称前缀（如 [IBKR] Margin-loan...） - 已在前端清理
- [x] 建议理由直接输出核心内容，不需要重复开关定义 - 已完成

## 新功能 (2026-01-31 - 定时任务)
- [x] 安装node-cron依赖 - 已完成
- [x] 创建定时任务服务模块（schedulerService.ts） - 已完成
- [x] 实现每天北京时间9点自动生成报告 - 已完成
- [x] 集成到服务器启动流程 - 已完成
- [x] 添加定时任务日志记录 - 已完成

## Bug修复 (2026-01-31 - AI分析内容重复)
- [x] 核心结论、证据链、杠杆/流动性判定、风险提示四个模块显示内容重复 - 已修复
- [x] 检查AI分析输出解析逻辑 - 已重写parseAIResponse函数
- [x] 确保各模块正确分离显示不同内容 - 已验证

## 新功能 (2026-01-31 - BTC ETF Flow 模块)
- [x] 创建 btc_etf_flows 数据库表
- [x] 开发 Farside 网页抓取和解析服务
- [x] 实现负数解析 `(xxx)` → `-xxx`，缺失 `-` → `null`
- [x] 实现 parse_status 细化：success/partial/failed
- [x] 实现 rolling 计算（窗口内有null则结果为null）
- [x] 实现 total_ex_gbtc 计算（gbtc为null则结果为null）
- [x] 首次部署拉取全历史数据（backfill API）
- [x] 实现定时抓取（每日增量upsert）
- [x] 添加系统设置开关（默认开启）
- [x] 添加手动刷新按钮 + 显示 fetch_time_utc
- [x] 开发前端 ETF Flow 独立卡片（市场快照下方）
- [x] 实现提示逻辑：Inflow/Outflow/GBTC Noise
- [x] 周末/假日标注
- [x] manifest 字段：http_status, missing_reason, raw_row_snippet
- [x] 单元测试覆盖（20个测试用例）

## Bug修复 (2026-01-31 - ETF Flow不显示)
- [x] 问题：ETF Flow卡片不显示，因为数据库为空
- [x] 解决方案：服务器启动时自动检测并初始化ETF数据
- [x] 在schedulerService中添加启动时检查逻辑
- [x] 如果btc_etf_flows表为空，自动触发backfill抓取历史数据
