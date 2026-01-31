import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { 
  generateMarketReport, 
  MarketIndicator,
  RegimeResult,
  ExecutionSwitches,
  extractCryptoMetrics,
  calculateCryptoTrends,
  generateSparkline,
  CryptoTrendData
} from "./services/marketDataService";
import { generateAIAnalysis, AIAnalysisResult } from "./services/aiAnalysisService";
import {
  saveMarketReport,
  saveMarketSnapshots,
  getLatestReport,
  getReportByDate,
  getReportById,
  getReportHistory,
  getSnapshotsByReportId,
  getApiConfigs,
  saveApiConfig,
  deleteApiConfig,
  getApiConfigByKey,
  getSystemSetting,
  setSystemSetting,
  upsertCryptoMetricsDaily,
  getCryptoMetricsDaysAgo,
  updateReportAIAnalysis,
  getReportAIAnalysis,
  AIAnalysisData,
} from "./db";
import {
  fetchFarsideData,
  saveEtfFlowData,
  getLatestEtfFlow,
  getEtfFlowHistory,
  getEtfFlowHistoryWithRolling,
  getEtfFlowStats,
  isEtfFlowEnabled,
  setEtfFlowEnabled,
  runEtfFlowFetch,
  EtfFlowWithRolling,
  EtfFlowManifest,
  EtfFlowChartData,
} from "./etfFlowService";

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

  // 市场报告相关API
  market: router({
    // 获取最新报告
    getLatest: publicProcedure.query(async () => {
      console.log("[API] Getting latest report...");
      const report = await getLatestReport();
      
      if (!report) {
        return { success: false, message: "暂无报告数据", data: null };
      }
      
      const snapshots = await getSnapshotsByReportId(report.id);
      
      // 获取加密指标趋势数据
      let cryptoTrends: CryptoTrendData | null = null;
      try {
        const [d1, d7, d30] = await Promise.all([
          getCryptoMetricsDaysAgo(1),
          getCryptoMetricsDaysAgo(7),
          getCryptoMetricsDaysAgo(30),
        ]);
        
        // 从快照中提取当前加密指标
        const fundingSnapshot = snapshots.find(s => s.indicator === "crypto_funding");
        const oiSnapshot = snapshots.find(s => s.indicator === "crypto_oi");
        const liqSnapshot = snapshots.find(s => s.indicator === "crypto_liquidations");
        const stableSnapshot = snapshots.find(s => s.indicator === "stablecoin");
        
        const current = {
          funding: fundingSnapshot?.latestValue ? Number(fundingSnapshot.latestValue) : null,
          oiUsd: oiSnapshot?.latestValue ? Number(oiSnapshot.latestValue) : null,
          liq24hUsd: liqSnapshot?.latestValue ? Number(liqSnapshot.latestValue) : null,
          stableUsdtUsdcUsd: stableSnapshot?.latestValue ? Number(stableSnapshot.latestValue) : null,
        };
        
        const toMetrics = (m: typeof d1) => m ? {
          funding: m.funding ? Number(m.funding) : null,
          oiUsd: m.oiUsd ? Number(m.oiUsd) : null,
          liq24hUsd: m.liq24hUsd ? Number(m.liq24hUsd) : null,
          stableUsdtUsdcUsd: m.stableUsdtUsdcUsd ? Number(m.stableUsdtUsdcUsd) : null,
        } : null;
        
        cryptoTrends = calculateCryptoTrends(current, toMetrics(d1), toMetrics(d7), toMetrics(d30));
      } catch (err) {
        console.warn("[API] Failed to calculate crypto trends:", err);
      }
      
      // 获取AI分析数据
      const aiAnalysis = await getReportAIAnalysis(report.id);
      
      return {
        success: true,
        data: {
          ...report,
          snapshots,
          cryptoTrends,
          aiAnalysis,
        },
      };
    }),

    // 获取指定日期的报告
    getByDate: publicProcedure
      .input(z.object({ date: z.string() }))
      .query(async ({ input }) => {
        console.log(`[API] Getting report for date: ${input.date}`);
        const report = await getReportByDate(input.date);
        
        if (!report) {
          return { success: false, message: "该日期无报告", data: null };
        }
        
        const snapshots = await getSnapshotsByReportId(report.id);
        
        return {
          success: true,
          data: {
            ...report,
            snapshots,
          },
        };
      }),

    // 获取指定ID的报告
    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        console.log(`[API] Getting report by ID: ${input.id}`);
        const report = await getReportById(input.id);
        
        if (!report) {
          return { success: false, message: "报告不存在", data: null };
        }
        
        const snapshots = await getSnapshotsByReportId(report.id);
        
        return {
          success: true,
          data: {
            ...report,
            snapshots,
          },
        };
      }),

    // 获取历史报告列表
    getHistory: publicProcedure
      .input(z.object({ limit: z.number().optional().default(30) }))
      .query(async ({ input }) => {
        console.log(`[API] Getting report history, limit: ${input.limit}`);
        const reports = await getReportHistory(input.limit);
        return { success: true, data: reports };
      }),

    // 生成新报告
    generate: protectedProcedure.mutation(async ({ ctx }) => {
      console.log(`[API] Generating new report for user: ${ctx.user.id}`);
      
      try {
        // 获取用户的API配置
        const fredConfig = await getApiConfigByKey(ctx.user.id, "FRED_API_KEY");
        const fredApiKey = fredConfig?.configValue || "demo_key";
        
        // 获取Coinalyze API Key用于清算数据
        const coinalyzeConfig = await getApiConfigByKey(ctx.user.id, "COINALYZE_API_KEY");
        console.log(`[API] User ID: ${ctx.user.id}, Coinalyze config found: ${!!coinalyzeConfig}, value: ${coinalyzeConfig?.configValue ? 'SET' : 'NOT SET'}`);
        const coinalyzeApiKey = coinalyzeConfig?.configValue || undefined;
        console.log(`[API] Coinalyze API Key: ${coinalyzeApiKey ? 'Configured' : 'Not configured'}`);
        
        // 获取上一次的情景用于确认状态判定
        const lastReport = await getLatestReport();
        const previousRegime = lastReport?.regime;
        
        // 生成报告 (使用Coinalyze获取多交易所聚合清算数据)
        const reportData = await generateMarketReport(fredApiKey, coinalyzeApiKey, previousRegime);
        
        // 获取北京时间日期
        const now = new Date();
        const bjTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
        const reportDate = bjTime.toISOString().split("T")[0];
        
        // 保存报告到数据库
        const reportId = await saveMarketReport({
          reportDate,
          regime: reportData.regime.regime,
          status: reportData.regime.status,
          confidence: reportData.regime.confidence.toString(),
          marginBorrow: reportData.switches.marginBorrow,
          putSelling: reportData.switches.putSelling,
          spotPace: reportData.switches.spotPace,
          triggeredRules: reportData.regime.triggeredRules,
          untriggeredRules: reportData.regime.untriggeredRules,
          dataQuality: reportData.dataQuality.toString(),
          reportContent: reportData.reportContent,
        });
        
        // 保存快照数据
        const snapshotsToSave = reportData.snapshots.map(s => ({
          reportId,
          indicator: s.indicator,
          displayName: s.displayName,
          latestValue: s.latestValue?.toString() || null,
          change1d: s.change1d?.toString() || null,
          change7d: s.change7d?.toString() || null,
          change30d: s.change30d?.toString() || null,
          ma20: s.ma20?.toString() || null,
          aboveMa20: s.aboveMa20,
          sparklineData: s.sparklineData,
        }));
        
        await saveMarketSnapshots(reportId, snapshotsToSave);
        
        // 保存加密指标到历史表（用于趋势计算）
        const cryptoMetrics = extractCryptoMetrics(reportData.snapshots);
        try {
          await upsertCryptoMetricsDaily({
            dateBjt: reportDate,
            tsBjt: Math.floor(bjTime.getTime() / 1000),
            funding: cryptoMetrics.funding?.toString() || null,
            oiUsd: cryptoMetrics.oiUsd?.toString() || null,
            liq24hUsd: cryptoMetrics.liq24hUsd?.toString() || null,
            stableUsdtUsdcUsd: cryptoMetrics.stableUsdtUsdcUsd?.toString() || null,
            sourceFunding: cryptoMetrics.sources.funding,
            sourceOi: cryptoMetrics.sources.oi,
            sourceLiq: cryptoMetrics.sources.liq,
            sourceStable: cryptoMetrics.sources.stable,
            notes: JSON.stringify({
              missingReasons: {
                funding: cryptoMetrics.funding === null ? "API not available" : null,
                oi: cryptoMetrics.oiUsd === null ? "API not available" : null,
                liq: cryptoMetrics.liq24hUsd === null ? "Coinalyze API Key required" : null,
                stable: cryptoMetrics.stableUsdtUsdcUsd === null ? "API not available" : null,
              },
            }),
          });
          console.log(`[API] Crypto metrics saved for ${reportDate}`);
        } catch (err) {
          console.warn(`[API] Failed to save crypto metrics:`, err);
        }
        
        console.log(`[API] Report generated successfully, ID: ${reportId}`);
        
        return {
          success: true,
          message: "报告生成成功",
          data: {
            reportId,
            reportDate,
            regime: reportData.regime.regime,
            status: reportData.regime.status,
            dataQuality: reportData.dataQuality,
          },
        };
      } catch (error) {
        console.error("[API] Failed to generate report:", error);
        return {
          success: false,
          message: `报告生成失败: ${error instanceof Error ? error.message : "未知错误"}`,
          data: null,
        };
      }
    }),

    // 获取系统状态
    getStatus: publicProcedure.query(async () => {
      const lastReport = await getLatestReport();
      const scheduledTime = await getSystemSetting("scheduled_time") || "09:00";
      
      return {
        success: true,
        data: {
          status: "running",
          lastReportDate: lastReport?.reportDate || null,
          lastReportTime: lastReport?.createdAt?.toISOString() || null,
          scheduledTime,
          timezone: "Asia/Shanghai",
        },
      };
    }),
    
    // 生成AI分析
    generateAIAnalysis: protectedProcedure
      .input(z.object({ reportId: z.number().optional() }))
      .mutation(async ({ input }) => {
        console.log("[API] Generating AI analysis...");
        
        try {
          // 获取报告数据
          let report;
          if (input.reportId) {
            report = await getReportById(input.reportId);
          } else {
            report = await getLatestReport();
          }
          
          if (!report) {
            return { success: false, message: "无报告数据", data: null };
          }
          
          const snapshots = await getSnapshotsByReportId(report.id);
          
          // 获取加密指标趋势数据
          let cryptoTrends: CryptoTrendData | null = null;
          try {
            const [d1, d7, d30] = await Promise.all([
              getCryptoMetricsDaysAgo(1),
              getCryptoMetricsDaysAgo(7),
              getCryptoMetricsDaysAgo(30),
            ]);
            
            const fundingSnapshot = snapshots.find(s => s.indicator === "crypto_funding");
            const oiSnapshot = snapshots.find(s => s.indicator === "crypto_oi");
            const liqSnapshot = snapshots.find(s => s.indicator === "crypto_liquidations");
            const stableSnapshot = snapshots.find(s => s.indicator === "stablecoin");
            
            const current = {
              funding: fundingSnapshot?.latestValue ? Number(fundingSnapshot.latestValue) : null,
              oiUsd: oiSnapshot?.latestValue ? Number(oiSnapshot.latestValue) : null,
              liq24hUsd: liqSnapshot?.latestValue ? Number(liqSnapshot.latestValue) : null,
              stableUsdtUsdcUsd: stableSnapshot?.latestValue ? Number(stableSnapshot.latestValue) : null,
            };
            
            const toMetrics = (m: typeof d1) => m ? {
              funding: m.funding ? Number(m.funding) : null,
              oiUsd: m.oiUsd ? Number(m.oiUsd) : null,
              liq24hUsd: m.liq24hUsd ? Number(m.liq24hUsd) : null,
              stableUsdtUsdcUsd: m.stableUsdtUsdcUsd ? Number(m.stableUsdtUsdcUsd) : null,
            } : null;
            
            cryptoTrends = calculateCryptoTrends(current, toMetrics(d1), toMetrics(d7), toMetrics(d30));
          } catch (err) {
            console.warn("[API] Failed to calculate crypto trends for AI:", err);
          }
          
          // 获取上一次报告的情景
          const reports = await getReportHistory(2);
          const previousReport = reports.length > 1 ? reports[1] : null;
          
          // 调用AI分析
          const analysis = await generateAIAnalysis({
            snapshots: snapshots.map(s => ({
              indicator: s.indicator,
              displayName: s.displayName,
              latestValue: s.latestValue ? Number(s.latestValue) : null,
              change1d: s.change1d ? Number(s.change1d) : null,
              change7d: s.change7d ? Number(s.change7d) : null,
              change30d: s.change30d ? Number(s.change30d) : null,
              ma20: s.ma20 ? Number(s.ma20) : null,
              aboveMa20: s.aboveMa20,
              sparklineData: s.sparklineData || [],
            })),
            cryptoTrends,
            currentRegime: report.regime,
            currentStatus: report.status,
            previousRegime: previousReport?.regime || null,
            triggeredRules: (report.triggeredRules as string[]) || [],
            untriggeredRules: (report.untriggeredRules as string[]) || [],
            switches: {
              marginBorrow: report.marginBorrow,
              putSelling: report.putSelling,
              spotPace: report.spotPace,
            },
          });
          
          console.log("[API] AI analysis generated successfully");
          
          // 保存AI分析结果到数据库
          const aiAnalysisData: AIAnalysisData = {
            conclusion: analysis.summary,
            evidenceChain: analysis.evidenceChain,
            leverageJudgment: analysis.leverageJudgment,
            switchRationale: {
              margin: analysis.switchRationale.marginBorrow,
              put: analysis.switchRationale.putSelling,
              spot: analysis.switchRationale.spotPace,
            },
            riskAlerts: analysis.riskAlerts,
            fullText: analysis.fullAnalysis,
            generatedAt: Date.now(),
          };
          
          await updateReportAIAnalysis(report.id, aiAnalysisData);
          console.log("[API] AI analysis saved to database");
          
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

  // API配置管理
  config: router({
    // 获取当前用户的API配置
    getAll: protectedProcedure.query(async ({ ctx }) => {
      const configs = await getApiConfigs(ctx.user.id);
      // 隐藏实际的API key值，只返回是否已配置
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
        
        // 简单测试API是否有效
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

  // BTC ETF Flow API
  etfFlow: router({
    // 获取最新ETF Flow数据（带滚动计算和提示）
    getLatest: publicProcedure.query(async () => {
      console.log("[API] Getting latest ETF flow data...");
      
      const enabled = await isEtfFlowEnabled();
      if (!enabled) {
        return {
          success: false,
          message: "ETF Flow module is disabled",
          data: null,
        };
      }
      
      const data = await getLatestEtfFlow();
      
      if (!data) {
        return {
          success: false,
          message: "No ETF flow data available",
          data: null,
        };
      }
      
      return {
        success: true,
        data,
      };
    }),

    // 获取历史ETF Flow数据
    getHistory: publicProcedure
      .input(z.object({ limit: z.number().optional().default(30) }))
      .query(async ({ input }) => {
        console.log(`[API] Getting ETF flow history, limit: ${input.limit}`);
        
        const enabled = await isEtfFlowEnabled();
        if (!enabled) {
          return {
            success: false,
            message: "ETF Flow module is disabled",
            data: [],
          };
        }
        
        const data = await getEtfFlowHistory(input.limit);
        return { success: true, data };
      }),

    // 获取图表数据（带滚动平均）
    getChartData: publicProcedure
      .input(z.object({ limit: z.number().optional().default(30) }))
      .query(async ({ input }) => {
        console.log(`[API] Getting ETF flow chart data, limit: ${input.limit}`);
        
        const enabled = await isEtfFlowEnabled();
        if (!enabled) {
          return {
            success: false,
            message: "ETF Flow module is disabled",
            data: [],
          };
        }
        
        const data = await getEtfFlowHistoryWithRolling(input.limit);
        return { success: true, data };
      }),

    // 获取ETF Flow统计信息
    getStats: publicProcedure.query(async () => {
      const enabled = await isEtfFlowEnabled();
      const stats = await getEtfFlowStats();
      
      return {
        success: true,
        data: {
          ...stats,
          enabled,
        },
      };
    }),

    // 手动刷新ETF Flow数据
    refresh: protectedProcedure.mutation(async () => {
      console.log("[API] Refreshing ETF flow data...");
      
      const result = await runEtfFlowFetch();
      
      return {
        success: result.success,
        message: result.message,
        manifest: result.manifest,
      };
    }),

    // 初始历史数据回填
    backfill: protectedProcedure.mutation(async () => {
      console.log("[API] Starting ETF flow backfill...");
      
      try {
        const { data, manifest } = await fetchFarsideData();
        
        if (manifest.parseStatus === "failed") {
          return {
            success: false,
            message: manifest.missingReason || "Failed to fetch data",
            manifest,
          };
        }
        
        const { inserted, updated } = await saveEtfFlowData(data, manifest);
        
        return {
          success: true,
          message: `Backfill complete: ${data.length} records processed, ${inserted} inserted, ${updated} updated`,
          manifest,
        };
      } catch (error) {
        console.error("[API] Backfill error:", error);
        return {
          success: false,
          message: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }),

    // 获取/设置ETF Flow模块启用状态
    getEnabled: publicProcedure.query(async () => {
      const enabled = await isEtfFlowEnabled();
      return { success: true, enabled };
    }),

    setEnabled: protectedProcedure
      .input(z.object({ enabled: z.boolean() }))
      .mutation(async ({ input }) => {
        await setEtfFlowEnabled(input.enabled);
        return { success: true, message: `ETF Flow module ${input.enabled ? "enabled" : "disabled"}` };
      }),
  }),

  // 系统设置
  settings: router({
    // 获取定时任务配置
    getSchedule: protectedProcedure.query(async () => {
      const scheduledTime = await getSystemSetting("scheduled_time") || "09:00";
      const isEnabled = await getSystemSetting("schedule_enabled") || "true";
      
      return {
        success: true,
        data: {
          scheduledTime,
          isEnabled: isEnabled === "true",
          timezone: "Asia/Shanghai",
        },
      };
    }),

    // 更新定时任务配置
    updateSchedule: protectedProcedure
      .input(z.object({
        scheduledTime: z.string().optional(),
        isEnabled: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        if (input.scheduledTime) {
          await setSystemSetting("scheduled_time", input.scheduledTime, "每日报告生成时间");
        }
        if (input.isEnabled !== undefined) {
          await setSystemSetting("schedule_enabled", input.isEnabled.toString(), "是否启用定时任务");
        }
        return { success: true, message: "设置已更新" };
      }),
  }),
});

export type AppRouter = typeof appRouter;
