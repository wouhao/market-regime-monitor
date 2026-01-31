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

## 新功能 (2026-01-31 - ETF Flow 30天趋势图表)
- [x] 扩展后端API返回30天历史数据 (getEtfFlowHistoryWithRolling)
- [x] 前端实现折线图组件（使用recharts）
- [x] 显示Total Net Flow趋势线 (蓝色实线)
- [x] 添加5D/20D Rolling均线 (绿色/黄色虚线)
- [x] 图表交互：悬停显示详细数据
- [x] 响应式设计适配移动端 (ResponsiveContainer)
- [x] 单元测试覆盖 (49个测试全部通过)

## 新功能 (2026-01-31 - ETF Flow纳入AI分析)
- [x] 分析现有AI分析服务结构
- [x] 在AI分析输入中添加ETF Flow数据 (EtfFlowDataForAI接口)
- [x] 更新AI提示词包含ETF Flow分析指导
- [x] 让AI解读结合机构资金流向给出判断
- [x] 在routers.ts和schedulerService.ts中添加ETF Flow数据获取
- [x] 测试验证AI分析功能 (52个测试全部通过)

## 回退 (2026-01-31 - 移除AI分析中的ETF Flow集成)
- [x] 从AIAnalysisInput接口中移除etfFlowData字段
- [x] 从buildUserMessage中移除ETF Flow数据展示
- [x] 从系统提示词中移除ETF Flow分析指导
- [x] 从routers.ts中移除ETF Flow数据获取
- [x] 从schedulerService.ts中移除ETF Flow数据获取
- [x] 更新测试文件移除etfFlowData
- [x] 测试验证回退后功能正常 (49个测试全部通过)

## 新功能 (2026-01-31 - BTC市场分析独立模块)
- [x] 数据库schema变更：market_reports表新增btc_state/btc_liquidity_tag/btc_confidence/btc_evidence_json字段
- [x] 实现历史快照查询：获取过去7天的OI/Funding/Liquidations数据
- [x] 实现数据计算逻辑：
  - [x] OI 7D pct/abs计算
  - [x] Liq 7D total/avg计算（任一天缺失→missing）
  - [x] Funding 7D avg计算（任一天缺失→missing）
- [x] 实现状态分类逻辑（S1-S4）：
  - [x] S1杠杆堆积：OI↑ + funding偏正/升 + 价格上行（满足2条）
  - [x] S2去杠杆/出清：价格7D<-5% + OI↓ + 清算上升（满足2条）
  - [x] S3低杠杆修复：价格回升 + OI不升/小升 + 清算回落 + funding不极端（满足2条）
  - [x] S4中性/混合：不满足以上或数据缺失多
- [x] 实现流动性标签：Expanding/Contracting/Unknown
- [x] 实现可信度判断：连续2次相同→confirmed，否则watch；关键字段缺失→强制watch
- [x] 集成到报告生成流程（routers.ts + schedulerService.ts）
- [x] 前端Dashboard新增BTC市场分析独立卡片
- [x] AI分析输出新增BTC市场分析独立段落（与执行开关隔离）
- [x] 工程约束：Fail-closed + 禁止填0 + 禁止交易建议 + 与执行开关隔离
- [x] 单元测试覆盖 (72个测试全部通过)

## 新功能 (2026-02-01 - CoinGlass历史数据回填)
- [x] 实现CoinGlass历史数据回填服务
  - [x] OI Aggregated History回填（30天）
  - [x] OI-Weighted Funding Rate回填（30天）
  - [x] Liquidation History回填（30天，多交易所聚合）
- [x] 添加回填API端点（cryptoBackfill.getStatus, cryptoBackfill.run）
- [x] 执行历史数据回填（28条插入，2条跳过）
- [x] 验证crypto_metrics_daily表数据完整性（30天全部有OI/Funding/Liq数据）
- [x] 测试BTC Analysis模块正常显示（OI 7D/Funding 7D avg/Liq 7D已显示）

## Bug修复 (2026-02-01 - 数据源问题)
- [x] OI数据源切换到CoinGlass全市场聚合
  - [x] 修改marketDataService.ts实时OI获取逻辑
  - [x] 修复1/30、1/31异常OI数据
- [x] Funding Rate回填逻辑修复
  - [x] 移除coinglassBackfillService.ts中的×100处理
  - [x] 重新回填历史Funding数据
- [x] 添加DefiLlama历史稳定币数据回填
  - [x] 实现DefiLlama历史数据获取
  - [x] 回填30天Stablecoin数据
  - [x] 补全stablecoin_7d和stablecoin_30d字段

## 功能更新 (2026-02-01 - Stablecoin计算 + ETF Flow替代Exchange netflow)
- [x] 实现 Stablecoin 7D/30D 变化计算
  - [x] 从历史数据计算7D变化率
  - [x] 从历史数据计算30D变化率
  - [x] 更新Liquidity标签逻辑 (Expanding/Contracting/Unknown)
- [x] 用 ETF Flow 替代 Exchange netflow
  - [x] 移除证据链中的Exchange netflow行
  - [x] 新增ETF Flow行 (today/5D/20D/as_of_date)
  - [x] 实现ETF Flow子标签 (Supportive/Drag/Neutral)
  - [x] 更新缺失字段提示（不再包含exchange netflow）
- [x] 前端UI更新
  - [x] 更新BTC市场分析卡片显示
  - [x] 添加ETF Flow子标签显示

## 功能更新 (2026-02-01 - 市场快照表格加密货币变化率)
- [x] 在市场快照表格中显示加密货币指标的变化率
  - [x] BTC Funding Rate: 1D/7D/30D 变化 (+95.87%/+11.67%/+324.74%)
  - [x] BTC Open Interest: 1D/7D/30D 变化率 (-2.01%/-5.52%/-2.84%)
  - [x] BTC Liquidations: 1D/7D/30D 变化 (-67.28%/-52.12%/-46.93%)
  - [x] Stablecoin Supply: 1D/7D/30D 变化率 (+19.22%/+17.44%/+16.14%)
