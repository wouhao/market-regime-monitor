/**
 * BTC 市场分析服务单元测试
 */

import { describe, it, expect } from "vitest";
import {
  analyzeBtcMarket,
  formatBtcAnalysisForAI,
  BtcAnalysisInput,
  BtcState,
  LiquidityTag,
} from "./services/btcAnalysisService";

describe("BTC Market Analysis Service", () => {
  // 基础输入数据模板
  const baseInput: BtcAnalysisInput = {
    btcPrice: 100000,
    btcPrice7dPct: 0,
    btcPrice30dPct: 0,
    fundingLatest: 0.0001,
    oiLatest: 9000000000, // $9B
    liq24h: 200000000, // $200M
    stablecoinLatest: 200000000000, // $200B
    stablecoin7dPct: 0.5,
    stablecoin30dPct: 1.0,
    oi7dAgo: 9000000000,
    funding7dHistory: [0.0001, 0.0001, 0.0001, 0.0001, 0.0001, 0.0001, 0.0001],
    liq7dHistory: [200000000, 200000000, 200000000, 200000000, 200000000, 200000000, 200000000],
    previousBtcState: null,
    asOfDate: "2026-01-31",
  };

  describe("analyzeBtcMarket - State Classification", () => {
    it("should classify S1 (杠杆堆积) when OI up + funding positive + price up", () => {
      const input: BtcAnalysisInput = {
        ...baseInput,
        btcPrice7dPct: 8, // 价格上行
        oiLatest: 10000000000, // $10B
        oi7dAgo: 9000000000, // $9B (OI 7D +11%)
        fundingLatest: 0.0005, // funding偏正
        funding7dHistory: [0.0003, 0.0003, 0.0004, 0.0004, 0.0004, 0.0005, 0.0005], // funding上升
      };
      
      const result = analyzeBtcMarket(input);
      expect(result.state).toBe("S1");
      expect(result.stateReasons.length).toBeGreaterThanOrEqual(2);
    });

    it("should classify S2 (去杠杆/出清) when price down + OI down + liq up", () => {
      const input: BtcAnalysisInput = {
        ...baseInput,
        btcPrice7dPct: -7, // 价格7D<-5%
        oiLatest: 8000000000, // $8B
        oi7dAgo: 9000000000, // $9B (OI下降)
        liq24h: 500000000, // $500M (清算上升)
        liq7dHistory: [200000000, 250000000, 300000000, 350000000, 400000000, 450000000, 500000000],
      };
      
      const result = analyzeBtcMarket(input);
      expect(result.state).toBe("S2");
      expect(result.stateReasons.length).toBeGreaterThanOrEqual(2);
    });

    it("should classify S3 (低杠杆修复) when price up + OI stable + liq down + funding neutral", () => {
      const input: BtcAnalysisInput = {
        ...baseInput,
        btcPrice7dPct: 3, // 价格回升
        oiLatest: 9100000000, // $9.1B (OI小升)
        oi7dAgo: 9000000000, // $9B
        liq24h: 100000000, // $100M (清算回落)
        liq7dHistory: [300000000, 250000000, 200000000, 180000000, 150000000, 120000000, 100000000],
        fundingLatest: 0.0001, // funding不极端
      };
      
      const result = analyzeBtcMarket(input);
      expect(result.state).toBe("S3");
      expect(result.stateReasons.length).toBeGreaterThanOrEqual(2);
    });

    it("should classify S4 (中性/混合) when conditions are mixed or data missing", () => {
      const input: BtcAnalysisInput = {
        ...baseInput,
        btcPrice7dPct: -2, // 价格微跌（不满足S2的-5%阈值）
        oiLatest: 9500000000,
        oi7dAgo: 9000000000, // OI小升（不满足S1的+5%阈值）
        liq24h: 200000000, // 清算正常
        fundingLatest: 0.0001, // funding中性
        liq7dHistory: [], // 缺失数据导致无法判断S2/S3
      };
      
      const result = analyzeBtcMarket(input);
      expect(result.state).toBe("S4");
    });
  });

  describe("analyzeBtcMarket - Liquidity Tag", () => {
    it("should tag Expanding when stablecoin 7D and 30D both positive", () => {
      const input: BtcAnalysisInput = {
        ...baseInput,
        stablecoin7dPct: 0.5,
        stablecoin30dPct: 2.0,
      };
      
      const result = analyzeBtcMarket(input);
      expect(result.liquidityTag).toBe("Expanding");
    });

    it("should tag Contracting when stablecoin 7D negative", () => {
      const input: BtcAnalysisInput = {
        ...baseInput,
        stablecoin7dPct: -0.5,
        stablecoin30dPct: 1.0,
      };
      
      const result = analyzeBtcMarket(input);
      expect(result.liquidityTag).toBe("Contracting");
    });

    it("should tag Contracting when stablecoin 30D negative", () => {
      const input: BtcAnalysisInput = {
        ...baseInput,
        stablecoin7dPct: 0.5,
        stablecoin30dPct: -1.0,
      };
      
      const result = analyzeBtcMarket(input);
      expect(result.liquidityTag).toBe("Contracting");
    });

    it("should tag Unknown when stablecoin data is missing", () => {
      const input: BtcAnalysisInput = {
        ...baseInput,
        stablecoin7dPct: null,
        stablecoin30dPct: null,
      };
      
      const result = analyzeBtcMarket(input);
      expect(result.liquidityTag).toBe("Unknown");
    });
  });

  describe("analyzeBtcMarket - Confidence", () => {
    it("should be confirmed when state matches previous state", () => {
      const input: BtcAnalysisInput = {
        ...baseInput,
        btcPrice7dPct: -7,
        oiLatest: 8000000000,
        oi7dAgo: 9000000000,
        liq24h: 500000000,
        liq7dHistory: [200000000, 250000000, 300000000, 350000000, 400000000, 450000000, 500000000],
        previousBtcState: "S2", // 上次也是S2
      };
      
      const result = analyzeBtcMarket(input);
      expect(result.state).toBe("S2");
      expect(result.confidence).toBe("confirmed");
    });

    it("should be watch when state differs from previous state", () => {
      const input: BtcAnalysisInput = {
        ...baseInput,
        btcPrice7dPct: -7,
        oiLatest: 8000000000,
        oi7dAgo: 9000000000,
        liq24h: 500000000,
        liq7dHistory: [200000000, 250000000, 300000000, 350000000, 400000000, 450000000, 500000000],
        previousBtcState: "S1", // 上次是S1，现在是S2
      };
      
      const result = analyzeBtcMarket(input);
      expect(result.state).toBe("S2");
      expect(result.confidence).toBe("watch");
    });

    it("should be watch when previous state is null", () => {
      const input: BtcAnalysisInput = {
        ...baseInput,
        previousBtcState: null,
      };
      
      const result = analyzeBtcMarket(input);
      expect(result.confidence).toBe("watch");
    });
  });

  describe("analyzeBtcMarket - Missing Fields Handling", () => {
    it("should force watch when critical fields are missing", () => {
      const input: BtcAnalysisInput = {
        ...baseInput,
        oi7dAgo: null, // OI 7D缺失
        previousBtcState: "S4",
      };
      
      const result = analyzeBtcMarket(input);
      expect(result.confidence).toBe("watch");
      expect(result.evidence.missingFields).toContain("oi_7d");
    });

    it("should mark funding_7d_avg as missing when history has nulls", () => {
      const input: BtcAnalysisInput = {
        ...baseInput,
        funding7dHistory: [0.0001, null, 0.0001, 0.0001, null, 0.0001, 0.0001],
      };
      
      const result = analyzeBtcMarket(input);
      expect(result.evidence.funding.avg7d).toBeNull();
      expect(result.evidence.missingFields).toContain("funding_7d_avg");
    });

    it("should mark liq_7d as missing when history has nulls", () => {
      const input: BtcAnalysisInput = {
        ...baseInput,
        liq7dHistory: [200000000, null, 200000000, 200000000, null, 200000000, 200000000],
      };
      
      const result = analyzeBtcMarket(input);
      expect(result.evidence.liquidations.total7d).toBeNull();
      expect(result.evidence.liquidations.avg7d).toBeNull();
      expect(result.evidence.missingFields).toContain("liq_7d");
    });

    it("should not fill 0 for missing values", () => {
      const input: BtcAnalysisInput = {
        ...baseInput,
        btcPrice: null,
        fundingLatest: null,
        oiLatest: null,
        liq24h: null,
      };
      
      const result = analyzeBtcMarket(input);
      expect(result.evidence.price.latest).toBeNull();
      expect(result.evidence.funding.latest).toBeNull();
      expect(result.evidence.oi.latest).toBeNull();
      expect(result.evidence.liquidations.h24).toBeNull();
    });
  });

  describe("analyzeBtcMarket - OI 7D Calculation", () => {
    it("should calculate OI 7D percentage correctly", () => {
      const input: BtcAnalysisInput = {
        ...baseInput,
        oiLatest: 10000000000, // $10B
        oi7dAgo: 9000000000, // $9B
      };
      
      const result = analyzeBtcMarket(input);
      // (10B / 9B - 1) * 100 = 11.11%
      expect(result.evidence.oi.pct7d).toBeCloseTo(11.11, 1);
      expect(result.evidence.oi.abs7d).toBe(1000000000); // +$1B
    });

    it("should handle OI decrease correctly", () => {
      const input: BtcAnalysisInput = {
        ...baseInput,
        oiLatest: 8000000000, // $8B
        oi7dAgo: 10000000000, // $10B
      };
      
      const result = analyzeBtcMarket(input);
      // (8B / 10B - 1) * 100 = -20%
      expect(result.evidence.oi.pct7d).toBeCloseTo(-20, 1);
      expect(result.evidence.oi.abs7d).toBe(-2000000000); // -$2B
    });
  });

  describe("analyzeBtcMarket - Liquidations 7D Calculation", () => {
    it("should calculate 7D total and avg correctly", () => {
      const input: BtcAnalysisInput = {
        ...baseInput,
        liq7dHistory: [100000000, 150000000, 200000000, 250000000, 300000000, 350000000, 400000000],
      };
      
      const result = analyzeBtcMarket(input);
      // Total = 100M + 150M + 200M + 250M + 300M + 350M + 400M = 1750M
      expect(result.evidence.liquidations.total7d).toBe(1750000000);
      // Avg = 1750M / 7 = 250M
      expect(result.evidence.liquidations.avg7d).toBe(250000000);
    });

    it("should track missing days count", () => {
      const input: BtcAnalysisInput = {
        ...baseInput,
        liq7dHistory: [100000000, null, 200000000, null, 300000000, null, 400000000],
      };
      
      const result = analyzeBtcMarket(input);
      expect(result.evidence.liquidations.missingDays).toBe(3);
    });
  });

  describe("analyzeBtcMarket - Funding 7D Avg Calculation", () => {
    it("should calculate 7D avg correctly", () => {
      const input: BtcAnalysisInput = {
        ...baseInput,
        funding7dHistory: [0.0001, 0.0002, 0.0003, 0.0004, 0.0005, 0.0006, 0.0007],
      };
      
      const result = analyzeBtcMarket(input);
      // Avg = (0.0001 + 0.0002 + ... + 0.0007) / 7 = 0.0028 / 7 = 0.0004
      expect(result.evidence.funding.avg7d).toBeCloseTo(0.0004, 6);
    });
  });

  describe("formatBtcAnalysisForAI", () => {
    it("should format BTC analysis for AI output correctly", () => {
      const input: BtcAnalysisInput = {
        ...baseInput,
        btcPrice: 100000,
        btcPrice7dPct: 5,
        btcPrice30dPct: 10,
        oiLatest: 9500000000,
        oi7dAgo: 9000000000,
        fundingLatest: 0.0003,
        funding7dHistory: [0.0002, 0.0002, 0.0002, 0.0003, 0.0003, 0.0003, 0.0003],
        liq24h: 150000000,
        liq7dHistory: [100000000, 120000000, 130000000, 140000000, 150000000, 160000000, 170000000],
        stablecoinLatest: 210000000000,
        stablecoin7dPct: 1.0,
        stablecoin30dPct: 3.0,
      };
      
      const result = analyzeBtcMarket(input);
      const formatted = formatBtcAnalysisForAI(result);
      
      expect(formatted).toContain("### BTC 市场分析");
      expect(formatted).toContain("状态");
      expect(formatted).toContain("流动性");
      expect(formatted).toContain("证据链");
      expect(formatted).toContain("Price");
      expect(formatted).toContain("OI");
      expect(formatted).toContain("Funding");
      expect(formatted).toContain("Liq");
      expect(formatted).toContain("Stablecoin");
    });

    it("should show missing for null values", () => {
      const input: BtcAnalysisInput = {
        ...baseInput,
        btcPrice: null,
        fundingLatest: null,
      };
      
      const result = analyzeBtcMarket(input);
      const formatted = formatBtcAnalysisForAI(result);
      
      expect(formatted).toContain("missing");
    });
  });

  describe("Exchange Netflow", () => {
    it("should always mark exchange netflow as missing", () => {
      const result = analyzeBtcMarket(baseInput);
      
      expect(result.evidence.exchangeNetflow.value).toBeNull();
      expect(result.evidence.exchangeNetflow.reason).toContain("missing");
    });
  });
});
