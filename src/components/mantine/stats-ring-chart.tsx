'use client';

import { DonutChart } from '@mantine/charts';
import { Paper, Text, Group, Stack, RingProgress, Center, ThemeIcon } from '@mantine/core';
import { IconDatabase, IconCpu, IconActivity, IconUsers } from '@tabler/icons-react';

interface SQLGradeData {
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  count: number;
}

interface StatsRingChartProps {
  data: SQLGradeData[];
  title?: string;
  height?: number;
}

const gradeColors: Record<string, string> = {
  A: 'green.6',
  B: 'lime.6',
  C: 'yellow.6',
  D: 'orange.6',
  F: 'red.6',
};

const gradeLabels: Record<string, string> = {
  A: '우수',
  B: '양호',
  C: '보통',
  D: '주의',
  F: '위험',
};

export function SQLGradeDonutChart({ data, title = 'SQL 등급 분포', height = 250 }: StatsRingChartProps) {
  const total = data.reduce((sum, d) => sum + d.count, 0);

  const chartData = data.map((d) => ({
    name: `Grade ${d.grade} (${gradeLabels[d.grade]})`,
    value: d.count,
    color: gradeColors[d.grade],
  }));

  return (
    <Paper p="md" withBorder radius="md">
      <Stack gap="sm">
        <Text fw={600} size="lg">{title}</Text>

        {total === 0 ? (
          <Center h={height}>
            <Text c="dimmed">데이터가 없습니다</Text>
          </Center>
        ) : (
          <DonutChart
            h={height}
            data={chartData}
            thickness={30}
            tooltipDataSource="segment"
            chartLabel={`총 ${total}개`}
            withLabelsLine
            labelsType="percent"
          />
        )}

        <Group justify="center" gap="lg" mt="xs">
          {data.map((d) => (
            <Group key={d.grade} gap={4}>
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  backgroundColor: `var(--mantine-color-${gradeColors[d.grade].replace('.', '-')})`,
                }}
              />
              <Text size="sm" c="dimmed">
                {d.grade}: {d.count}
              </Text>
            </Group>
          ))}
        </Group>
      </Stack>
    </Paper>
  );
}

interface MetricRingProps {
  label: string;
  value: number;
  maxValue: number;
  icon: React.ReactNode;
  color: string;
  unit?: string;
  description?: string;
}

export function MetricRingCard({ label, value, maxValue, icon, color, unit = '', description }: MetricRingProps) {
  const percentage = maxValue > 0 ? Math.min((value / maxValue) * 100, 100) : 0;

  return (
    <Paper p="md" withBorder radius="md">
      <Group>
        <RingProgress
          size={80}
          thickness={8}
          roundCaps
          sections={[{ value: percentage, color }]}
          label={
            <Center>
              <ThemeIcon color={color} variant="light" radius="xl" size="lg">
                {icon}
              </ThemeIcon>
            </Center>
          }
        />
        <div>
          <Text size="xs" tt="uppercase" fw={700} c="dimmed">
            {label}
          </Text>
          <Text fw={700} size="xl">
            {value.toLocaleString()}{unit}
          </Text>
          {description && (
            <Text size="xs" c="dimmed">
              {description}
            </Text>
          )}
        </div>
      </Group>
    </Paper>
  );
}

interface DashboardStatsProps {
  activeSessions: number;
  totalSessions: number;
  bufferCacheHitRate: number;
  transactionTPS: number;
  cpuUsage?: number;
}

export function DashboardStatsCards({
  activeSessions,
  totalSessions,
  bufferCacheHitRate,
  transactionTPS,
  cpuUsage = 0,
}: DashboardStatsProps) {
  return (
    <Group grow>
      <MetricRingCard
        label="활성 세션"
        value={activeSessions}
        maxValue={totalSessions}
        icon={<IconUsers size={18} />}
        color="blue"
        description={`전체 ${totalSessions}개 세션`}
      />
      <MetricRingCard
        label="Buffer Cache Hit"
        value={bufferCacheHitRate}
        maxValue={100}
        icon={<IconDatabase size={18} />}
        color={bufferCacheHitRate > 90 ? 'green' : 'yellow'}
        unit="%"
        description="캐시 히트율"
      />
      <MetricRingCard
        label="트랜잭션 TPS"
        value={Math.round(transactionTPS * 100) / 100}
        maxValue={1000}
        icon={<IconActivity size={18} />}
        color="orange"
        description="초당 트랜잭션"
      />
      <MetricRingCard
        label="CPU 사용률"
        value={cpuUsage}
        maxValue={100}
        icon={<IconCpu size={18} />}
        color={cpuUsage > 80 ? 'red' : cpuUsage > 60 ? 'yellow' : 'green'}
        unit="%"
        description="시스템 CPU"
      />
    </Group>
  );
}
