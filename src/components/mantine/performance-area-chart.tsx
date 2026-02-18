'use client';

import { AreaChart } from '@mantine/charts';
import { Paper, Text, Group, Badge, Stack, useMantineTheme } from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';

interface PerformanceDataPoint {
  timestamp: Date;
  avgCpuTime: number;
  avgElapsedTime: number;
  avgBufferGets: number;
  totalExecutions: number;
  activeQueries?: number;
  problemQueries?: number;
  source?: string;
}

interface PerformanceAreaChartProps {
  data: PerformanceDataPoint[];
  height?: number;
  title?: string;
  description?: string;
  showLegend?: boolean;
  isLoading?: boolean;
  onRefresh?: () => void;
}

export function PerformanceAreaChart({
  data,
  height = 300,
  title = '성능 트렌드',
  description,
  showLegend = true,
  isLoading = false,
  onRefresh,
}: PerformanceAreaChartProps) {
  const theme = useMantineTheme();

  const chartData = data.map((d) => ({
    time: d.timestamp.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
    'CPU 시간 (ms)': Math.round(d.avgCpuTime * 100) / 100,
    '실행 시간 (ms)': Math.round(d.avgElapsedTime * 100) / 100,
    'Buffer Gets (K)': Math.round(d.avgBufferGets / 1000 * 100) / 100,
  }));

  const dataSource = data.length > 0 ? data[0].source : undefined;

  return (
    <Paper p="md" withBorder radius="md">
      <Stack gap="sm">
        <Group justify="space-between">
          <div>
            <Text fw={600} size="lg">{title}</Text>
            {description && (
              <Text size="sm" c="dimmed">{description}</Text>
            )}
          </div>
          <Group gap="xs">
            {dataSource && (
              <Badge
                variant="light"
                color={dataSource === 'ash' ? 'green' : dataSource === 'v$sql' ? 'blue' : 'gray'}
              >
                {dataSource === 'ash' ? 'ASH Live' :
                 dataSource === 'v$sql' ? 'V$SQL Live' :
                 dataSource === 'fallback' ? '시뮬레이션' : 'Live'}
              </Badge>
            )}
            {onRefresh && (
              <Badge
                variant="light"
                color="brand"
                style={{ cursor: 'pointer' }}
                onClick={onRefresh}
                leftSection={<IconRefresh size={12} />}
              >
                새로고침
              </Badge>
            )}
          </Group>
        </Group>

        {isLoading ? (
          <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Text c="dimmed">데이터 로딩 중...</Text>
          </div>
        ) : data.length === 0 ? (
          <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Text c="dimmed">데이터가 없습니다</Text>
          </div>
        ) : (
          <AreaChart
            h={height}
            data={chartData}
            dataKey="time"
            series={[
              { name: 'CPU 시간 (ms)', color: 'blue.6' },
              { name: '실행 시간 (ms)', color: 'cyan.6' },
              { name: 'Buffer Gets (K)', color: 'green.6' },
            ]}
            curveType="natural"
            withLegend={showLegend}
            legendProps={{ verticalAlign: 'bottom', height: 50 }}
            withTooltip
            tooltipAnimationDuration={200}
            gridAxis="xy"
            strokeWidth={2}
            fillOpacity={0.2}
            withDots={false}
          />
        )}
      </Stack>
    </Paper>
  );
}
