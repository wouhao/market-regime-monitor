/**
 * BTC Analysis - ETF Flow Tag and Stablecoin Change Tests
 */
import { describe, it, expect, vi } from "vitest";
import { analyzeBtcMarket, BtcAnalysisInput } from "./services/btcAnalysisService";

// 创建基础输入数据
function createBaseInput(overrides: Partial<BtcAnalysisInput> = {}): BtcAnalysisInput {
  return {
    btcPrice: 100000,
    btcPrice7dPct: 5,
    btcPrice30dPct: 10,
    fundingLatest: 0.0001,
    oiLatest: 60000000000, // $60B
    liq24h: 50000000, // $50M
    stablecoinLatest: 260000000000, // $260B
    stablecoin7dPct: 2.5,
    stablecoin30dPct: 5.0,
    oi7dAgo: 55000000000, // $55B
    funding7dHistory: [0.0001, 0.0001, 0.0001, 0.0001, 0.0001, 0.0001, 0.0001],
    liq7dHistory: [40000000, 45000000, 50000000, 55000000, 45000000, 40000000, 50000000],
    etfFlowToday: 100,
    etfFlowRolling5d: 50,
    etfFlowRolling20d: 30,
    etfFlowAsOfDate: "2026-01-31",
    etfFlowFetchTimeUtc: "2026-01-31T12:00:00Z",
    previousBtcState: null,
    asOfDate: "2026-02-01",
    ...overrides,
  };
}

describe("ETF Flow Tag Determination", () => {
  it("should return Supportive when 5D > 0 and 20D >= 0", () => {
    const input = createBaseInput({
      etfFlowToday: 100,
      etfFlowRolling5d: 50,
      etfFlowRolling20d: 30,
    });
    
    const result = analyzeBtcMarket(input);
    
    expect(result.evidence.etfFlow.tag).toBe("Supportive");
    expect(result.evidence.etfFlow.tagReason).toContain("supportive");
  });

  it("should return Drag when 5D < 0 and 5D < 20D", () => {
    const input = createBaseInput({
      etfFlowToday: -200,
      etfFlowRolling5d: -50,
      etfFlowRolling20d: 30,
    });
    
    const result = analyzeBtcMarket(input);
    
    expect(result.evidence.etfFlow.tag).toBe("Drag");
    expect(result.evidence.etfFlow.tagReason).toContain("weak");
  });

  it("should return Drag when today has large outflow (< -200)", () => {
    const input = createBaseInput({
      etfFlowToday: -300,
      etfFlowRolling5d: -10,
      etfFlowRolling20d: -5,
    });
    
    const result = analyzeBtcMarket(input);
    
    expect(result.evidence.etfFlow.tag).toBe("Drag");
  });

  it("should return Neutral when 5D < 0 but 5D >= 20D", () => {
    const input = createBaseInput({
      etfFlowToday: 50,
      etfFlowRolling5d: -10,
      etfFlowRolling20d: -20,
    });
    
    const result = analyzeBtcMarket(input);
    
    expect(result.evidence.etfFlow.tag).toBe("Neutral");
  });

  it("should return Neutral when data is insufficient", () => {
    const input = createBaseInput({
      etfFlowToday: null,
      etfFlowRolling5d: null,
      etfFlowRolling20d: null,
    });
    
    const result = analyzeBtcMarket(input);
    
    expect(result.evidence.etfFlow.tag).toBe("Neutral");
    expect(result.evidence.etfFlow.tagReason).toContain("Insufficient");
  });
});

describe("Stablecoin 7D/30D Change Calculation", () => {
  it("should set Liquidity to Expanding when both 7D and 30D are positive", () => {
    const input = createBaseInput({
      stablecoin7dPct: 2.5,
      stablecoin30dPct: 5.0,
    });
    
    const result = analyzeBtcMarket(input);
    
    expect(result.liquidityTag).toBe("Expanding");
  });

  it("should set Liquidity to Contracting when 7D is negative", () => {
    const input = createBaseInput({
      stablecoin7dPct: -1.5,
      stablecoin30dPct: 2.0,
    });
    
    const result = analyzeBtcMarket(input);
    
    expect(result.liquidityTag).toBe("Contracting");
  });

  it("should set Liquidity to Contracting when 30D is negative", () => {
    const input = createBaseInput({
      stablecoin7dPct: 1.0,
      stablecoin30dPct: -0.5,
    });
    
    const result = analyzeBtcMarket(input);
    
    expect(result.liquidityTag).toBe("Contracting");
  });

  it("should set Liquidity to Unknown when data is missing", () => {
    const input = createBaseInput({
      stablecoin7dPct: null,
      stablecoin30dPct: null,
    });
    
    const result = analyzeBtcMarket(input);
    
    expect(result.liquidityTag).toBe("Unknown");
  });

  it("should include stablecoin_7d in missingFields when null", () => {
    const input = createBaseInput({
      stablecoin7dPct: null,
      stablecoin30dPct: 5.0,
    });
    
    const result = analyzeBtcMarket(input);
    
    expect(result.evidence.missingFields).toContain("stablecoin_7d");
  });

  it("should include stablecoin_30d in missingFields when null", () => {
    const input = createBaseInput({
      stablecoin7dPct: 2.5,
      stablecoin30dPct: null,
    });
    
    const result = analyzeBtcMarket(input);
    
    expect(result.evidence.missingFields).toContain("stablecoin_30d");
  });
});

describe("ETF Flow Evidence Structure", () => {
  it("should include all ETF Flow fields in evidence", () => {
    const input = createBaseInput({
      etfFlowToday: 150.5,
      etfFlowRolling5d: 75.2,
      etfFlowRolling20d: 45.8,
      etfFlowAsOfDate: "2026-01-31",
      etfFlowFetchTimeUtc: "2026-01-31T15:30:00Z",
    });
    
    const result = analyzeBtcMarket(input);
    
    expect(result.evidence.etfFlow).toBeDefined();
    expect(result.evidence.etfFlow.today).toBe(150.5);
    expect(result.evidence.etfFlow.rolling5d).toBe(75.2);
    expect(result.evidence.etfFlow.rolling20d).toBe(45.8);
    expect(result.evidence.etfFlow.asOfDate).toBe("2026-01-31");
    expect(result.evidence.etfFlow.fetchTimeUtc).toBe("2026-01-31T15:30:00Z");
    expect(result.evidence.etfFlow.tag).toBeDefined();
    expect(result.evidence.etfFlow.tagReason).toBeDefined();
  });

  it("should not include exchangeNetflow in evidence", () => {
    const input = createBaseInput();
    const result = analyzeBtcMarket(input);
    
    // @ts-expect-error - exchangeNetflow should not exist
    expect(result.evidence.exchangeNetflow).toBeUndefined();
  });
});

describe("BTC State with ETF Flow Context", () => {
  it("should still determine S1 state correctly with ETF Flow data", () => {
    const input = createBaseInput({
      btcPrice7dPct: 8,
      oiLatest: 65000000000,
      oi7dAgo: 55000000000,
      fundingLatest: 0.0003,
      etfFlowRolling5d: 100,
      etfFlowRolling20d: 50,
    });
    
    const result = analyzeBtcMarket(input);
    
    // S1 conditions: OI up, funding positive, price up
    expect(result.state).toBe("S1");
    expect(result.evidence.etfFlow.tag).toBe("Supportive");
  });

  it("should still determine S2 state correctly with ETF Flow data", () => {
    const input = createBaseInput({
      btcPrice7dPct: -8,
      oiLatest: 50000000000,
      oi7dAgo: 60000000000,
      liq24h: 200000000,
      liq7dHistory: [50000000, 50000000, 50000000, 50000000, 50000000, 50000000, 50000000],
      etfFlowRolling5d: -100,
      etfFlowRolling20d: 20,
    });
    
    const result = analyzeBtcMarket(input);
    
    // S2 conditions: price down, OI down, liq up
    expect(result.state).toBe("S2");
    expect(result.evidence.etfFlow.tag).toBe("Drag");
  });
});
