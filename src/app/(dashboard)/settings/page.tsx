'use client';

/**
 * System Settings Page
 * 시스템 환경설정
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';

interface SystemSettings {
  // Monitoring
  monitoring_interval_seconds: number;
  sql_retention_days: number;

  // Notifications
  alert_enabled: boolean;
  alert_email: string;

  // Performance
  performance_threshold_ms: number;
  buffer_gets_threshold: number;
  cpu_time_threshold_ms: number;

  // Auto Tuning
  auto_tuning_enabled: boolean;
}

export default function SettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // 설정 조회
  const { data: settings, isLoading } = useQuery<SystemSettings>({
    queryKey: ['system-settings'],
    queryFn: async () => {
      const res = await fetch('/api/settings');
      if (!res.ok) throw new Error('Failed to fetch settings');
      const response = await res.json();
      return response.data; // API returns { success: true, data: {...} }
    },
  });

  const [formData, setFormData] = useState<SystemSettings | null>(null);

  // formData 초기화
  useEffect(() => {
    if (settings && !formData) {
      setFormData(settings);
    }
  }, [settings, formData]);

  // 설정 저장 Mutation
  const updateSettingsMutation = useMutation({
    mutationFn: async (data: SystemSettings) => {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to update settings');
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-settings'] });
      toast({
        title: '설정 저장 완료',
        description: '시스템 설정이 성공적으로 저장되었습니다.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: '설정 저장 실패',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSave = () => {
    if (formData) {
      updateSettingsMutation.mutate(formData);
    }
  };

  const updateField = <K extends keyof SystemSettings>(key: K, value: SystemSettings[K]) => {
    if (formData) {
      setFormData({ ...formData, [key]: value });
    }
  };

  if (isLoading || !formData) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">시스템 설정</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">시스템 환경을 구성합니다</p>
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">시스템 설정</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">시스템 환경을 구성합니다</p>
        </div>
        <Button onClick={handleSave} disabled={updateSettingsMutation.isPending}>
          <Save className="h-4 w-4 mr-2" />
          {updateSettingsMutation.isPending ? '저장 중...' : '설정 저장'}
        </Button>
      </div>

      {/* 설정 탭 */}
      <Tabs defaultValue="monitoring" className="space-y-4">
        <TabsList>
          <TabsTrigger value="monitoring">모니터링</TabsTrigger>
          <TabsTrigger value="notifications">알림</TabsTrigger>
          <TabsTrigger value="performance">성능</TabsTrigger>
          <TabsTrigger value="tuning">자동 튜닝</TabsTrigger>
        </TabsList>

        {/* 모니터링 설정 */}
        <TabsContent value="monitoring" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>모니터링 설정</CardTitle>
              <CardDescription>SQL 및 성능 모니터링 설정</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="monitoring_interval_seconds">
                  모니터링 수집 간격 (초)
                </Label>
                <Input
                  id="monitoring_interval_seconds"
                  type="number"
                  value={formData.monitoring_interval_seconds}
                  onChange={(e) =>
                    updateField('monitoring_interval_seconds', parseInt(e.target.value))
                  }
                  min={10}
                  max={3600}
                />
                <p className="text-xs text-muted-foreground">
                  SQL 및 성능 데이터를 수집하는 주기 (권장: 60초)
                </p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="sql_retention_days">
                  SQL 데이터 보관 기간 (일)
                </Label>
                <Input
                  id="sql_retention_days"
                  type="number"
                  value={formData.sql_retention_days}
                  onChange={(e) =>
                    updateField('sql_retention_days', parseInt(e.target.value))
                  }
                  min={7}
                  max={365}
                />
                <p className="text-xs text-muted-foreground">
                  수집된 SQL 통계 데이터의 보관 기간 (권장: 30일)
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 알림 설정 */}
        <TabsContent value="notifications" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>알림 설정</CardTitle>
              <CardDescription>성능 문제 발견 시 알림 설정</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>알림 활성화</Label>
                  <p className="text-sm text-muted-foreground">
                    성능 임계값 초과 시 이메일 알림 전송
                  </p>
                </div>
                <Switch
                  checked={formData.alert_enabled}
                  onCheckedChange={(checked) =>
                    updateField('alert_enabled', checked)
                  }
                />
              </div>

              {formData.alert_enabled && (
                <div className="grid gap-2">
                  <Label htmlFor="alert_email">알림 이메일 주소</Label>
                  <Input
                    id="alert_email"
                    type="email"
                    value={formData.alert_email}
                    onChange={(e) => updateField('alert_email', e.target.value)}
                    placeholder="admin@example.com"
                  />
                  <p className="text-xs text-muted-foreground">
                    알림을 받을 이메일 주소
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 성능 설정 */}
        <TabsContent value="performance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>성능 임계값</CardTitle>
              <CardDescription>성능 모니터링 기준값 설정</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="performance_threshold_ms">
                  실행 시간 임계값 (밀리초)
                </Label>
                <Input
                  id="performance_threshold_ms"
                  type="number"
                  value={formData.performance_threshold_ms}
                  onChange={(e) =>
                    updateField('performance_threshold_ms', parseInt(e.target.value))
                  }
                  min={100}
                  max={60000}
                />
                <p className="text-xs text-muted-foreground">
                  이 값을 초과하는 SQL은 느린 쿼리로 분류됩니다 (권장: 1000ms)
                </p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="buffer_gets_threshold">
                  Buffer Gets 임계값
                </Label>
                <Input
                  id="buffer_gets_threshold"
                  type="number"
                  value={formData.buffer_gets_threshold}
                  onChange={(e) =>
                    updateField('buffer_gets_threshold', parseInt(e.target.value))
                  }
                  min={1000}
                  max={1000000}
                />
                <p className="text-xs text-muted-foreground">
                  이 값을 초과하는 SQL은 I/O 집약적으로 분류됩니다 (권장: 10000)
                </p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="cpu_time_threshold_ms">
                  CPU 시간 임계값 (밀리초)
                </Label>
                <Input
                  id="cpu_time_threshold_ms"
                  type="number"
                  value={formData.cpu_time_threshold_ms}
                  onChange={(e) =>
                    updateField('cpu_time_threshold_ms', parseInt(e.target.value))
                  }
                  min={100}
                  max={60000}
                />
                <p className="text-xs text-muted-foreground">
                  이 값을 초과하는 SQL은 CPU 집약적으로 분류됩니다 (권장: 5000ms)
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 자동 튜닝 설정 */}
        <TabsContent value="tuning" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>자동 튜닝</CardTitle>
              <CardDescription>SQL 자동 튜닝 기능 설정</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>자동 튜닝 활성화</Label>
                  <p className="text-sm text-muted-foreground">
                    성능 문제가 있는 SQL에 대해 자동으로 튜닝 제안 생성
                  </p>
                </div>
                <Switch
                  checked={formData.auto_tuning_enabled}
                  onCheckedChange={(checked) =>
                    updateField('auto_tuning_enabled', checked)
                  }
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-blue-500 bg-blue-50">
            <CardContent className="flex gap-3 pt-6">
              <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-blue-900">
                  자동 튜닝 안내
                </p>
                <p className="text-xs text-blue-800">
                  자동 튜닝은 성능 임계값을 초과하는 SQL을 자동으로 감지하고 튜닝 제안을 생성합니다.
                  실제 적용은 관리자의 승인이 필요합니다.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
