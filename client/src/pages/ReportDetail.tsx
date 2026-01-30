import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, FileText, Download, Copy } from "lucide-react";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";
import { Streamdown } from "streamdown";

export default function ReportDetail() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  
  // 使用ID获取报告
  const { data, isLoading } = trpc.market.getById.useQuery({ 
    id: parseInt(params.id || "0", 10)
  });

  const handleCopyMarkdown = () => {
    if (data?.data?.reportContent) {
      navigator.clipboard.writeText(data.data.reportContent);
      toast.success("Markdown内容已复制到剪贴板");
    }
  };

  if (isLoading) {
    return <ReportDetailSkeleton />;
  }

  const report = data?.data;

  if (!report) {
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
              未找到 ID 为 {params.id} 的报告
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 顶部导航 */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => setLocation("/history")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          返回历史
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleCopyMarkdown}>
            <Copy className="h-4 w-4 mr-2" />
            复制Markdown
          </Button>
        </div>
      </div>

      {/* 报告元信息 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {report.reportDate} 市场日报
            </CardTitle>
            <Badge variant={report.status === "confirmed" ? "default" : "secondary"}>
              {report.status === "confirmed" ? "已确认" : "观察中"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-4">
            <div>
              <div className="text-sm text-muted-foreground">情景</div>
              <div className="font-medium mt-1">
                {report.regime === "risk_on" && "🟢 Risk-On"}
                {report.regime === "risk_off" && "🔴 Risk-Off"}
                {report.regime === "base" && "🟡 Base"}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">置信度</div>
              <div className="font-medium mt-1">{Number(report.confidence).toFixed(0)}%</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">数据质量</div>
              <div className="font-medium mt-1">{Number(report.dataQuality).toFixed(0)}%</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">生成时间</div>
              <div className="font-medium mt-1">
                {new Date(report.createdAt).toLocaleString("zh-CN")}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Markdown报告内容 */}
      {report.reportContent && (
        <Card>
          <CardHeader>
            <CardTitle>完整报告</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-invert max-w-none">
              <Streamdown>{report.reportContent}</Streamdown>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
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
