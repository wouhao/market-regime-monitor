import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { 
  Settings as SettingsIcon, 
  Key, 
  Clock, 
  Save,
  CheckCircle,
  XCircle,
  Loader2,
  Eye,
  EyeOff
} from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

export default function Settings() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">系统设置</h1>
        <p className="text-muted-foreground mt-1">
          配置API密钥和定时任务
        </p>
      </div>

      <ApiConfigSection />
      <GitHubActionsSection />
    </div>
  );
}

function ApiConfigSection() {
  const [fredKey, setFredKey] = useState("");
  const [coinalyzeKey, setCoinalyzeKey] = useState("");
  const [showFredKey, setShowFredKey] = useState(false);
  const [showCoinalyzeKey, setShowCoinalyzeKey] = useState(false);
  const [savingFred, setSavingFred] = useState(false);
  const [savingCoinalyze, setSavingCoinalyze] = useState(false);

  const { data: configData, isLoading, refetch } = trpc.config.getAll.useQuery();
  const saveMutation = trpc.config.save.useMutation();
  const testMutation = trpc.config.test.useMutation();

  const configs = configData?.data || [];
  const fredConfig = configs.find(c => c.key === "FRED_API_KEY");
  const coinalyzeConfig = configs.find(c => c.key === "COINALYZE_API_KEY");

  const handleSaveFred = async () => {
    if (!fredKey.trim()) {
      toast.error("请输入FRED API Key");
      return;
    }
    setSavingFred(true);
    try {
      await saveMutation.mutateAsync({ key: "FRED_API_KEY", value: fredKey });
      toast.success("FRED API Key 已保存");
      setFredKey("");
      refetch();
    } catch (error) {
      toast.error("保存失败");
    }
    setSavingFred(false);
  };

  const handleSaveCoinalyze = async () => {
    if (!coinalyzeKey.trim()) {
      toast.error("请输入Coinalyze API Key");
      return;
    }
    setSavingCoinalyze(true);
    try {
      await saveMutation.mutateAsync({ key: "COINALYZE_API_KEY", value: coinalyzeKey });
      toast.success("Coinalyze API Key 已保存");
      setCoinalyzeKey("");
      refetch();
    } catch (error) {
      toast.error("保存失败");
    }
    setSavingCoinalyze(false);
  };

  const handleTestFred = async () => {
    const result = await testMutation.mutateAsync({ key: "FRED_API_KEY" });
    if (result.success) {
      toast.success(result.message);
    } else {
      toast.error(result.message);
    }
  };

  const handleTestCoinalyze = async () => {
    const result = await testMutation.mutateAsync({ key: "COINALYZE_API_KEY" });
    if (result.success) {
      toast.success(result.message);
    } else {
      toast.error(result.message);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-6">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key className="h-5 w-5" />
          API 配置
        </CardTitle>
        <CardDescription>
          配置数据源API密钥以获取完整的市场数据
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* FRED API Key */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-base font-medium">FRED API Key</Label>
            {fredConfig?.isConfigured ? (
              <Badge variant="outline" className="text-green-400 border-green-400/30">
                <CheckCircle className="h-3 w-3 mr-1" />
                已配置
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                <XCircle className="h-3 w-3 mr-1" />
                未配置
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            用于获取美联储经济数据（国债收益率、VIX等）。
            <a 
              href="https://fred.stlouisfed.org/docs/api/api_key.html" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary hover:underline ml-1"
            >
              获取免费API Key →
            </a>
          </p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={showFredKey ? "text" : "password"}
                placeholder="输入新的FRED API Key"
                value={fredKey}
                onChange={(e) => setFredKey(e.target.value)}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3"
                onClick={() => setShowFredKey(!showFredKey)}
              >
                {showFredKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <Button onClick={handleSaveFred} disabled={savingFred}>
              {savingFred ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            </Button>
            {fredConfig?.isConfigured && (
              <Button variant="outline" onClick={handleTestFred} disabled={testMutation.isPending}>
                测试
              </Button>
            )}
          </div>
        </div>

        {/* Coinalyze API Key */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-base font-medium">Coinalyze API Key</Label>
            {coinalyzeConfig?.isConfigured ? (
              <Badge variant="outline" className="text-green-400 border-green-400/30">
                <CheckCircle className="h-3 w-3 mr-1" />
                已配置
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                <XCircle className="h-3 w-3 mr-1" />
                未配置
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            用于获取多交易所聚合的BTC清算数据（Binance+OKX+Bybit）。
            <a 
              href="https://coinalyze.net/api/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary hover:underline ml-1"
            >
              免费注册获取API Key →
            </a>
          </p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={showCoinalyzeKey ? "text" : "password"}
                placeholder="输入新的Coinalyze API Key"
                value={coinalyzeKey}
                onChange={(e) => setCoinalyzeKey(e.target.value)}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3"
                onClick={() => setShowCoinalyzeKey(!showCoinalyzeKey)}
              >
                {showCoinalyzeKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <Button onClick={handleSaveCoinalyze} disabled={savingCoinalyze}>
              {savingCoinalyze ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            </Button>
            {coinalyzeConfig?.isConfigured && (
              <Button variant="outline" onClick={handleTestCoinalyze} disabled={testMutation.isPending}>
                测试
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function GitHubActionsSection() {

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          定时任务
        </CardTitle>
        <CardDescription>
          数据通过 GitHub Actions 自动采集
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
          <CheckCircle className="h-5 w-5 text-green-400 shrink-0" />
          <div>
            <div className="font-medium text-green-400">GitHub Actions 已配置</div>
            <p className="text-sm text-muted-foreground mt-1">
              每天北京时间 09:00 自动运行数据采集脚本，生成 JSON 报告并推送到 GitHub Pages。
            </p>
          </div>
        </div>
        <div className="text-sm text-muted-foreground space-y-2">
          <p>如需修改定时任务配置，请编辑 GitHub 仓库中的：</p>
          <code className="block p-2 rounded bg-muted text-xs">
            .github/workflows/daily-report.yml
          </code>
          <p>如需手动触发，可在 GitHub Actions 页面点击 "Run workflow"。</p>
        </div>
      </CardContent>
    </Card>
  );
}
