import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { 
  generateMarketReport, 
  MarketIndicator,
  RegimeResult,
  ExecutionSwitches 
} from "./services/marketDataService";
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
} from "./db";

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
      
      return {
        success: true,
        data: {
          ...report,
          snapshots,
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
        const coinglassConfig = await getApiConfigByKey(ctx.user.id, "COINGLASS_API_KEY");
        
        const fredApiKey = fredConfig?.configValue || "demo_key";
        const coinglassApiKey = coinglassConfig?.configValue || "demo_key";
        
        // 获取上一次的情景用于确认状态判定
        const lastReport = await getLatestReport();
        const previousRegime = lastReport?.regime;
        
        // 生成报告
        const reportData = await generateMarketReport(fredApiKey, coinglassApiKey, previousRegime);
        
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
