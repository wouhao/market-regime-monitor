import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, FileText, Copy, Activity, Shield, Zap, CheckCircle2, XCircle } from "lucide-react";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";
import { useReportByDate } from "@/hooks/useGitHubReport";

const regimeConfig = {
  risk_on: { label: "Risk-On", emoji: "🟢", color: "text-green-400" },
  risk_off: { label: "Risk-Off", emoji: "🔴", color: "text-red-400" },
  base: { label: "Base", emoji: "🟡", color: "text-yellow-400" },
};

const switchLabels: Record<string, string> = {
  marginBorrow: "保证金借款 (Margin Borrow)",
  putSelling: "卖Put策略 (Put Selling)",
  spotPace: "现货节奏 (Spot Pace)",
};

export default function ReportDetail() {
  // 路由参数现在是日期而不是数据库ID
  const params = useParams<{ id: string }>();
  const date = params.id; // 实际上是日期字符串，如 "2026-02-28"
  const [, setLocation] = useLocation();
  
  // 从 GitHub Pages 获取指定日期的报告
  const { data: report, isLoading, error } = useReportByDate(date);

  const handleCopyJson = () => {
    if (report) {
      navigator.clipboard.writeText(JSON.stringify(report, null, 2));
      toast.success("JSON内容已复制到剪贴板");
    }
  };

  if (isLoading) {
    return <ReportDetailSkeleton />;
  }

  if (!report || error) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => setLocation("/history")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          返回历史
        </Button>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">报告不存在</h3>
            <p className="text-muted-foreground text-center">
              未找到 {date} 的报告
              {error && <span className="block mt-1 text-red-400">{error}</span>}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const regime = regimeConfig[report.regime.regime as keyof typeof regimeConfig];

  return (
    <div className="space-y-6">
      {/* 顶部导航 */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => setLocation("/history")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          返回历史
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleCopyJson}>
            <Copy className="h-4 w-4 mr-2" />
            复制JSON
          </Button>
        </div>
      </div>

      {/* 报告元信息 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {report.date} 市场日报
            </CardTitle>
            <Badge variant={report.regime.status === "confirmed" ? "default" : "secondary"}>
              {report.regime.status === "confirmed" ? "已确认" : "观察中"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-4">
            <div>
              <div className="text-sm text-muted-foreground">情景</div>
              <div className="font-medium mt-1 flex items-center gap-2">
                <span>{regime?.emoji}</span>
                <span className={regime?.color}>{regime?.label}</span>
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">置信度</div>
              <div className="font-medium mt-1">{Number(report.regime.confidence).toFixed(0)}%</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">数据质量</div>
              <div className="font-medium mt-1">{report.dataQuality.score}%</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">生成时间</div>
              <div className="font-medium mt-1">
                {report.generatedAtBJT || new Date(report.generatedAt).toLocaleString("zh-CN")}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

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
            {Object.entries(report.switches).map(([key, value]) => (
              <div 
                key={key}
                className="flex items-center justify-between p-4 rounded-lg bg-muted/50"
              >
                <div className="font-medium text-sm">{switchLabels[key] || key}</div>
                <Badge>{(value as string).toUpperCase()}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 判定规则 */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-400 text-base">
              <CheckCircle2 className="h-5 w-5" />
              触发的规则
            </CardTitle>
          </CardHeader>
          <CardContent>
            {report.regime.triggeredRules.length > 0 ? (
              <ul className="space-y-2">
                {report.regime.triggeredRules.map((rule, i) => (
                  <li key={i} className="flex items-start gap-2 p-2 rounded bg-green-500/10 text-sm">
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

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-muted-foreground text-base">
              <XCircle className="h-5 w-5" />
              未触发的规则
            </CardTitle>
          </CardHeader>
          <CardContent>
            {report.regime.untriggeredRules.length > 0 ? (
              <ul className="space-y-2">
                {report.regime.untriggeredRules.map((rule, i) => (
                  <li key={i} className="flex items-start gap-2 p-2 rounded bg-muted/50 text-sm">
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

      {/* 市场快照 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
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
                </tr>
              </thead>
              <tbody>
                {report.snapshots.map((snapshot, index) => (
                  <tr key={index} className="border-b border-border/50">
                    <td className="py-3 px-2">
                      <div className="font-medium">{snapshot.displayName}</div>
                      <div className="text-xs text-muted-foreground">{snapshot.indicator}</div>
                    </td>
                    <td className="text-right py-3 px-2 font-mono">
                      {snapshot.latestValue !== null ? String(snapshot.latestValue) : <span className="text-yellow-500">--</span>}
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* BTC 分析 */}
      {report.btcAnalysis && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              BTC 市场分析
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="p-3 rounded-lg bg-muted/30">
                <div className="text-xs text-muted-foreground mb-1">状态</div>
                <div className="font-semibold">{report.btcAnalysis.state}</div>
              </div>
              <div className="p-3 rounded-lg bg-muted/30">
                <div className="text-xs text-muted-foreground mb-1">流动性</div>
                <div className="font-semibold">{report.btcAnalysis.liquidityTag}</div>
              </div>
              <div className="p-3 rounded-lg bg-muted/30">
                <div className="text-xs text-muted-foreground mb-1">置信度</div>
                <div className="font-semibold">{report.btcAnalysis.confidence}</div>
              </div>
            </div>
            {report.btcAnalysis.stateReasons && report.btcAnalysis.stateReasons.length > 0 && (
              <div className="mt-4">
                <div className="text-xs text-muted-foreground mb-2">判定原因</div>
                <ul className="space-y-1">
                  {report.btcAnalysis.stateReasons.map((reason, i) => (
                    <li key={i} className="text-sm text-muted-foreground">• {reason}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

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

function ReportDetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-9 w-24" />
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i}>
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-5 w-24 mt-1" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-96 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}
