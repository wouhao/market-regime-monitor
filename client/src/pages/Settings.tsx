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
      <ScheduleSection />
    </div>
  );
}

function ApiConfigSection() {
  const [fredKey, setFredKey] = useState("");
  const [coinglassKey, setCoinglassKey] = useState("");
  const [showFredKey, setShowFredKey] = useState(false);
  const [showCoinglassKey, setShowCoinglassKey] = useState(false);
  const [savingFred, setSavingFred] = useState(false);
  const [savingCoinglass, setSavingCoinglass] = useState(false);

  const { data: configData, isLoading, refetch } = trpc.config.getAll.useQuery();
  const saveMutation = trpc.config.save.useMutation();
  const testMutation = trpc.config.test.useMutation();

  const configs = configData?.data || [];
  const fredConfig = configs.find(c => c.key === "FRED_API_KEY");
  const coinglassConfig = configs.find(c => c.key === "COINGLASS_API_KEY");

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

  const handleSaveCoinglass = async () => {
    if (!coinglassKey.trim()) {
      toast.error("请输入CoinGlass API Key");
      return;
    }
    setSavingCoinglass(true);
    try {
      await saveMutation.mutateAsync({ key: "COINGLASS_API_KEY", value: coinglassKey });
      toast.success("CoinGlass API Key 已保存");
      setCoinglassKey("");
      refetch();
    } catch (error) {
      toast.error("保存失败");
    }
    setSavingCoinglass(false);
  };

  const handleTestFred = async () => {
    const result = await testMutation.mutateAsync({ key: "FRED_API_KEY" });
    if (result.success) {
      toast.success(result.message);
    } else {
      toast.error(result.message);
    }
  };

  const handleTestCoinglass = async () => {
    const result = await testMutation.mutateAsync({ key: "COINGLASS_API_KEY" });
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

        {/* CoinGlass API Key */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-base font-medium">CoinGlass API Key</Label>
            {coinglassConfig?.isConfigured ? (
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
            用于获取加密货币衍生品数据（资金费率、持仓量等）。
            <a 
              href="https://coinglass.com/zh/api" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary hover:underline ml-1"
            >
              获取API Key →
            </a>
          </p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={showCoinglassKey ? "text" : "password"}
                placeholder="输入新的CoinGlass API Key"
                value={coinglassKey}
                onChange={(e) => setCoinglassKey(e.target.value)}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3"
                onClick={() => setShowCoinglassKey(!showCoinglassKey)}
              >
                {showCoinglassKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <Button onClick={handleSaveCoinglass} disabled={savingCoinglass}>
              {savingCoinglass ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            </Button>
            {coinglassConfig?.isConfigured && (
              <Button variant="outline" onClick={handleTestCoinglass} disabled={testMutation.isPending}>
                测试
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ScheduleSection() {
  const { data, isLoading, refetch } = trpc.settings.getSchedule.useQuery();
  const updateMutation = trpc.settings.updateSchedule.useMutation();

  const [time, setTime] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!time) {
      toast.error("请选择时间");
      return;
    }
    setSaving(true);
    try {
      await updateMutation.mutateAsync({ scheduledTime: time });
      toast.success("定时任务已更新");
      refetch();
    } catch (error) {
      toast.error("更新失败");
    }
    setSaving(false);
  };

  const handleToggle = async (enabled: boolean) => {
    try {
      await updateMutation.mutateAsync({ isEnabled: enabled });
      toast.success(enabled ? "定时任务已启用" : "定时任务已禁用");
      refetch();
    } catch (error) {
      toast.error("更新失败");
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24" />
        </CardContent>
      </Card>
    );
  }

  const schedule = data?.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          定时任务
        </CardTitle>
        <CardDescription>
          配置每日自动生成报告的时间
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-base font-medium">启用定时任务</Label>
            <p className="text-sm text-muted-foreground mt-1">
              每天自动生成市场状态报告
            </p>
          </div>
          <Switch
            checked={schedule?.isEnabled}
            onCheckedChange={handleToggle}
          />
        </div>

        <div className="space-y-3">
          <Label>执行时间（北京时间）</Label>
          <div className="flex gap-2">
            <Input
              type="time"
              defaultValue={schedule?.scheduledTime || "09:00"}
              onChange={(e) => setTime(e.target.value)}
              className="w-40"
            />
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              保存
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            当前设置: 每天 {schedule?.scheduledTime || "09:00"} (Asia/Shanghai)
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
