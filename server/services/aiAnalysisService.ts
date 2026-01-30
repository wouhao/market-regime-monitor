/**
 * AI 分析服务 - 生成市场解读报告
 * 
 * 基于用户文档《AI解读功能说明》实现：
 * - 可解释的情景识别器：Risk-on / Base / Risk-off (watch/confirmed)
 * - 组合语义分析（不是逐条复述数字）
 * - 执行开关映射
 * 
 * 重要：执行开关针对美股配置工作流，不是BTC操作！
 * - Spot pacing = 美股现货分批买入节奏
 * - Put-selling = 美股现金担保put（限价建仓工具）
 * - Margin-loan = IBKR抵押借款（仅用于美股配置）
 */

import { invokeLLM } from "../_core/llm";
import { MarketIndicator, CryptoTrendData } from "./marketDataService";

export interface AIAnalysisInput {
  snapshots: MarketIndicator[];
  cryptoTrends: CryptoTrendData | null;
  currentRegime: string;
  currentStatus: string;
  previousRegime: string | null;
  triggeredRules: string[];
  untriggeredRules: string[];
  switches: {
    marginBorrow: string;
    putSelling: string;
    spotPace: string;
  };
}

export interface AIAnalysisResult {
  summary: string;           // 一句话结论
  evidenceChain: string[];   // 证据链（3-5个关键组合信号）
  leverageJudgment: string;  // 杠杆/流动性判定
  switchRationale: {         // 执行开关理由
    marginBorrow: string;
    putSelling: string;
    spotPace: string;
  };
  riskAlerts: string[];      // 风险提示
  fullAnalysis: string;      // 完整分析文本
}

/**
 * 构建AI分析的系统提示词
 * 包含Domain Lock：执行开关仅针对美股配置
 */
function buildSystemPrompt(): string {
  return `你是一个专业的市场情景分析师，负责解读市场数据并生成可执行的投资建议。

## 你的角色
你不是预测者，而是一个**可解释的情景识别器**。你的任务是：
1. 判断市场处于 Risk-on / Base / Risk-off 的哪种状态
2. 产出与策略一致的执行开关建议

## ⚠️ 关键约束：执行开关的Domain Lock

### 执行开关的作用域（必须遵守）
- **[US Equities] Spot pacing**：指"美股现货分批买入节奏"，在IBKR上执行，目标是推进**美股市值**向$700k里程碑
- **[US Equities] Put-selling**：指"美股现金担保put（限价建仓工具）"，标的限定为美股（如GOOG/META/MSFT/AAPL等），**不是**BTC/加密期权
- **[IBKR] Margin-loan**：指"IBKR抵押借款（以转入IBKR的美债/资产为抵押）"，借款用途**仅用于美股配置**，不是用于加密杠杆或币圈衍生品

> **禁止**：把put/spot/margin-loan解释为BTC现货、BTC期权、或加密杠杆交易。

### Market Regime的作用域
- Risk-on/Base/Risk-off的判定基于BTC/QQQ/GLD/VIX/HY OAS/real yield等指标，用途是判断"风险偏好环境"，**不是**针对BTC的交易信号
- BTC相关指标只用于判断风险偏好环境，不是交易对象

### 用户目标上下文
- 用户目标：将**美股市值**从当前约$52万推进到$70万里程碑
- put：仅用于美股建仓降成本，不作为现金流目标
- call：不作为现金流来源（保留非线性上行）
- 借款：IBKR抵押借款仅用于美股配置

## 指标分层理解

### 风险偏好三核心（BTC / QQQ / GLD）
- QQQ：风险资产（成长/科技）代表
- GLD：避险资产代表（风险厌恶上升时常走强）
- BTC：高beta风险资产 + 自身杠杆结构（用于判断风险偏好，不是交易对象）

### 压力/折现/融资环境（VIX / 信用利差 / 实际利率）
- VIX：股市"保险价格"（恐慌溢价）
- HY OAS：信用风险温度计
- 10Y实际利率：久期资产的折现率核心变量

### 加密杠杆与流动性（Funding / OI / Liquidations / Stablecoin）
- 这些指标用于判断市场风险偏好环境，不是加密交易信号
- Funding：永续杠杆情绪（多空谁在付费）
- OI：当前仍在场内的杠杆规模
- Liquidations：清算强度（踩踏是否发生）
- Stablecoin supply：加密领域的"边际美元供给"

## 组合模板

### 三核心组合
- Risk-on典型：QQQ↑，GLD→/↓，BTC→/↑
- Risk-off典型：QQQ↓，GLD↑，BTC↓
- Base典型：QQQ与GLD同强/同弱，BTC单独走弱/走强

### 系统压力确认
- 系统性Risk-off：VIX上冲 + HY OAS走阔 + Real yield上行
- 价格下跌但压力未确认：QQQ/BTC弱，但VIX不高、信用不走坏

### 加密去杠杆/踩踏组合（用于环境判断，非交易信号）
- 杠杆堆积：OI↑ + funding同向走高 + 清算低
- 去杠杆/出清：价格↓ + OI↓ + 清算显著↑
- 健康反弹：价格↑ + OI→/↓ + 清算回落

## 执行开关定义（针对美股配置）

| 开关 | 作用域 | 选项 | 说明 |
|------|--------|------|------|
| Margin-loan | IBKR抵押借款 | Allowed / Pause | 仅用于美股配置 |
| Put-selling | 美股限价建仓工具 | Helper / Main | 美股put（GOOG/META/MSFT等） |
| Spot pacing | 美股现货买入节奏 | Fast / Medium / Slow | 向$700k里程碑推进 |

## 输出格式要求

### 执行开关必须以如下格式出现：
- **[US Equities] Spot pacing**: Fast/Medium/Slow - 理由
- **[US Equities] Put-selling (cash-secured, limit-entry tool)**: Helper/Main - 理由
- **[IBKR] Margin-loan (collateralized, for US equities only)**: Allowed/Pause - 理由

### 在理由中必须至少出现一次：
- "用于美股配置/向$700k里程碑推进"
- "put仅作为美股限价建仓工具"

### 解释链必须区分：市场信号 vs 执行对象
必须包含一句话：
> "市场信号来自BTC/宏观/信用，用于判定风险偏好；执行对象是美股（GOOG/META/MSFT等）的买入节奏与建仓工具。"

## 其他输出要求
1. 任何解释句必须引用到具体指标/变化
2. 数据缺失时必须标记missing，降低结论置信度
3. 不可用missing的字段做强推断
4. 必须明确写：本次是watch还是confirmed

## 自检规则
如果你的输出中出现以下任一关键词组合，则判定为"domain漏锁"，必须重写：
- "BTC现货/加密现货" + "Spot pacing"
- "BTC put/加密期权" + "Put-selling"
- "加密杠杆/合约" + "Margin-loan"`;
}

/**
 * 构建用户消息（包含市场数据）
 */
function buildUserMessage(input: AIAnalysisInput): string {
  const { snapshots, cryptoTrends, currentRegime, currentStatus, previousRegime, triggeredRules, switches } = input;
  
  // 提取关键指标数据
  const getSnapshot = (indicator: string) => snapshots.find(s => s.indicator === indicator);
  
  const btc = getSnapshot("BTC-USD");
  const qqq = getSnapshot("QQQ");
  const gld = getSnapshot("GLD");
  const vix = getSnapshot("VIXCLS");
  const dxy = getSnapshot("DX-Y.NYB");
  const hyOas = getSnapshot("BAMLH0A0HYM2");
  const realYield = getSnapshot("DFII10");
  const treasury = getSnapshot("DGS10");
  const funding = getSnapshot("crypto_funding");
  const oi = getSnapshot("crypto_oi");
  const liq = getSnapshot("crypto_liquidations");
  const stable = getSnapshot("stablecoin");
  
  const formatValue = (s: MarketIndicator | undefined, decimals: number = 2): string => {
    if (!s || s.latestValue === null) return "missing";
    return s.latestValue.toFixed(decimals);
  };
  
  const formatChange = (val: number | null | undefined): string => {
    if (val === null || val === undefined) return "missing";
    return `${val >= 0 ? "+" : ""}${val.toFixed(2)}%`;
  };
  
  let message = `## 当前市场数据快照

### 风险偏好三核心（用于判断环境，BTC不是交易对象）
| 指标 | 最新值 | 1D变化 | 7D变化 | 30D变化 |
|------|--------|--------|--------|---------|
| BTC | $${formatValue(btc)} | ${formatChange(btc?.change1d)} | ${formatChange(btc?.change7d)} | ${formatChange(btc?.change30d)} |
| QQQ | $${formatValue(qqq)} | ${formatChange(qqq?.change1d)} | ${formatChange(qqq?.change7d)} | ${formatChange(qqq?.change30d)} |
| GLD | $${formatValue(gld)} | ${formatChange(gld?.change1d)} | ${formatChange(gld?.change7d)} | ${formatChange(gld?.change30d)} |

### 系统压力指标
| 指标 | 最新值 | 1D变化 | 7D变化 | 30D变化 |
|------|--------|--------|--------|---------|
| VIX | ${formatValue(vix)} | ${formatChange(vix?.change1d)} | ${formatChange(vix?.change7d)} | ${formatChange(vix?.change30d)} |
| DXY | ${formatValue(dxy)} | ${formatChange(dxy?.change1d)} | ${formatChange(dxy?.change7d)} | ${formatChange(dxy?.change30d)} |
| HY OAS | ${formatValue(hyOas)} | ${formatChange(hyOas?.change1d)} | ${formatChange(hyOas?.change7d)} | ${formatChange(hyOas?.change30d)} |
| 10Y实际利率 | ${formatValue(realYield)} | ${formatChange(realYield?.change1d)} | ${formatChange(realYield?.change7d)} | ${formatChange(realYield?.change30d)} |
| 10Y国债 | ${formatValue(treasury)} | ${formatChange(treasury?.change1d)} | ${formatChange(treasury?.change7d)} | ${formatChange(treasury?.change30d)} |

### 加密杠杆与流动性（用于判断风险偏好环境，非交易信号）
| 指标 | 最新值 | 1D变化 | 7D变化 | 30D变化 |
|------|--------|--------|--------|---------|
| Funding Rate | ${funding?.latestValue !== null && funding?.latestValue !== undefined ? `${funding.latestValue.toFixed(6)}%` : "missing"} | ${cryptoTrends?.funding1d !== null && cryptoTrends?.funding1d !== undefined ? `${cryptoTrends.funding1d >= 0 ? "+" : ""}${cryptoTrends.funding1d.toFixed(6)}` : "missing"} | ${cryptoTrends?.funding7d !== null && cryptoTrends?.funding7d !== undefined ? `${cryptoTrends.funding7d >= 0 ? "+" : ""}${cryptoTrends.funding7d.toFixed(6)}` : "missing"} | ${cryptoTrends?.funding30d !== null && cryptoTrends?.funding30d !== undefined ? `${cryptoTrends.funding30d >= 0 ? "+" : ""}${cryptoTrends.funding30d.toFixed(6)}` : "missing"} |
| Open Interest | ${oi?.latestValue !== null && oi?.latestValue !== undefined ? `$${(oi.latestValue / 1e9).toFixed(2)}B` : "missing"} | ${cryptoTrends?.oi1d !== null && cryptoTrends?.oi1d !== undefined ? formatChange(cryptoTrends.oi1d) : "missing"} | ${cryptoTrends?.oi7d !== null && cryptoTrends?.oi7d !== undefined ? formatChange(cryptoTrends.oi7d) : "missing"} | ${cryptoTrends?.oi30d !== null && cryptoTrends?.oi30d !== undefined ? formatChange(cryptoTrends.oi30d) : "missing"} |
| Liquidations 24h | ${liq?.latestValue !== null && liq?.latestValue !== undefined ? `$${(liq.latestValue / 1e6).toFixed(2)}M` : "missing"} | ${cryptoTrends?.liq1d !== null && cryptoTrends?.liq1d !== undefined ? formatChange(cryptoTrends.liq1d) : "missing"} | ${cryptoTrends?.liq7d !== null && cryptoTrends?.liq7d !== undefined ? formatChange(cryptoTrends.liq7d) : "missing"} | ${cryptoTrends?.liq30d !== null && cryptoTrends?.liq30d !== undefined ? formatChange(cryptoTrends.liq30d) : "missing"} |
| Stablecoin Supply | ${stable?.latestValue !== null && stable?.latestValue !== undefined ? `$${(stable.latestValue / 1e9).toFixed(2)}B` : "missing"} | ${cryptoTrends?.stable1d !== null && cryptoTrends?.stable1d !== undefined ? formatChange(cryptoTrends.stable1d) : "missing"} | ${cryptoTrends?.stable7d !== null && cryptoTrends?.stable7d !== undefined ? formatChange(cryptoTrends.stable7d) : "missing"} | ${cryptoTrends?.stable30d !== null && cryptoTrends?.stable30d !== undefined ? formatChange(cryptoTrends.stable30d) : "missing"} |

## 当前情景判定
- **当前情景**: ${currentRegime.toUpperCase()} (${currentStatus})
- **上次情景**: ${previousRegime ? previousRegime.toUpperCase() : "无"}
- **触发规则**: ${triggeredRules.length > 0 ? triggeredRules.join(", ") : "无"}

## 当前执行开关（针对美股配置）
- [IBKR] Margin-loan: ${switches.marginBorrow}
- [US Equities] Put-selling: ${switches.putSelling}
- [US Equities] Spot pacing: ${switches.spotPace}

---

请基于以上数据，生成AI解读报告。要求：

1. **一句话结论**：当前情景 + watch/confirmed + 核心理由（最多2句）

2. **证据链**：列出3-5个关键组合信号，例如：
   - "QQQ 7D上行+2.5%而GLD 7D强势+5.3% → Base信号"
   - "BTC 7D=-6%且OI↓/清算↑ → 风险偏好环境偏弱"

3. **杠杆/流动性判定**：一句话判断"堆积/出清/中性"（用于判断环境，非交易信号）

4. **执行开关建议**（针对美股配置）：
   - **[IBKR] Margin-loan**: Allowed/Pause + 理由（仅用于美股配置）
   - **[US Equities] Put-selling**: Helper/Main + 理由（美股限价建仓工具）
   - **[US Equities] Spot pacing**: Fast/Medium/Slow + 理由（向$700k里程碑推进）

5. **风险提示**：若触发阈值（VIX>20、HY OAS +25bp、real yield +15bp、BTC 7D<-5%），要点名

6. **必须包含**：
   > "市场信号来自BTC/宏观/信用，用于判定风险偏好；执行对象是美股（GOOG/META/MSFT等）的买入节奏与建仓工具。"

请用中文输出，保持专业简洁。`;

  return message;
}

/**
 * 解析AI响应
 */
function parseAIResponse(content: string): AIAnalysisResult {
  // 提取各部分内容
  const sections = content.split(/(?=##?\s)/);
  
  let summary = "";
  let evidenceChain: string[] = [];
  let leverageJudgment = "";
  let switchRationale = {
    marginBorrow: "",
    putSelling: "",
    spotPace: "",
  };
  let riskAlerts: string[] = [];
  
  for (const section of sections) {
    const lowerSection = section.toLowerCase();
    
    if (lowerSection.includes("一句话结论") || lowerSection.includes("结论")) {
      // 提取结论部分
      const lines = section.split("\n").filter(l => l.trim() && !l.startsWith("#"));
      summary = lines.join(" ").trim();
    }
    
    if (lowerSection.includes("证据链") || lowerSection.includes("证据")) {
      // 提取证据链
      const lines = section.split("\n").filter(l => l.trim().startsWith("-") || l.trim().startsWith("•"));
      evidenceChain = lines.map(l => l.replace(/^[-•]\s*/, "").trim());
    }
    
    if (lowerSection.includes("杠杆") || lowerSection.includes("流动性判定")) {
      const lines = section.split("\n").filter(l => l.trim() && !l.startsWith("#"));
      leverageJudgment = lines.join(" ").trim();
    }
    
    if (lowerSection.includes("执行开关") || lowerSection.includes("开关建议")) {
      const lines = section.split("\n").filter(l => l.trim());
      for (const line of lines) {
        const lowerLine = line.toLowerCase();
        if (lowerLine.includes("margin") || lowerLine.includes("loan") || lowerLine.includes("借款") || lowerLine.includes("ibkr")) {
          switchRationale.marginBorrow = line.replace(/^[-•]\s*/, "").trim();
        }
        if (lowerLine.includes("put") || lowerLine.includes("卖put") || lowerLine.includes("建仓工具")) {
          switchRationale.putSelling = line.replace(/^[-•]\s*/, "").trim();
        }
        if (lowerLine.includes("spot") || lowerLine.includes("pacing") || lowerLine.includes("现货") || lowerLine.includes("里程碑")) {
          switchRationale.spotPace = line.replace(/^[-•]\s*/, "").trim();
        }
      }
    }
    
    if (lowerSection.includes("风险提示") || lowerSection.includes("风险")) {
      const lines = section.split("\n").filter(l => l.trim().startsWith("-") || l.trim().startsWith("•") || l.trim().startsWith("⚠"));
      riskAlerts = lines.map(l => l.replace(/^[-•⚠]\s*/, "").trim());
    }
  }
  
  return {
    summary: summary || "分析生成中...",
    evidenceChain: evidenceChain.length > 0 ? evidenceChain : ["数据分析中..."],
    leverageJudgment: leverageJudgment || "中性",
    switchRationale,
    riskAlerts,
    fullAnalysis: content,
  };
}

/**
 * 生成AI市场分析
 */
export async function generateAIAnalysis(input: AIAnalysisInput): Promise<AIAnalysisResult> {
  console.log("[AIAnalysis] Starting AI analysis generation...");
  
  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: buildUserMessage(input) },
      ],
    });
    
    const content = response.choices[0]?.message?.content;
    if (!content || typeof content !== "string") {
      throw new Error("AI response is empty or invalid");
    }
    
    console.log("[AIAnalysis] AI analysis generated successfully");
    return parseAIResponse(content);
    
  } catch (error) {
    console.error("[AIAnalysis] Failed to generate AI analysis:", error);
    
    // 返回降级结果
    return {
      summary: "AI分析暂时不可用，请稍后重试",
      evidenceChain: ["分析服务暂时不可用"],
      leverageJudgment: "无法判定",
      switchRationale: {
        marginBorrow: "请参考规则判定",
        putSelling: "请参考规则判定",
        spotPace: "请参考规则判定",
      },
      riskAlerts: ["AI分析服务暂时不可用"],
      fullAnalysis: `AI分析生成失败: ${error instanceof Error ? error.message : "未知错误"}`,
    };
  }
}
