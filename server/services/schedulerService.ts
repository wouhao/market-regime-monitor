/**
 * 定时任务服务模块
 * 实现每天北京时间9点自动生成市场报告
 */

import cron from "node-cron";
import { 
  generateMarketReport, 
  extractCryptoMetrics,
  calculateCryptoTrends,
} from "./marketDataService";
import { generateAIAnalysis } from "./aiAnalysisService";
import {
  saveMarketReport,
  saveMarketSnapshots,
  getApiConfigByKey,
  getSystemSetting,
  getLatestReport,
  upsertCryptoMetricsDaily,
  getCryptoMetricsDaysAgo,
  updateReportAIAnalysis,
} from "../db";
import { runEtfFlowFetch, isEtfFlowEnabled } from "../etfFlowService";

// 系统用户ID（用于定时任务生成的报告，使用owner的配置）
const SYSTEM_USER_ID = 1;

/**
 * 生成市场报告的核心逻辑
 * 与routers.ts中的generate mutation保持一致
 */
async function generateScheduledReport(): Promise<void> {
  const startTime = Date.now();
  console.log("[Scheduler] Starting scheduled report generation...");
  
  try {
    // 获取API配置（使用系统用户的配置）
    const fredConfig = await getApiConfigByKey(SYSTEM_USER_ID, "FRED_API_KEY");
    const fredApiKey = fredConfig?.configValue || "demo_key";
    
    const coinalyzeConfig = await getApiConfigByKey(SYSTEM_USER_ID, "COINALYZE_API_KEY");
    const coinalyzeApiKey = coinalyzeConfig?.configValue || undefined;
    
    console.log("[Scheduler] FRED API Key:", fredApiKey ? "configured" : "not configured");
    console.log("[Scheduler] Coinalyze API Key:", coinalyzeApiKey ? "configured" : "not configured");
    
    // 获取上一次的情景用于确认状态判定
    const lastReport = await getLatestReport();
    const previousRegime = lastReport?.regime;
    
    // 生成报告
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
          scheduledTask: true,
        }),
      });
      console.log(`[Scheduler] Crypto metrics saved for ${reportDate}`);
    } catch (err) {
      console.warn(`[Scheduler] Failed to save crypto metrics:`, err);
    }
    
    // 自动生成AI分析
    const autoAiEnabled = await getSystemSetting("auto_ai_analysis") || "true";
    if (autoAiEnabled === "true") {
      console.log("[Scheduler] Generating AI analysis...");
      try {
        // 获取加密指标趋势数据
        const [d1, d7, d30] = await Promise.all([
          getCryptoMetricsDaysAgo(1),
          getCryptoMetricsDaysAgo(7),
          getCryptoMetricsDaysAgo(30),
        ]);
        
        const toMetrics = (m: typeof d1) => m ? {
          funding: m.funding ? Number(m.funding) : null,
          oiUsd: m.oiUsd ? Number(m.oiUsd) : null,
          liq24hUsd: m.liq24hUsd ? Number(m.liq24hUsd) : null,
          stableUsdtUsdcUsd: m.stableUsdtUsdcUsd ? Number(m.stableUsdtUsdcUsd) : null,
        } : null;
        
        const currentCrypto = {
          funding: cryptoMetrics.funding,
          oiUsd: cryptoMetrics.oiUsd,
          liq24hUsd: cryptoMetrics.liq24hUsd,
          stableUsdtUsdcUsd: cryptoMetrics.stableUsdtUsdcUsd,
        };
        
        const cryptoTrends = calculateCryptoTrends(currentCrypto, toMetrics(d1), toMetrics(d7), toMetrics(d30));
        
        // 构建AI分析输入
        const aiInput = {
          snapshots: reportData.snapshots.map(s => ({
            indicator: s.indicator,
            displayName: s.displayName,
            latestValue: s.latestValue,
            change1d: s.change1d,
            change7d: s.change7d,
            change30d: s.change30d,
            ma20: s.ma20,
            aboveMa20: s.aboveMa20,
            sparklineData: s.sparklineData,
          })),
          cryptoTrends,
          currentRegime: reportData.regime.regime,
          currentStatus: reportData.regime.status,
          previousRegime: lastReport?.regime || null,
          triggeredRules: reportData.regime.triggeredRules,
          untriggeredRules: reportData.regime.untriggeredRules,
          switches: reportData.switches,
        };
        
        const aiAnalysis = await generateAIAnalysis(aiInput);
        await updateReportAIAnalysis(reportId, {
          conclusion: aiAnalysis.summary,
          evidenceChain: aiAnalysis.evidenceChain,
          leverageJudgment: aiAnalysis.leverageJudgment,
          switchRationale: {
            margin: aiAnalysis.switchRationale.marginBorrow,
            put: aiAnalysis.switchRationale.putSelling,
            spot: aiAnalysis.switchRationale.spotPace,
          },
          riskAlerts: aiAnalysis.riskAlerts,
          fullText: aiAnalysis.fullAnalysis,
          generatedAt: Date.now(),
        });
        console.log("[Scheduler] AI analysis saved to database");
      } catch (aiError) {
        console.error("[Scheduler] AI analysis failed:", aiError);
      }
    }
    
    // 抓取ETF Flow数据
    const etfEnabled = await isEtfFlowEnabled();
    if (etfEnabled) {
      console.log("[Scheduler] Fetching ETF flow data...");
      try {
        const etfResult = await runEtfFlowFetch();
        if (etfResult.success) {
          console.log(`[Scheduler] ETF flow data: ${etfResult.message}`);
        } else {
          console.warn(`[Scheduler] ETF flow fetch failed: ${etfResult.message}`);
        }
      } catch (etfError) {
        console.error("[Scheduler] ETF flow fetch error:", etfError);
      }
    }
    
    const duration = Date.now() - startTime;
    console.log(`[Scheduler] Report generation completed in ${duration}ms`);
    console.log(`[Scheduler] Report ID: ${reportId}, Date: ${reportDate}`);
    console.log(`[Scheduler] Regime: ${reportData.regime.regime}, Status: ${reportData.regime.status}`);
    
  } catch (error) {
    console.error("[Scheduler] Report generation failed:", error);
    throw error;
  }
}

/**
 * 初始化定时任务
 * 每天北京时间9点执行
 * 使用 timezone 选项直接指定北京时区
 */
export function initScheduler(): void {
  // Cron格式：分 时 日 月 周（node-cron 默认5字段格式）
  const cronExpression = "0 9 * * *"; // 每天9:00
  
  console.log("[Scheduler] Initializing scheduled task...");
  console.log("[Scheduler] Cron expression:", cronExpression);
  console.log("[Scheduler] Schedule: Daily at 09:00 Beijing Time (Asia/Shanghai)");
  
  const task = cron.schedule(cronExpression, async () => {
    console.log("[Scheduler] Triggered at", new Date().toISOString());
    
    // 检查是否启用定时任务
    const isEnabled = await getSystemSetting("schedule_enabled");
    if (isEnabled === "false") {
      console.log("[Scheduler] Scheduled task is disabled, skipping...");
      return;
    }
    
    try {
      await generateScheduledReport();
    } catch (error) {
      console.error("[Scheduler] Scheduled task failed:", error);
    }
  }, {
    timezone: "Asia/Shanghai" // 使用北京时区
  });
  
  task.start();
  console.log("[Scheduler] Scheduled task started successfully");
}

/**
 * 手动触发报告生成（用于测试）
 */
export async function triggerManualReport(): Promise<void> {
  console.log("[Scheduler] Manual trigger requested");
  await generateScheduledReport();
}
