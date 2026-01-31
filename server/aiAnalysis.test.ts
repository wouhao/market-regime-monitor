import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the LLM module
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{
      message: {
        content: `## 一句话结论
当前情景：Base (watch)。核心理由：三核心资产表现分歧，QQQ走强但BTC走弱。

## 证据链
- QQQ 7D +1.66% 而 BTC 7D -6.90% → 风险资产分化
- VIX 16.88 处于低位，系统压力未确认
- GLD 7D +5.45% 避险资产走强

## 杠杆/流动性判定
中性偏出清。OI数据缺失，但清算额$272.81M较高，表明短期去杠杆压力存在。

## 执行开关建议
- Margin-loan: Allowed - 系统性压力未确认
- Put-selling: Helper - 市场分化，辅助建仓
- Spot pacing: Medium - BTC修正中，放缓节奏

## 风险提示
- BTC 7D跌幅-6.90%超过-5%阈值
- 清算额较高需关注`
      }
    }]
  })
}));

// Import after mocking
import { generateAIAnalysis, AIAnalysisInput } from "./services/aiAnalysisService";

describe("AI Analysis Service", () => {
  const mockInput: AIAnalysisInput = {
    snapshots: [
      { indicator: "BTC-USD", displayName: "Bitcoin", latestValue: 83331.89, change1d: -1.45, change7d: -6.90, change30d: -4.77, ma20: 85000, aboveMa20: false, sparklineData: [] },
      { indicator: "QQQ", displayName: "Nasdaq-100 ETF", latestValue: 626.53, change1d: -0.46, change7d: 1.66, change30d: 2.42, ma20: 620, aboveMa20: true, sparklineData: [] },
      { indicator: "GLD", displayName: "SPDR Gold", latestValue: 467.79, change1d: -5.67, change7d: 5.45, change30d: 18.16, ma20: 450, aboveMa20: true, sparklineData: [] },
      { indicator: "VIXCLS", displayName: "VIX Index", latestValue: 16.88, change1d: 3.24, change7d: -15.98, change30d: 2.43, ma20: 18, aboveMa20: false, sparklineData: [] },
      { indicator: "crypto_funding", displayName: "BTC Funding Rate", latestValue: 0.001714, change1d: null, change7d: null, change30d: null, ma20: null, aboveMa20: null, sparklineData: [] },
      { indicator: "crypto_oi", displayName: "BTC Open Interest", latestValue: 8610000000, change1d: null, change7d: null, change30d: null, ma20: null, aboveMa20: null, sparklineData: [] },
      { indicator: "crypto_liquidations", displayName: "BTC Liquidations (24h)", latestValue: 272810000, change1d: null, change7d: null, change30d: null, ma20: null, aboveMa20: null, sparklineData: [] },
    ],
    cryptoTrends: null,
    currentRegime: "risk_on",
    currentStatus: "confirmed",
    previousRegime: "risk_on",
    triggeredRules: ["E: GLD ≤ +0.5% OR GLD ≤ 20D MA"],
    untriggeredRules: ["A: QQQ ≤ -2.0% AND GLD ≥ +1.0%"],
    switches: {
      marginBorrow: "allowed",
      putSelling: "helper",
      spotPace: "fast",
    },
  };

  it("should generate AI analysis with all required fields", async () => {
    const result = await generateAIAnalysis(mockInput);
    
    expect(result).toBeDefined();
    expect(result.summary).toBeDefined();
    expect(typeof result.summary).toBe("string");
    expect(result.summary.length).toBeGreaterThan(0);
  });

  it("should return evidence chain as array", async () => {
    const result = await generateAIAnalysis(mockInput);
    
    expect(Array.isArray(result.evidenceChain)).toBe(true);
  });

  it("should return leverage judgment", async () => {
    const result = await generateAIAnalysis(mockInput);
    
    expect(result.leverageJudgment).toBeDefined();
    expect(typeof result.leverageJudgment).toBe("string");
  });

  it("should return switch rationale object", async () => {
    const result = await generateAIAnalysis(mockInput);
    
    expect(result.switchRationale).toBeDefined();
    expect(typeof result.switchRationale).toBe("object");
  });

  it("should return risk alerts as array", async () => {
    const result = await generateAIAnalysis(mockInput);
    
    expect(Array.isArray(result.riskAlerts)).toBe(true);
  });

  it("should return full analysis text", async () => {
    const result = await generateAIAnalysis(mockInput);
    
    expect(result.fullAnalysis).toBeDefined();
    expect(typeof result.fullAnalysis).toBe("string");
    expect(result.fullAnalysis.length).toBeGreaterThan(0);
  });
});

describe("Crypto Metrics Formatting", () => {
  it("should format funding rate with 6 decimal places", () => {
    const fundingRate = 0.001714;
    const formatted = fundingRate.toFixed(6);
    expect(formatted).toBe("0.001714");
  });

  it("should format liquidations in millions", () => {
    const liquidations = 272810000;
    const formatted = `$${(liquidations / 1e6).toFixed(2)}M`;
    expect(formatted).toBe("$272.81M");
  });

  it("should format open interest in billions", () => {
    const oi = 8610000000;
    const formatted = `$${(oi / 1e9).toFixed(2)}B`;
    expect(formatted).toBe("$8.61B");
  });
});
