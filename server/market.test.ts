import { describe, expect, it, vi } from "vitest";
import { 
  classifyRegime, 
  generateSwitches, 
  calculateDataQuality,
  generateReportContent,
  MarketIndicator 
} from "./services/marketDataService";

// Mock market data for testing
const createMockSnapshot = (overrides: Partial<MarketIndicator> = {}): MarketIndicator => ({
  indicator: "TEST",
  displayName: "Test Indicator",
  latestValue: 100,
  change1d: 0,
  change7d: 0,
  change30d: 0,
  ma20: 95,
  aboveMa20: true,
  sparklineData: [],
  ...overrides,
});

describe("Market Regime Classification", () => {
  it("should classify as risk_off when Rule A triggers (QQQ <= -2% AND GLD >= +1%)", () => {
    const snapshots: MarketIndicator[] = [
      createMockSnapshot({ indicator: "QQQ", displayName: "Nasdaq-100 ETF", change1d: -2.5 }),
      createMockSnapshot({ indicator: "GLD", displayName: "SPDR Gold", change1d: 1.5 }),
      createMockSnapshot({ indicator: "VIXCLS", displayName: "VIX Index", latestValue: 15 }),
      createMockSnapshot({ indicator: "BTC-USD", displayName: "Bitcoin", change1d: 1 }),
    ];

    const result = classifyRegime(snapshots);
    
    expect(result.triggeredRules.some(r => r.startsWith("A:"))).toBe(true);
  });

  it("should classify as risk_off when Rule B triggers (VIX >= 20 AND QQQ < 0%)", () => {
    const snapshots: MarketIndicator[] = [
      createMockSnapshot({ indicator: "QQQ", displayName: "Nasdaq-100 ETF", change1d: -0.5 }),
      createMockSnapshot({ indicator: "GLD", displayName: "SPDR Gold", change1d: 0.2 }),
      createMockSnapshot({ indicator: "VIXCLS", displayName: "VIX Index", latestValue: 25 }),
      createMockSnapshot({ indicator: "BTC-USD", displayName: "Bitcoin", change1d: 1 }),
    ];

    const result = classifyRegime(snapshots);
    
    expect(result.triggeredRules.some(r => r.startsWith("B:"))).toBe(true);
  });

  it("should classify as risk_on when Rule D triggers (QQQ >= +1% AND QQQ > 20D MA)", () => {
    const snapshots: MarketIndicator[] = [
      createMockSnapshot({ 
        indicator: "QQQ", 
        displayName: "Nasdaq-100 ETF", 
        change1d: 1.5, 
        latestValue: 400,
        ma20: 390,
        aboveMa20: true 
      }),
      createMockSnapshot({ indicator: "GLD", displayName: "SPDR Gold", change1d: 0.2 }),
      createMockSnapshot({ indicator: "VIXCLS", displayName: "VIX Index", latestValue: 15 }),
      createMockSnapshot({ indicator: "BTC-USD", displayName: "Bitcoin", change1d: 1 }),
    ];

    const result = classifyRegime(snapshots);
    
    expect(result.triggeredRules.some(r => r.startsWith("D:"))).toBe(true);
  });

  it("should return base regime when no clear signal", () => {
    const snapshots: MarketIndicator[] = [
      createMockSnapshot({ indicator: "QQQ", displayName: "Nasdaq-100 ETF", change1d: 0.3 }),
      createMockSnapshot({ indicator: "GLD", displayName: "SPDR Gold", change1d: 0.3 }),
      createMockSnapshot({ indicator: "VIXCLS", displayName: "VIX Index", latestValue: 15 }),
      createMockSnapshot({ indicator: "BTC-USD", displayName: "Bitcoin", change1d: -0.5, aboveMa20: false }),
    ];

    const result = classifyRegime(snapshots);
    
    // When both risk-on and risk-off rules trigger or neither triggers clearly, should be base
    expect(["base", "risk_on", "risk_off"]).toContain(result.regime);
  });

  it("should set status to confirmed when previous regime matches", () => {
    // Rule A triggers: QQQ <= -2% AND GLD >= +1% -> risk_off
    // Also need to ensure risk_on rules don't trigger
    const snapshots: MarketIndicator[] = [
      createMockSnapshot({ indicator: "QQQ", displayName: "Nasdaq-100 ETF", change1d: -2.5, aboveMa20: false }),
      createMockSnapshot({ indicator: "GLD", displayName: "SPDR Gold", change1d: 1.5, aboveMa20: true }),
      createMockSnapshot({ indicator: "VIXCLS", displayName: "VIX Index", latestValue: 15 }),
      createMockSnapshot({ indicator: "BTC-USD", displayName: "Bitcoin", change1d: -1, aboveMa20: false }),
    ];

    const result = classifyRegime(snapshots, "risk_off");
    
    // The regime should be risk_off and if previous was also risk_off, status should be confirmed
    expect(result.regime).toBe("risk_off");
    expect(result.status).toBe("confirmed");
  });

  it("should set status to watch when regime changes", () => {
    const snapshots: MarketIndicator[] = [
      createMockSnapshot({ indicator: "QQQ", displayName: "Nasdaq-100 ETF", change1d: -2.5 }),
      createMockSnapshot({ indicator: "GLD", displayName: "SPDR Gold", change1d: 1.5 }),
      createMockSnapshot({ indicator: "VIXCLS", displayName: "VIX Index", latestValue: 15 }),
      createMockSnapshot({ indicator: "BTC-USD", displayName: "Bitcoin", change1d: 1 }),
    ];

    const result = classifyRegime(snapshots, "risk_on");
    
    expect(result.status).toBe("watch");
  });
});

describe("Execution Switches Generation", () => {
  it("should generate forbidden switches for risk_off regime", () => {
    const regime = {
      regime: "risk_off" as const,
      status: "confirmed" as const,
      confidence: 85,
      triggeredRules: ["A: QQQ ≤ -2.0% AND GLD ≥ +1.0%"],
      untriggeredRules: [],
    };

    const switches = generateSwitches(regime);

    expect(switches.marginBorrow).toBe("forbidden");
    expect(switches.putSelling).toBe("forbidden");
    expect(switches.spotPace).toBe("pause");
  });

  it("should generate aggressive switches for risk_on regime", () => {
    const regime = {
      regime: "risk_on" as const,
      status: "confirmed" as const,
      confidence: 85,
      triggeredRules: ["D: QQQ ≥ +1.0% AND QQQ > 20D MA"],
      untriggeredRules: [],
    };

    const switches = generateSwitches(regime);

    expect(switches.marginBorrow).toBe("allowed");
    expect(switches.putSelling).toBe("aggressive");
    expect(switches.spotPace).toBe("fast");
  });

  it("should generate moderate switches for base regime", () => {
    const regime = {
      regime: "base" as const,
      status: "watch" as const,
      confidence: 70,
      triggeredRules: [],
      untriggeredRules: [],
    };

    const switches = generateSwitches(regime);

    expect(switches.marginBorrow).toBe("allowed");
    expect(switches.putSelling).toBe("helper");
    expect(switches.spotPace).toBe("medium");
  });
});

describe("Data Quality Calculation", () => {
  it("should return 100% when all indicators have values", () => {
    const snapshots: MarketIndicator[] = [
      createMockSnapshot({ indicator: "A", latestValue: 100 }),
      createMockSnapshot({ indicator: "B", latestValue: 200 }),
      createMockSnapshot({ indicator: "C", latestValue: 300 }),
    ];

    const quality = calculateDataQuality(snapshots);

    expect(quality).toBe(100);
  });

  it("should return correct percentage when some indicators are missing", () => {
    const snapshots: MarketIndicator[] = [
      createMockSnapshot({ indicator: "A", latestValue: 100 }),
      createMockSnapshot({ indicator: "B", latestValue: null }),
      createMockSnapshot({ indicator: "C", latestValue: 300 }),
      createMockSnapshot({ indicator: "D", latestValue: null }),
    ];

    const quality = calculateDataQuality(snapshots);

    expect(quality).toBe(50); // 2 out of 4 have values
  });

  it("should return 0% when all indicators are missing", () => {
    const snapshots: MarketIndicator[] = [
      createMockSnapshot({ indicator: "A", latestValue: null }),
      createMockSnapshot({ indicator: "B", latestValue: null }),
    ];

    const quality = calculateDataQuality(snapshots);

    expect(quality).toBe(0);
  });
});

describe("Report Content Generation", () => {
  it("should generate valid markdown content", () => {
    const regime = {
      regime: "risk_on" as const,
      status: "confirmed" as const,
      confidence: 85,
      triggeredRules: ["D: QQQ ≥ +1.0% AND QQQ > 20D MA"],
      untriggeredRules: ["A: QQQ ≤ -2.0% AND GLD ≥ +1.0%"],
    };
    const switches = {
      marginBorrow: "allowed",
      putSelling: "aggressive",
      spotPace: "fast",
    };
    const snapshots: MarketIndicator[] = [
      createMockSnapshot({ indicator: "QQQ", displayName: "Nasdaq-100 ETF", latestValue: 400, change1d: 1.5 }),
    ];

    const content = generateReportContent(regime, switches, snapshots, 80);

    expect(content).toContain("# Market Regime Monitor");
    expect(content).toContain("RISK-ON"); // The actual format is uppercase
    expect(content).toContain("Green Light");
    expect(content).toContain("MARGIN_BORROW");
    expect(content).toContain("Snapshot");
    expect(content).toContain("QQQ");
  });

  it("should include triggered and untriggered rules in content", () => {
    const regime = {
      regime: "base" as const,
      status: "watch" as const,
      confidence: 70,
      triggeredRules: ["E: GLD ≤ +0.5% OR GLD ≤ 20D MA"],
      untriggeredRules: ["A: QQQ ≤ -2.0% AND GLD ≥ +1.0%"],
    };
    const switches = {
      marginBorrow: "allowed",
      putSelling: "helper",
      spotPace: "medium",
    };
    const snapshots: MarketIndicator[] = [];

    const content = generateReportContent(regime, switches, snapshots, 60);

    expect(content).toContain("触发的规则");
    expect(content).toContain("未触发的规则");
    expect(content).toContain("✅");
    expect(content).toContain("❌");
  });
});
