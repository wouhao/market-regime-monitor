import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { 
  RefreshCw, 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Activity,
  Shield,
  Zap,
  BarChart3,
  AlertCircle,
  ExternalLink,
  Brain,
  Sparkles,
  AlertOctagon,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Info
} from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { Streamdown } from "streamdown";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend
} from "recharts";
import { useLatestReport, type MarketReport } from "@/hooks/useGitHubReport";

// 清理Markdown格式标记和冗余前缀
function cleanMarkdown(text: string): string {
  if (!text) return text;
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')  // 移除加粗
    .replace(/\*([^*]+)\*/g, '$1')      // 移除斜体
    .replace(/`([^`]+)`/g, '$1')        // 移除代码标记
    .replace(/^[-•]\s*/gm, '')          // 移除列表标记
    // 清理执行开关的冗余前缀
    .replace(/\[IBKR\]\s*/gi, '')
    .replace(/\[US Equities\]\s*/gi, '')
    .replace(/Margin-loan\s*\([^)]+\):\s*/gi, '')
    .replace(/Put-selling\s*\([^)]+\):\s*/gi, '')
    .replace(/Spot pacing:\s*/gi, '')
    .replace(/^(Allowed|Pause|Helper|Main|Fast|Medium|Slow)\s*-\s*/i, '')
    .trim();
}

// 指标值格式化函数
function formatIndicatorValue(indicator: string, value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "--";
  }
  if (indicator === "crypto_funding") {
    return `${value.toFixed(6)}%`;
  }
  if (indicator === "crypto_liquidations") {
    if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    return `$${value.toLocaleString()}`;
  }
  if (indicator === "crypto_oi") {
    if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    return `$${value.toLocaleString()}`;
  }
  if (indicator === "stablecoin") {
    if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    return `$${value.toLocaleString()}`;
  }
  return value.toFixed(2);
}

// 情景状态映射
const regimeConfig = {
  risk_on: {
    label: "Risk-On",
    emoji: "🟢",
    color: "text-green-400",
    bgClass: "regime-risk-on",
    description: "市场处于风险偏好状态",
  },
  risk_off: {
    label: "Risk-Off", 
    emoji: "🔴",
    color: "text-red-400",
    bgClass: "regime-risk-off",
    description: "市场处于风险规避状态",
  },
  base: {
    label: "Base",
    emoji: "🟡",
    color: "text-yellow-400",
    bgClass: "regime-base",
    description: "市场处于中性状态",
  },
};

// 开关状态映射
const switchLabels: Record<string, { label: string; description: string }> = {
  marginBorrow: { label: "保证金借款", description: "Margin Borrow" },
  putSelling: { label: "卖Put策略", description: "Put Selling" },
  spotPace: { label: "现货节奏", description: "Spot Pace" },
};

const switchStatusConfig: Record<string, { label: string; className: string }> = {
  allowed: { label: "允许", className: "switch-allowed" },
  forbidden: { label: "禁止", className: "switch-forbidden" },
  helper: { label: "辅助", className: "switch-helper" },
  aggressive: { label: "激进", className: "switch-aggressive" },
  pause: { label: "暂停", className: "switch-pause" },
  medium: { label: "中等", className: "switch-medium" },
  fast: { label: "快速", className: "switch-fast" },
};

// 数据源信息配置
const dataSourceInfo: Record<string, { name: string; source: string; url: string; description: string }> = {
  "BTC-USD": { name: "Bitcoin", source: "Yahoo Finance", url: "", description: "免费，无需API Key" },
  "QQQ": { name: "Nasdaq-100 ETF", source: "Yahoo Finance", url: "", description: "免费，无需API Key" },
  "GLD": { name: "SPDR Gold", source: "Yahoo Finance", url: "", description: "免费，无需API Key" },
  "DGS10": { name: "10Y Treasury", source: "FRED", url: "https://fred.stlouisfed.org/docs/api/", description: "需要FRED API Key（免费）" },
  "VIXCLS": { name: "VIX Index", source: "FRED", url: "https://fred.stlouisfed.org/docs/api/", description: "需要FRED API Key（免费）" },
  "DFII10": { name: "10Y Real Yield", source: "FRED", url: "https://fred.stlouisfed.org/docs/api/", description: "需要FRED API Key（免费）" },
  "BAMLH0A0HYM2": { name: "HY OAS", source: "FRED", url: "https://fred.stlouisfed.org/docs/api/", description: "需要FRED API Key（免费）" },
  "crypto_funding": { name: "BTC Funding Rate", source: "Binance/OKX", url: "", description: "免费，无需API Key" },
  "crypto_oi": { name: "BTC Open Interest", source: "Binance/OKX", url: "", description: "免费，无需API Key" },
  "crypto_liquidations": { name: "BTC Liquidations (24h)", source: "Coinalyze", url: "https://coinalyze.net/api/", description: "需要Coinalyze API Key" },
  "stablecoin": { name: "Stablecoin Supply", source: "DefiLlama", url: "", description: "免费，无需API Key" },
};

export default function Dashboard() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<{
    conclusion: string;
    evidenceChain: string[];
    leverageJudgment: string;
    switchRationale: { margin: string; put: string; spot: string };
    riskAlerts: string[];
    fullText: string;
    generatedAt: number;
  } | null>(null);
  
  // 从 GitHub Pages 获取最新报告
  const { data: report, isLoading, error, refetch } = useLatestReport();
  
  // AI 分析仍走 tRPC 后端
  const aiAnalysisMutation = trpc.market.generateAIAnalysis.useMutation({
    onSuccess: (result) => {
      if (result.success && result.data) {
        setAiAnalysis({
          conclusion: result.data.summary,
          evidenceChain: result.data.evidenceChain,
          leverageJudgment: result.data.leverageJudgment,
          switchRationale: {
            margin: result.data.switchRationale.marginBorrow,
            put: result.data.switchRationale.putSelling,
            spot: result.data.switchRationale.spotPace,
          },
          riskAlerts: result.data.riskAlerts,
          fullText: result.data.fullAnalysis,
          generatedAt: Date.now(),
        });
        toast.success("AI分析已生成");
      } else {
        toast.error("AI分析失败", { description: result.message });
      }
      setIsAnalyzing(false);
    },
    onError: (error) => {
      toast.error("AI分析失败", { description: error.message });
      setIsAnalyzing(false);
    },
  });
  
  const handleAIAnalysis = () => {
    setIsAnalyzing(true);
    aiAnalysisMutation.mutate();
  };

  const handleRefresh = () => {
    refetch();
    toast.info("数据已刷新");
  };

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (error || !report) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">市场状态监控</h1>
          <p className="text-muted-foreground mt-1">
            实时监控市场风险状态，自动生成执行建议
          </p>
        </div>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <BarChart3 className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">暂无报告数据</h3>
            <p className="text-muted-foreground text-center mb-4">
              {error ? `数据加载失败: ${error}` : "等待 GitHub Actions 自动生成报告"}
            </p>
            <Button onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4 mr-2" />
              重试
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 适配新的 JSON 数据结构
  const regime = regimeConfig[report.regime.regime as keyof typeof regimeConfig];
  const snapshots = report.snapshots || [];
  const missingIndicators = snapshots.filter(s => s.latestValue === null);
  const validIndicators = snapshots.filter(s => s.latestValue !== null);
  
  // 从数据库加载已保存的AI分析结果（如果有的话）
  const displayAiAnalysis = aiAnalysis;
  
  // ETF Flow 数据从 JSON 中获取
  const etfFlowData = report.etfFlow || [];
  const latestEtfFlow = etfFlowData.length > 0 ? etfFlowData[etfFlowData.length - 1] : null;
  
  // 计算 ETF Flow 滚动平均
  const etfRolling5d = etfFlowData.length >= 5
    ? etfFlowData.slice(-5).reduce((sum, d) => sum + (d.total || 0), 0) / 5
    : null;
  const etfRolling20d = etfFlowData.length >= 20
    ? etfFlowData.slice(-20).reduce((sum, d) => sum + (d.total || 0), 0) / 20
    : null;

  return (
    <div className="space-y-6">
      {/* 页面标题和操作按钮 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">市场状态监控</h1>
          <p className="text-muted-foreground mt-1">
            实时监控市场风险状态，自动生成执行建议
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            刷新
          </Button>
          <Button 
            size="sm" 
            variant="secondary"
            onClick={handleAIAnalysis}
            disabled={isAnalyzing || !report}
          >
            {isAnalyzing ? (
              <>
                <Brain className="h-4 w-4 mr-2 animate-pulse" />
                分析中...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                AI 解读
              </>
            )}
          </Button>
        </div>
      </div>

      {/* 主要状态卡片 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* 当前情景 */}
        <Card className={`regime-card ${regime?.bgClass}`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Activity className="h-4 w-4" />
              当前情景
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <span className="text-4xl">{regime?.emoji}</span>
              <div>
                <div className={`text-2xl font-bold ${regime?.color}`}>
                  {regime?.label}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant={report.regime.status === "confirmed" ? "default" : "secondary"}>
                    {report.regime.status === "confirmed" ? "已确认" : "观察中"}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    置信度 {Number(report.regime.confidence).toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-3">
              {regime?.description}
            </p>
          </CardContent>
        </Card>

        {/* 数据质量 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Shield className="h-4 w-4" />
              数据质量
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold">
                {report.dataQuality.score}
              </span>
              <span className="text-muted-foreground">/ 100</span>
            </div>
            <Progress 
              value={report.dataQuality.score} 
              className="mt-3 h-2"
            />
            <p className="text-sm text-muted-foreground mt-2">
              {report.dataQuality.valid}/{report.dataQuality.total} 指标有效
              {missingIndicators.length > 0 && (
                <span className="text-yellow-500 ml-2">
                  ({missingIndicators.length} 项缺失)
                </span>
              )}
            </p>
          </CardContent>
        </Card>

        {/* 报告时间 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" />
              报告信息
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{report.date}</div>
            <p className="text-sm text-muted-foreground mt-1">
              生成时间: {report.generatedAtBJT || new Date(report.generatedAt).toLocaleString("zh-CN")}
            </p>
            <div className="flex items-center gap-2 mt-3">
              <Badge variant="outline">
                下次更新: 明日 09:00
              </Badge>
              <Badge variant="outline" className="text-xs">
                via GitHub Actions
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 缺失数据提示 */}
      {missingIndicators.length > 0 && (
        <Card className="border-yellow-500/50 bg-yellow-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-yellow-500">
              <AlertCircle className="h-5 w-5" />
              缺失数据详情
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              以下 {missingIndicators.length} 项数据未能获取：
            </p>
            <div className="space-y-2">
              {missingIndicators.map((indicator: any, index: number) => {
                const info = dataSourceInfo[indicator.indicator];
                return (
                  <div 
                    key={index}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                  >
                    <div>
                      <div className="font-medium">{indicator.displayName}</div>
                      <div className="text-xs text-muted-foreground">
                        {indicator.indicator} · 数据源: {info?.source || "未知"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-yellow-500">
                        {info?.description || "需要配置"}
                      </span>
                      {info?.url && (
                        <a 
                          href={info.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:text-blue-300"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI 解读 */}
      {displayAiAnalysis && (
        <Card className="border-purple-500/30 bg-gradient-to-br from-purple-500/10 to-purple-900/5">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-purple-400">
                <Brain className="h-5 w-5" />
                AI 解读
              </CardTitle>
              {displayAiAnalysis.generatedAt && (
                <span className="text-xs text-muted-foreground">
                  生成于 {new Date(displayAiAnalysis.generatedAt).toLocaleString('zh-CN')}
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 核心结论 */}
            <div className="p-5 rounded-xl bg-purple-500/15 border border-purple-500/30">
              <h4 className="font-bold text-purple-300 mb-3 flex items-center gap-2 text-base">
                <Sparkles className="h-5 w-5" />
                核心结论
              </h4>
              <p className="text-base leading-relaxed text-foreground">{cleanMarkdown(displayAiAnalysis.conclusion)}</p>
            </div>
            
            {/* 证据链 */}
            {displayAiAnalysis.evidenceChain && displayAiAnalysis.evidenceChain.length > 0 && (
              <div>
                <h4 className="font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  证据链
                </h4>
                <div className="grid gap-2">
                  {displayAiAnalysis.evidenceChain.map((evidence, index) => (
                    <div key={index} className="p-3 rounded-lg bg-muted/30 border border-muted/50 text-sm leading-relaxed">
                      <span className="text-purple-400 font-bold mr-2">{index + 1}.</span>
                      {cleanMarkdown(evidence)}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* 杠杆/流动性判定 */}
            {displayAiAnalysis.leverageJudgment && (
              <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <h4 className="font-semibold text-blue-400 mb-2 text-sm">杠杆/流动性判定</h4>
                <p className="text-sm leading-relaxed">{cleanMarkdown(displayAiAnalysis.leverageJudgment)}</p>
              </div>
            )}
            
            {/* 执行开关建议 */}
            {displayAiAnalysis.switchRationale && (
              <div>
                <h4 className="font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  执行开关建议
                </h4>
                <div className="overflow-hidden rounded-lg border border-muted/50">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/30">
                        <th className="text-left py-3 px-4 font-semibold w-24">开关</th>
                        <th className="text-left py-3 px-4 font-semibold">建议理由</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayAiAnalysis.switchRationale.margin && (
                        <tr className="border-t border-muted/30">
                          <td className="py-3 px-4">
                            <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/30">Margin</Badge>
                          </td>
                          <td className="py-3 px-4 text-muted-foreground leading-relaxed">{cleanMarkdown(displayAiAnalysis.switchRationale.margin)}</td>
                        </tr>
                      )}
                      {displayAiAnalysis.switchRationale.put && (
                        <tr className="border-t border-muted/30">
                          <td className="py-3 px-4">
                            <Badge variant="outline" className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30">Put</Badge>
                          </td>
                          <td className="py-3 px-4 text-muted-foreground leading-relaxed">{cleanMarkdown(displayAiAnalysis.switchRationale.put)}</td>
                        </tr>
                      )}
                      {displayAiAnalysis.switchRationale.spot && (
                        <tr className="border-t border-muted/30">
                          <td className="py-3 px-4">
                            <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/30">Spot</Badge>
                          </td>
                          <td className="py-3 px-4 text-muted-foreground leading-relaxed">{cleanMarkdown(displayAiAnalysis.switchRationale.spot)}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            
            {/* 风险提示 */}
            {displayAiAnalysis.riskAlerts && displayAiAnalysis.riskAlerts.length > 0 && (
              <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30">
                <h4 className="font-semibold text-red-400 mb-3 flex items-center gap-2">
                  <AlertOctagon className="h-4 w-4" />
                  风险提示
                </h4>
                <div className="space-y-2">
                  {displayAiAnalysis.riskAlerts.map((alert, index) => (
                    <div key={index} className="flex items-start gap-3 text-sm text-red-300">
                      <span className="text-red-400">⚠️</span>
                      <span className="leading-relaxed">{cleanMarkdown(alert)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 市场快照 */}
      {snapshots.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              市场快照
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-2 font-medium">指标</th>
                    <th className="text-right py-3 px-2 font-medium">最新值</th>
                    <th className="text-right py-3 px-2 font-medium">1D</th>
                    <th className="text-right py-3 px-2 font-medium">7D</th>
                    <th className="text-right py-3 px-2 font-medium">30D</th>
                    <th className="text-center py-3 px-2 font-medium">MA20</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshots.map((snapshot, index) => (
                    <tr key={index} className="border-b border-border/50">
                      <td className="py-3 px-2">
                        <div className="font-medium">{snapshot.displayName}</div>
                        <div className="text-xs text-muted-foreground">{snapshot.indicator}</div>
                      </td>
                      <td className="text-right py-3 px-2 font-mono">
                        {snapshot.latestValue !== null && snapshot.latestValue !== undefined
                          ? formatIndicatorValue(snapshot.indicator, Number(snapshot.latestValue))
                          : <span className="text-yellow-500">--</span>}
                      </td>
                      <td className="text-right py-3 px-2">
                        <ChangeCell value={snapshot.change1d} />
                      </td>
                      <td className="text-right py-3 px-2">
                        <ChangeCell value={snapshot.change7d} />
                      </td>
                      <td className="text-right py-3 px-2">
                        <ChangeCell value={snapshot.change30d} />
                      </td>
                      <td className="text-center py-3 px-2">
                        {snapshot.aboveMa20 === true ? (
                          <TrendingUp className="h-4 w-4 text-green-400 inline" />
                        ) : snapshot.aboveMa20 === false ? (
                          <TrendingDown className="h-4 w-4 text-red-400 inline" />
                        ) : (
                          <span className="text-muted-foreground">--</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* BTC ETF Flow 卡片 */}
      {latestEtfFlow && (
        <EtfFlowCard 
          data={{
            date: latestEtfFlow.date,
            total: latestEtfFlow.total,
            ibit: latestEtfFlow.ibit,
            fbtc: latestEtfFlow.fbtc,
            gbtc: latestEtfFlow.gbtc,
            totalExGbtc: latestEtfFlow.total !== null && latestEtfFlow.gbtc !== null
              ? latestEtfFlow.total - latestEtfFlow.gbtc : null,
            rolling5d: etfRolling5d,
            rolling20d: etfRolling20d,
          }}
          chartData={etfFlowData.map(d => ({
            date: d.date,
            total: d.total,
            rolling5d: null,
            rolling20d: null,
          }))}
        />
      )}

      {/* BTC 市场分析卡片 */}
      {report.btcAnalysis && (
        <BtcAnalysisCard 
          btcState={report.btcAnalysis.state}
          btcLiquidityTag={report.btcAnalysis.liquidityTag}
          btcConfidence={report.btcAnalysis.confidence}
          btcEvidenceJson={report.btcAnalysis.evidence}
        />
      )}

      {/* 执行开关 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            执行开关
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            {Object.entries(switchLabels).map(([key, config]) => {
              const value = report.switches[key as keyof typeof report.switches] as string;
              const statusConfig = switchStatusConfig[value] || { label: value, className: "" };
              return (
                <div 
                  key={key}
                  className="flex items-center justify-between p-4 rounded-lg bg-muted/50"
                >
                  <div>
                    <div className="font-medium">{config.label}</div>
                    <div className="text-xs text-muted-foreground">{config.description}</div>
                  </div>
                  <Badge className={statusConfig.className}>
                    {statusConfig.label.toUpperCase()}
                  </Badge>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* 判定规则 */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* 触发的规则 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-400">
              <CheckCircle2 className="h-5 w-5" />
              触发的规则
            </CardTitle>
          </CardHeader>
          <CardContent>
            {report.regime.triggeredRules && report.regime.triggeredRules.length > 0 ? (
              <ul className="space-y-2">
                {report.regime.triggeredRules.map((rule, index) => (
                  <li 
                    key={index}
                    className="flex items-start gap-2 p-2 rounded bg-green-500/10 text-sm"
                  >
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <span>{rule}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm">无触发规则</p>
            )}
          </CardContent>
        </Card>

        {/* 未触发的规则 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-muted-foreground">
              <XCircle className="h-5 w-5" />
              未触发的规则
            </CardTitle>
          </CardHeader>
          <CardContent>
            {report.regime.untriggeredRules && report.regime.untriggeredRules.length > 0 ? (
              <ul className="space-y-2">
                {report.regime.untriggeredRules.map((rule, index) => (
                  <li 
                    key={index}
                    className="flex items-start gap-2 p-2 rounded bg-muted/50 text-sm"
                  >
                    <XCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <span className="text-muted-foreground">{rule}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm">所有规则已触发</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// 变化率单元格组件
function ChangeCell({ value }: { value: number | null }) {
  if (!value && value !== 0) return <span className="text-muted-foreground">--</span>;
  
  const numValue = Number(value);
  const isPositive = numValue >= 0;
  
  return (
    <span className={`font-mono ${isPositive ? "text-green-400" : "text-red-400"}`}>
      {isPositive ? "+" : ""}{numValue.toFixed(2)}%
    </span>
  );
}

// 骨架屏组件
function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-24" />
        </div>
      </div>
      
      <div className="grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-4 w-full mt-3" />
            </CardContent>
          </Card>
        ))}
      </div>
      
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


// ETF Flow 数据类型
interface EtfFlowData {
  date: string;
  total: number | null;
  ibit: number | null;
  fbtc: number | null;
  gbtc: number | null;
  totalExGbtc?: number | null;
  totalExGbtcReason?: string;
  rolling5d?: number | null;
  rolling5dReason?: string;
  rolling20d?: number | null;
  rolling20dReason?: string;
  alert?: string;
}

// ETF Flow 图表数据类型
interface EtfFlowChartData {
  date: string;
  total: number | null;
  rolling5d: number | null;
  rolling20d: number | null;
}

// ETF Flow 卡片组件
function EtfFlowCard({ 
  data, 
  chartData,
}: { 
  data: EtfFlowData; 
  chartData: EtfFlowChartData[];
}) {
  const formatAmount = (value: number | null | undefined) => {
    if (value === null || value === undefined) return "--";
    const sign = value >= 0 ? "+" : "";
    return `${sign}${value.toFixed(1)}`;
  };
  
  const today = new Date().toISOString().split("T")[0];
  const isStaleData = data.date !== today;
  
  const getFlowStatus = (value: number | null) => {
    if (value === null) return { label: "N/A", color: "text-muted-foreground", icon: null };
    if (value > 0) return { label: "净流入", color: "text-green-400", icon: ArrowUpRight };
    if (value < 0) return { label: "净流出", color: "text-red-400", icon: ArrowDownRight };
    return { label: "持平", color: "text-muted-foreground", icon: null };
  };
  
  const totalStatus = getFlowStatus(data.total);
  
  return (
    <Card className="border-blue-500/30 bg-gradient-to-br from-blue-500/5 to-blue-900/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-blue-400">
            <Wallet className="h-5 w-5" />
            BTC Spot ETF Flow
            <Badge variant="outline" className="ml-2 text-xs font-normal">
              参考指标
            </Badge>
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            {data.date}
            {isStaleData && (
              <span className="ml-1 text-yellow-500">(非交易日)</span>
            )}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 主要数据展示 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-3 rounded-lg bg-muted/30 border border-muted/50">
            <div className="text-xs text-muted-foreground mb-1">Total Net Flow</div>
            <div className={`text-xl font-bold ${totalStatus.color} flex items-center gap-1`}>
              {formatAmount(data.total)}
              <span className="text-xs font-normal">US$m</span>
              {totalStatus.icon && <totalStatus.icon className="h-4 w-4" />}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {totalStatus.label}
            </div>
          </div>
          
          <div className="p-3 rounded-lg bg-muted/30 border border-muted/50">
            <div className="text-xs text-muted-foreground mb-1">IBIT (BlackRock)</div>
            <div className={`text-xl font-bold ${data.ibit !== null && data.ibit >= 0 ? "text-green-400" : "text-red-400"}`}>
              {formatAmount(data.ibit)}
              <span className="text-xs font-normal ml-1">US$m</span>
            </div>
          </div>
          
          <div className="p-3 rounded-lg bg-muted/30 border border-muted/50">
            <div className="text-xs text-muted-foreground mb-1">FBTC (Fidelity)</div>
            <div className={`text-xl font-bold ${data.fbtc !== null && data.fbtc >= 0 ? "text-green-400" : "text-red-400"}`}>
              {formatAmount(data.fbtc)}
              <span className="text-xs font-normal ml-1">US$m</span>
            </div>
          </div>
          
          <div className="p-3 rounded-lg bg-muted/30 border border-muted/50">
            <div className="text-xs text-muted-foreground mb-1">GBTC (Grayscale)</div>
            <div className={`text-xl font-bold ${data.gbtc !== null && data.gbtc >= 0 ? "text-green-400" : "text-red-400"}`}>
              {formatAmount(data.gbtc)}
              <span className="text-xs font-normal ml-1">US$m</span>
            </div>
          </div>
        </div>
        
        {/* 滚动平均 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <div className="text-xs text-blue-400 mb-1 flex items-center gap-1">
              Total ex GBTC
              <Info className="h-3 w-3" />
            </div>
            <div className={`text-lg font-bold ${data.totalExGbtc !== null && data.totalExGbtc !== undefined && data.totalExGbtc >= 0 ? "text-green-400" : "text-red-400"}`}>
              {data.totalExGbtc !== null && data.totalExGbtc !== undefined ? formatAmount(data.totalExGbtc) : "--"}
              <span className="text-xs font-normal ml-1">US$m</span>
            </div>
          </div>
          
          <div className="p-3 rounded-lg bg-muted/30 border border-muted/50">
            <div className="text-xs text-muted-foreground mb-1">5D Rolling Avg</div>
            <div className={`text-lg font-bold ${data.rolling5d !== null && data.rolling5d !== undefined && data.rolling5d >= 0 ? "text-green-400" : "text-red-400"}`}>
              {data.rolling5d !== null && data.rolling5d !== undefined ? formatAmount(data.rolling5d) : "--"}
              <span className="text-xs font-normal ml-1">US$m</span>
            </div>
          </div>
          
          <div className="p-3 rounded-lg bg-muted/30 border border-muted/50">
            <div className="text-xs text-muted-foreground mb-1">20D Rolling Avg</div>
            <div className={`text-lg font-bold ${data.rolling20d !== null && data.rolling20d !== undefined && data.rolling20d >= 0 ? "text-green-400" : "text-red-400"}`}>
              {data.rolling20d !== null && data.rolling20d !== undefined ? formatAmount(data.rolling20d) : "--"}
              <span className="text-xs font-normal ml-1">US$m</span>
            </div>
          </div>
        </div>
        
        {/* 30天趋势图表 */}
        {chartData.length > 0 && (
          <div className="pt-4 border-t border-muted/30">
            <div className="text-xs text-muted-foreground mb-3 flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              30天资金流向趋势
            </div>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData}
                  margin={{ top: 5, right: 5, left: -20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" opacity={0.3} />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 10, fill: '#888' }}
                    tickFormatter={(value) => {
                      const date = new Date(value);
                      return `${date.getMonth() + 1}/${date.getDate()}`;
                    }}
                    interval="preserveStartEnd"
                  />
                  <YAxis 
                    tick={{ fontSize: 10, fill: '#888' }}
                    tickFormatter={(value) => `${value > 0 ? '+' : ''}${value.toFixed(0)}`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1a1a2e',
                      border: '1px solid #333',
                      borderRadius: '8px',
                      fontSize: '12px'
                    }}
                    labelFormatter={(value) => `日期: ${value}`}
                    formatter={(value: any, name: string) => {
                      if (value === null || value === undefined) return ['--', name];
                      const numValue = Number(value);
                      const label = name === 'total' ? 'Total Net Flow' : 
                                   name === 'rolling5d' ? '5D Rolling' : '20D Rolling';
                      return [`${numValue > 0 ? '+' : ''}${numValue.toFixed(1)} US$m`, label];
                    }}
                  />
                  <ReferenceLine y={0} stroke="#666" strokeDasharray="3 3" />
                  <Legend 
                    verticalAlign="top" 
                    height={36}
                    formatter={(value: string) => {
                      const labels: Record<string, string> = {
                        total: 'Total Net Flow',
                        rolling5d: '5D Rolling',
                        rolling20d: '20D Rolling'
                      };
                      return <span style={{ fontSize: '11px', color: '#888' }}>{labels[value] || value}</span>;
                    }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="total" 
                    stroke="#3b82f6" 
                    strokeWidth={2}
                    dot={{ r: 2, fill: '#3b82f6' }}
                    activeDot={{ r: 4, fill: '#3b82f6' }}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
        
        {/* 数据来源说明 */}
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-muted/30">
          <span>数据来源: Farside Investors</span>
          <a 
            href="https://farside.co.uk/bitcoin-etf-flow-all-data/" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 flex items-center gap-1"
          >
            查看完整数据 <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </CardContent>
    </Card>
  );
}


// BTC 市场分析证据链类型
interface BtcEvidence {
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
}

// BTC 市场分析卡片组件
function BtcAnalysisCard({ 
  btcState, 
  btcLiquidityTag, 
  btcConfidence, 
  btcEvidenceJson 
}: { 
  btcState: string;
  btcLiquidityTag: string | null;
  btcConfidence: string | null;
  btcEvidenceJson: BtcEvidence | null;
}) {
  const stateConfig: Record<string, { label: string; description: string; color: string; bgColor: string }> = {
    S1: { 
      label: "S1 杠杆堆积", 
      description: "OI上升 + Funding偏正 + 价格上行",
      color: "text-orange-400",
      bgColor: "from-orange-500/10 to-orange-900/10 border-orange-500/30"
    },
    S2: { 
      label: "S2 去杠杆/出清", 
      description: "价格下跌 + OI下降 + 清算上升",
      color: "text-red-400",
      bgColor: "from-red-500/10 to-red-900/10 border-red-500/30"
    },
    S3: { 
      label: "S3 低杠杆修复", 
      description: "价格回升 + OI平稳 + 清算回落",
      color: "text-green-400",
      bgColor: "from-green-500/10 to-green-900/10 border-green-500/30"
    },
    S4: { 
      label: "S4 中性/混合", 
      description: "未满足明确状态条件",
      color: "text-gray-400",
      bgColor: "from-gray-500/10 to-gray-900/10 border-gray-500/30"
    },
  };

  const liquidityConfig: Record<string, { label: string; color: string }> = {
    Expanding: { label: "流动性扩张", color: "text-green-400" },
    Contracting: { label: "流动性收缩", color: "text-red-400" },
    Unknown: { label: "流动性未知", color: "text-gray-400" },
  };

  const state = stateConfig[btcState] || stateConfig.S4;
  const liquidity = liquidityConfig[btcLiquidityTag || "Unknown"] || liquidityConfig.Unknown;
  const confidence = btcConfidence || "watch";
  const evidence = btcEvidenceJson;

  const formatPrice = (value: number | null) => {
    if (value === null) return "missing";
    return `$${value.toLocaleString()}`;
  };

  const formatPct = (value: number | null) => {
    if (value === null) return "missing";
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
  };

  const formatOi = (value: number | null) => {
    if (value === null) return "missing";
    return `$${(value / 1e9).toFixed(2)}B`;
  };

  const formatFunding = (value: number | null) => {
    if (value === null) return "missing";
    return `${value.toFixed(6)}%`;
  };

  const formatLiq = (value: number | null) => {
    if (value === null) return "missing";
    return `$${(value / 1e6).toFixed(1)}M`;
  };

  const formatStable = (value: number | null) => {
    if (value === null) return "missing";
    return `$${(value / 1e9).toFixed(1)}B`;
  };

  return (
    <Card className={`border bg-gradient-to-br ${state.bgColor}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className={`flex items-center gap-2 ${state.color}`}>
            <Activity className="h-5 w-5" />
            BTC 市场分析
            <Badge 
              variant="outline" 
              className={`ml-2 text-xs font-normal ${confidence === 'confirmed' ? 'border-green-500 text-green-400' : 'border-yellow-500 text-yellow-400'}`}
            >
              {confidence === 'confirmed' ? '已确认' : '观察中'}
            </Badge>
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 状态和流动性 */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="p-3 rounded-lg bg-muted/30">
            <div className="text-xs text-muted-foreground mb-1">状态</div>
            <div className={`text-lg font-semibold ${state.color}`}>{state.label}</div>
            <div className="text-xs text-muted-foreground mt-1">{state.description}</div>
          </div>
          <div className="p-3 rounded-lg bg-muted/30">
            <div className="text-xs text-muted-foreground mb-1">流动性</div>
            <div className={`text-lg font-semibold ${liquidity.color}`}>{liquidity.label}</div>
            <div className="text-xs text-muted-foreground mt-1">
              基于 Stablecoin 7D/30D 变化
            </div>
          </div>
        </div>

        {/* 证据链 */}
        {evidence && (
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              证据链
            </div>
            <div className="grid gap-2 text-sm">
              <div className="flex justify-between items-center p-2 rounded bg-muted/20">
                <span className="text-muted-foreground">Price</span>
                <span>
                  {formatPrice(evidence.price.latest)} | 
                  7D: <span className={evidence.price.pct7d !== null && evidence.price.pct7d >= 0 ? 'text-green-400' : 'text-red-400'}>
                    {formatPct(evidence.price.pct7d)}
                  </span> | 
                  30D: <span className={evidence.price.pct30d !== null && evidence.price.pct30d >= 0 ? 'text-green-400' : 'text-red-400'}>
                    {formatPct(evidence.price.pct30d)}
                  </span>
                </span>
              </div>
              
              <div className="flex justify-between items-center p-2 rounded bg-muted/20">
                <span className="text-muted-foreground">OI</span>
                <span>
                  {formatOi(evidence.oi.latest)} | 
                  7D: <span className={evidence.oi.pct7d !== null && evidence.oi.pct7d >= 0 ? 'text-green-400' : 'text-red-400'}>
                    {formatPct(evidence.oi.pct7d)}
                  </span>
                </span>
              </div>
              
              <div className="flex justify-between items-center p-2 rounded bg-muted/20">
                <span className="text-muted-foreground">Funding</span>
                <span>{formatFunding(evidence.funding.latest)}</span>
              </div>
              
              <div className="flex justify-between items-center p-2 rounded bg-muted/20">
                <span className="text-muted-foreground">Liq</span>
                <span>24h: {formatLiq(evidence.liquidations.h24)}</span>
              </div>
              
              <div className="flex justify-between items-center p-2 rounded bg-muted/20">
                <span className="text-muted-foreground">Stablecoin</span>
                <span>
                  {formatStable(evidence.stablecoin.latest)} | 
                  7D: <span className={evidence.stablecoin.pct7d !== null && evidence.stablecoin.pct7d >= 0 ? 'text-green-400' : 'text-red-400'}>
                    {formatPct(evidence.stablecoin.pct7d)}
                  </span> | 
                  30D: <span className={evidence.stablecoin.pct30d !== null && evidence.stablecoin.pct30d >= 0 ? 'text-green-400' : 'text-red-400'}>
                    {formatPct(evidence.stablecoin.pct30d)}
                  </span>
                </span>
              </div>
              
              {evidence.etfFlow && (
                <div className="flex justify-between items-center p-2 rounded bg-muted/20">
                  <span className="text-muted-foreground">ETF Flow (US$m)</span>
                  <span className="flex items-center gap-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      evidence.etfFlow.tag === 'Supportive' ? 'bg-green-500/20 text-green-400' :
                      evidence.etfFlow.tag === 'Drag' ? 'bg-red-500/20 text-red-400' :
                      'bg-gray-500/20 text-gray-400'
                    }`}>
                      {evidence.etfFlow.tag}
                    </span>
                    <span>
                      today: {evidence.etfFlow.today !== null ? `${evidence.etfFlow.today >= 0 ? '+' : ''}${evidence.etfFlow.today.toFixed(1)}` : 'N/A'} | 
                      5D: {evidence.etfFlow.rolling5d !== null ? `${evidence.etfFlow.rolling5d >= 0 ? '+' : ''}${evidence.etfFlow.rolling5d.toFixed(1)}` : 'N/A'} | 
                      20D: {evidence.etfFlow.rolling20d !== null ? `${evidence.etfFlow.rolling20d >= 0 ? '+' : ''}${evidence.etfFlow.rolling20d.toFixed(1)}` : 'N/A'}
                    </span>
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 免责声明 */}
        <div className="text-xs text-muted-foreground pt-2 border-t border-muted/30 flex items-center gap-1">
          <Info className="h-3 w-3" />
          本模块仅做市场状态描述/诊断，不构成任何投资建议
        </div>
      </CardContent>
    </Card>
  );
}
