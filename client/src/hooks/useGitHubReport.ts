/**
 * GitHub Pages 数据获取 Hook
 * 从 GitHub Pages 上的 JSON 文件获取市场报告数据
 */
import { useState, useEffect, useCallback } from "react";

// GitHub Pages base URL - 通过环境变量配置
const GITHUB_PAGES_BASE_URL =
  import.meta.env.VITE_GITHUB_PAGES_URL ||
  "https://wouhao.github.io/market-regime-monitor/reports";

// 报告数据类型定义
export interface MarketSnapshot {
  indicator: string;
  displayName: string;
  latestValue: number | null;
  change1d: number | null;
  change7d: number | null;
  change30d: number | null;
  ma20: number | null;
  aboveMa20: boolean | null;
  sparklineData: number[];
}

export interface RegimeResult {
  regime: "risk_on" | "risk_off" | "base";
  status: "watch" | "confirmed";
  confidence: number;
  triggeredRules: string[];
  untriggeredRules: string[];
}

export interface ExecutionSwitches {
  marginBorrow: string;
  putSelling: string;
  spotPace: string;
}

export interface BtcAnalysis {
  state: string;
  liquidityTag: string;
  confidence: string;
  evidence: {
    price: { latest: number | null; pct7d: number | null; pct30d: number | null };
    oi: { latest: number | null; pct7d: number | null };
    funding: { latest: number | null };
    liquidations: { h24: number | null };
    stablecoin: { latest: number | null; pct7d: number | null; pct30d: number | null };
    etfFlow: {
      today: number | null;
      rolling5d: number | null;
      rolling20d: number | null;
      asOfDate: string;
      tag: string;
      tagReason: string;
    };
  };
  stateReasons: string[];
}

export interface EtfFlowRecord {
  date: string;
  total: number | null;
  ibit: number | null;
  fbtc: number | null;
  gbtc: number | null;
}

export interface LiquidationData {
  total24h: number;
  long24h: number;
  short24h: number;
  total7d: number;
  source: string;
  requestTime: string;
}

export interface MarketReport {
  version: string;
  generatedAt: string;
  generatedAtBJT: string;
  date: string;
  regime: RegimeResult;
  switches: ExecutionSwitches;
  dataQuality: { score: number; total: number; valid: number };
  snapshots: MarketSnapshot[];
  btcAnalysis: BtcAnalysis;
  liquidationData: LiquidationData | null;
  etfFlow: EtfFlowRecord[];
}

export interface ReportIndex {
  dates: string[];
  updatedAt: string;
}

// ============ Hooks ============

/**
 * 获取最新报告
 */
export function useLatestReport() {
  const [data, setData] = useState<MarketReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const resp = await fetch(`${GITHUB_PAGES_BASE_URL}/latest.json?t=${Date.now()}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const report = await resp.json();
      setData(report);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch report");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  return { data, isLoading, error, refetch: fetchReport };
}

/**
 * 获取指定日期的报告
 */
export function useReportByDate(date: string | undefined) {
  const [data, setData] = useState<MarketReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!date) {
      setIsLoading(false);
      return;
    }

    const fetchReport = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const resp = await fetch(`${GITHUB_PAGES_BASE_URL}/${date}.json?t=${Date.now()}`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const report = await resp.json();
        setData(report);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch report");
      } finally {
        setIsLoading(false);
      }
    };

    fetchReport();
  }, [date]);

  return { data, isLoading, error };
}

/**
 * 获取报告日期列表（用于历史页面）
 */
export function useReportIndex() {
  const [data, setData] = useState<ReportIndex | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchIndex = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const resp = await fetch(`${GITHUB_PAGES_BASE_URL}/index.json?t=${Date.now()}`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const index = await resp.json();
        setData(index);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch index");
      } finally {
        setIsLoading(false);
      }
    };

    fetchIndex();
  }, []);

  return { data, isLoading, error };
}

/**
 * 获取多个日期的报告（用于历史对比）
 */
export function useReportHistory(dates: string[]) {
  const [data, setData] = useState<MarketReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (dates.length === 0) {
      setData([]);
      setIsLoading(false);
      return;
    }

    const fetchAll = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const reports = await Promise.all(
          dates.map(async (date) => {
            try {
              const resp = await fetch(`${GITHUB_PAGES_BASE_URL}/${date}.json`);
              if (!resp.ok) return null;
              return await resp.json();
            } catch {
              return null;
            }
          })
        );
        setData(reports.filter((r): r is MarketReport => r !== null));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch reports");
      } finally {
        setIsLoading(false);
      }
    };

    fetchAll();
  }, [dates.join(",")]);

  return { data, isLoading, error };
}
