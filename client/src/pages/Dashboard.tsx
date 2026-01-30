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
  ExternalLink
} from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

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
  "crypto_funding": { name: "BTC Funding Rate", source: "CoinGlass", url: "https://www.coinglass.com/zh/pricing", description: "需要CoinGlass API Key（付费）" },
  "crypto_oi": { name: "BTC Open Interest", source: "CoinGlass", url: "https://www.coinglass.com/zh/pricing", description: "需要CoinGlass API Key（付费）" },
  "stablecoin": { name: "Stablecoin Supply", source: "DefiLlama", url: "", description: "免费，无需API Key" },
};

export default function Dashboard() {
  const [isGenerating, setIsGenerating] = useState(false);
  
  const { data: latestData, isLoading, refetch } = trpc.market.getLatest.useQuery();
  const generateMutation = trpc.market.generate.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success("报告生成成功", {
          description: `情景: ${result.data?.regime?.toUpperCase()}, 数据质量: ${result.data?.dataQuality}%`,
        });
        refetch();
      } else {
        toast.error("报告生成失败", { description: result.message });
      }
      setIsGenerating(false);
    },
    onError: (error) => {
      toast.error("报告生成失败", { description: error.message });
      setIsGenerating(false);
    },
  });

  const handleGenerate = () => {
    setIsGenerating(true);
    generateMutation.mutate();
  };

  const handleRefresh = () => {
    refetch();
    toast.info("数据已刷新");
  };

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  const report = latestData?.data;
  const regime = report?.regime ? regimeConfig[report.regime as keyof typeof regimeConfig] : null;
  
  // 计算缺失的数据指标
  const snapshots = report?.snapshots as any[] || [];
  const missingIndicators = snapshots.filter(s => s.latestValue === null);
  const validIndicators = snapshots.filter(s => s.latestValue !== null);

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
            onClick={handleGenerate}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                生成中...
              </>
            ) : (
              <>
                <Activity className="h-4 w-4 mr-2" />
                生成报告
              </>
            )}
          </Button>
        </div>
      </div>

      {!report ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <BarChart3 className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">暂无报告数据</h3>
            <p className="text-muted-foreground text-center mb-4">
              点击"生成报告"按钮获取最新市场状态分析
            </p>
            <Button onClick={handleGenerate} disabled={isGenerating}>
              {isGenerating ? "生成中..." : "立即生成"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
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
                      <Badge variant={report.status === "confirmed" ? "default" : "secondary"}>
                        {report.status === "confirmed" ? "已确认" : "观察中"}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        置信度 {Number(report.confidence).toFixed(0)}%
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
                    {Number(report.dataQuality).toFixed(0)}
                  </span>
                  <span className="text-muted-foreground">/ 100</span>
                </div>
                <Progress 
                  value={Number(report.dataQuality)} 
                  className="mt-3 h-2"
                />
                <p className="text-sm text-muted-foreground mt-2">
                  {validIndicators.length}/{snapshots.length} 指标有效
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
                <div className="text-2xl font-bold">{report.reportDate}</div>
                <p className="text-sm text-muted-foreground mt-1">
                  生成时间: {new Date(report.createdAt).toLocaleString("zh-CN")}
                </p>
                <div className="flex items-center gap-2 mt-3">
                  <Badge variant="outline">
                    下次更新: 明日 09:00
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 缺失数据提示 - 仅在有缺失时显示 */}
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
                  以下 {missingIndicators.length} 项数据未能获取，请检查对应的 API Key 配置：
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

          {/* 市场快照 - 移到执行开关上方 */}
          {report.snapshots && (report.snapshots as any[]).length > 0 && (
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
                      {(report.snapshots as any[]).map((snapshot, index) => (
                        <tr key={index} className="border-b border-border/50">
                          <td className="py-3 px-2">
                            <div className="font-medium">{snapshot.displayName}</div>
                            <div className="text-xs text-muted-foreground">{snapshot.indicator}</div>
                          </td>
                          <td className="text-right py-3 px-2 font-mono">
                            {snapshot.latestValue 
                              ? Number(snapshot.latestValue).toLocaleString(undefined, { maximumFractionDigits: 2 })
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

          {/* 执行开关 - 移到市场快照下方 */}
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
                  const value = report[key as keyof typeof report] as string;
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
                {report.triggeredRules && (report.triggeredRules as string[]).length > 0 ? (
                  <ul className="space-y-2">
                    {(report.triggeredRules as string[]).map((rule, index) => (
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
                {report.untriggeredRules && (report.untriggeredRules as string[]).length > 0 ? (
                  <ul className="space-y-2">
                    {(report.untriggeredRules as string[]).map((rule, index) => (
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
        </>
      )}
    </div>
  );
}

// 变化率单元格组件
function ChangeCell({ value }: { value: string | null }) {
  if (!value) return <span className="text-muted-foreground">--</span>;
  
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
