import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { generateAIAnalysis } from "./services/aiAnalysisService";
import type { CryptoTrendData } from "./services/marketDataService";
import {
  getApiConfigs,
  saveApiConfig,
  deleteApiConfig,
  getApiConfigByKey,
} from "./db";

// GitHub Pages base URL for fetching report JSON
const GITHUB_PAGES_BASE_URL =
  process.env.GITHUB_PAGES_URL ||
  "https://wouhao.github.io/market-regime-monitor/reports";

// Helper: fetch latest report JSON from GitHub Pages
async function fetchLatestReportFromGitHub(): Promise<any | null> {
  try {
    const resp = await fetch(`${GITHUB_PAGES_BASE_URL}/latest.json?t=${Date.now()}`);
    if (!resp.ok) {
      console.warn(`[GitHub] Failed to fetch latest.json: HTTP ${resp.status}`);
      return null;
    }
    return await resp.json();
  } catch (err) {
    console.error("[GitHub] Failed to fetch latest report:", err);
    return null;
  }
}

export const appRouter = router({
  system: systemRouter,
  
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // AI 分析（保留，手动触发）
  market: router({
    // 生成AI分析 - 从 GitHub Pages JSON 获取数据，调用 LLM
    generateAIAnalysis: protectedProcedure
      .mutation(async () => {
        console.log("[API] Generating AI analysis from GitHub Pages data...");
        
        try {
          // 从 GitHub Pages 获取最新报告
          const report = await fetchLatestReportFromGitHub();
          
          if (!report) {
            return { success: false, message: "无法从 GitHub Pages 获取报告数据", data: null };
          }
          
          // 构建 AI 分析输入
          const snapshots = (report.snapshots || []).map((s: any) => ({
            indicator: s.indicator,
            displayName: s.displayName,
            latestValue: s.latestValue,
            change1d: s.change1d,
            change7d: s.change7d,
            change30d: s.change30d,
            ma20: s.ma20,
            aboveMa20: s.aboveMa20,
            sparklineData: s.sparklineData || [],
          }));
          
          // 构建 crypto trends（从 JSON 中的快照数据）
          let cryptoTrends: CryptoTrendData | null = null;
          try {
            const fundingSnap = snapshots.find((s: any) => s.indicator === "crypto_funding");
            const oiSnap = snapshots.find((s: any) => s.indicator === "crypto_oi");
            const liqSnap = snapshots.find((s: any) => s.indicator === "crypto_liquidations");
            const stableSnap = snapshots.find((s: any) => s.indicator === "stablecoin");
            
            cryptoTrends = {
              funding1d: fundingSnap?.change1d ?? null,
              funding7d: fundingSnap?.change7d ?? null,
              funding30d: fundingSnap?.change30d ?? null,
              oi1d: oiSnap?.change1d ?? null,
              oi7d: oiSnap?.change7d ?? null,
              oi30d: oiSnap?.change30d ?? null,
              liq1d: liqSnap?.change1d ?? null,
              liq7d: liqSnap?.change7d ?? null,
              liq30d: liqSnap?.change30d ?? null,
              stable1d: stableSnap?.change1d ?? null,
              stable7d: stableSnap?.change7d ?? null,
              stable30d: stableSnap?.change30d ?? null,
            };
          } catch (err) {
            console.warn("[API] Failed to build crypto trends for AI:", err);
          }
          
          // 构建 BTC 分析数据（从 JSON）
          let btcAnalysisForAI = null;
          if (report.btcAnalysis) {
            btcAnalysisForAI = {
              state: report.btcAnalysis.state,
              liquidityTag: report.btcAnalysis.liquidityTag,
              confidence: report.btcAnalysis.confidence,
              formattedText: `BTC状态: ${report.btcAnalysis.state}, 流动性: ${report.btcAnalysis.liquidityTag}, 置信度: ${report.btcAnalysis.confidence}. 原因: ${(report.btcAnalysis.stateReasons || []).join("; ")}`,
            };
          }
          
          // 调用AI分析
          const analysis = await generateAIAnalysis({
            snapshots,
            cryptoTrends,
            currentRegime: report.regime?.regime || "base",
            currentStatus: report.regime?.status || "watch",
            previousRegime: null, // 简化：不再从数据库获取上一次情景
            triggeredRules: report.regime?.triggeredRules || [],
            untriggeredRules: report.regime?.untriggeredRules || [],
            switches: report.switches || {
              marginBorrow: "paused",
              putSelling: "paused",
              spotPace: "paused",
            },
            btcAnalysis: btcAnalysisForAI,
          });
          
          console.log("[API] AI analysis generated successfully");
          
          return {
            success: true,
            data: analysis,
          };
        } catch (error) {
          console.error("[API] Failed to generate AI analysis:", error);
          return {
            success: false,
            message: `AI分析生成失败: ${error instanceof Error ? error.message : "未知错误"}`,
            data: null,
          };
        }
      }),
  }),

  // API配置管理（保留）
  config: router({
    // 获取当前用户的API配置
    getAll: protectedProcedure.query(async ({ ctx }) => {
      const configs = await getApiConfigs(ctx.user.id);
      return {
        success: true,
        data: configs.map(c => ({
          key: c.configKey,
          isConfigured: !!c.configValue,
          isActive: c.isActive,
          updatedAt: c.updatedAt,
        })),
      };
    }),

    // 保存API配置
    save: protectedProcedure
      .input(z.object({
        key: z.string(),
        value: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        await saveApiConfig({
          userId: ctx.user.id,
          configKey: input.key,
          configValue: input.value,
          isActive: true,
        });
        return { success: true, message: "配置已保存" };
      }),

    // 删除API配置
    delete: protectedProcedure
      .input(z.object({ key: z.string() }))
      .mutation(async ({ ctx, input }) => {
        await deleteApiConfig(ctx.user.id, input.key);
        return { success: true, message: "配置已删除" };
      }),

    // 测试API配置
    test: protectedProcedure
      .input(z.object({ key: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const config = await getApiConfigByKey(ctx.user.id, input.key);
        
        if (!config) {
          return { success: false, message: "配置不存在" };
        }
        
        try {
          if (input.key === "FRED_API_KEY") {
            const response = await fetch(
              `https://api.stlouisfed.org/fred/series?series_id=DGS10&api_key=${config.configValue}&file_type=json`
            );
            if (response.ok) {
              return { success: true, message: "FRED API Key 有效" };
            }
          } else if (input.key === "COINGLASS_API_KEY") {
            const response = await fetch(
              "https://open-api.coinglass.com/public/v2/funding",
              { headers: { "coinglassSecret": config.configValue } }
            );
            if (response.ok) {
              return { success: true, message: "CoinGlass API Key 有效" };
            }
          }
          return { success: false, message: "API Key 无效或已过期" };
        } catch (error) {
          return { success: false, message: "测试失败，请检查网络连接" };
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
