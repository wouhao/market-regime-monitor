import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { 
  Calendar,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Minus,
  FileText
} from "lucide-react";
import { useLocation } from "wouter";

const regimeConfig = {
  risk_on: { label: "Risk-On", emoji: "🟢", color: "text-green-400" },
  risk_off: { label: "Risk-Off", emoji: "🔴", color: "text-red-400" },
  base: { label: "Base", emoji: "🟡", color: "text-yellow-400" },
};

export default function History() {
  const [, setLocation] = useLocation();
  const { data, isLoading } = trpc.market.getHistory.useQuery({ limit: 30 });

  if (isLoading) {
    return <HistorySkeleton />;
  }

  const reports = data?.data || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">历史报告</h1>
        <p className="text-muted-foreground mt-1">
          查看过去30天的市场状态报告
        </p>
      </div>

      {reports.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">暂无历史报告</h3>
            <p className="text-muted-foreground text-center">
              生成报告后将在此处显示历史记录
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => {
            const regime = regimeConfig[report.regime as keyof typeof regimeConfig];
            return (
              <Card 
                key={report.id}
                className="hover:bg-muted/50 transition-colors cursor-pointer"
                onClick={() => setLocation(`/report/${report.reportDate}`)}
              >
                <CardContent className="flex items-center justify-between py-4">
                  <div className="flex items-center gap-4">
                    <div className="text-3xl">{regime?.emoji}</div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{report.reportDate}</span>
                        <Badge variant={report.status === "confirmed" ? "default" : "secondary"}>
                          {report.status === "confirmed" ? "已确认" : "观察中"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                        <span className={regime?.color}>
                          {regime?.label}
                        </span>
                        <span>置信度 {Number(report.confidence).toFixed(0)}%</span>
                        <span>数据质量 {Number(report.dataQuality).toFixed(0)}%</span>
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* 情景趋势统计 */}
      {reports.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">情景统计</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              {Object.entries(regimeConfig).map(([key, config]) => {
                const count = reports.filter(r => r.regime === key).length;
                const percentage = ((count / reports.length) * 100).toFixed(0);
                return (
                  <div 
                    key={key}
                    className="flex items-center gap-3 p-3 rounded-lg bg-muted/50"
                  >
                    <span className="text-2xl">{config.emoji}</span>
                    <div>
                      <div className={`font-medium ${config.color}`}>{config.label}</div>
                      <div className="text-sm text-muted-foreground">
                        {count} 次 ({percentage}%)
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function HistorySkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-48 mt-2" />
      </div>
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <Card key={i}>
            <CardContent className="flex items-center gap-4 py-4">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-48 mt-2" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
