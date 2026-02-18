'use client';

import { useState, useMemo } from 'react';
import {
  Table,
  ScrollArea,
  TextInput,
  Group,
  Badge,
  ActionIcon,
  Tooltip,
  Pagination,
  Select,
  Text,
  Paper,
  Skeleton,
  Stack,
  Menu,
  UnstyledButton,
  Center,
  rem,
  Box,
} from '@mantine/core';
import {
  IconSearch,
  IconEye,
  IconChartLine,
  IconHistory,
  IconSelector,
  IconChevronDown,
  IconChevronUp,
  IconDownload,
  IconFilter,
  IconRefresh,
} from '@tabler/icons-react';
import { useRouter } from 'next/navigation';

interface SQLData {
  sql_id: string;
  sql_text?: string;
  sql_snippet?: string;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  elapsed_time_ms: number;
  cpu_time_ms: number;
  buffer_gets: number;
  executions: number;
  disk_reads?: number;
  rows_processed?: number;
}

interface SQLDataTableProps {
  data: SQLData[];
  isLoading?: boolean;
  connectionId?: string;
  title?: string;
  onRefresh?: () => void;
  showExport?: boolean;
}

const gradeColors: Record<string, string> = {
  A: 'green',
  B: 'lime',
  C: 'yellow',
  D: 'orange',
  F: 'red',
};

const gradeDescriptions: Record<string, string> = {
  A: '우수 (< 200ms)',
  B: '양호 (< 500ms)',
  C: '보통 (< 1000ms)',
  D: '주의 (< 2000ms)',
  F: '위험 (> 2000ms)',
};

type SortField = 'sql_id' | 'grade' | 'elapsed_time_ms' | 'cpu_time_ms' | 'buffer_gets' | 'executions';
type SortDirection = 'asc' | 'desc';

interface ThProps {
  children: React.ReactNode;
  sorted: boolean;
  reversed: boolean;
  onSort(): void;
  width?: string | number;
  align?: 'left' | 'center' | 'right';
}

function Th({ children, sorted, reversed, onSort, width, align = 'left' }: ThProps) {
  const Icon = sorted ? (reversed ? IconChevronUp : IconChevronDown) : IconSelector;

  return (
    <Table.Th style={{ width, textAlign: align }}>
      <UnstyledButton onClick={onSort} style={{ width: '100%' }}>
        <Group justify={align === 'right' ? 'flex-end' : 'flex-start'} gap={4}>
          <Text fw={600} size="sm">
            {children}
          </Text>
          <Center>
            <Icon style={{ width: rem(16), height: rem(16) }} />
          </Center>
        </Group>
      </UnstyledButton>
    </Table.Th>
  );
}

export function SQLDataTable({
  data,
  isLoading = false,
  connectionId,
  title = 'SQL 목록',
  onRefresh,
  showExport = false,
}: SQLDataTableProps) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState('20');
  const [sortField, setSortField] = useState<SortField>('elapsed_time_ms');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [gradeFilter, setGradeFilter] = useState<string | null>(null);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const filteredAndSortedData = useMemo(() => {
    let result = [...data];

    // 검색 필터
    if (search) {
      const searchLower = search.toLowerCase();
      result = result.filter(
        (item) =>
          item.sql_id.toLowerCase().includes(searchLower) ||
          (item.sql_text || item.sql_snippet || '').toLowerCase().includes(searchLower)
      );
    }

    // 등급 필터
    if (gradeFilter) {
      result = result.filter((item) => item.grade === gradeFilter);
    }

    // 정렬
    result.sort((a, b) => {
      const aValue = a[sortField];
      const bValue = b[sortField];

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc'
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }

      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
      }

      return 0;
    });

    return result;
  }, [data, search, gradeFilter, sortField, sortDirection]);

  const paginatedData = useMemo(() => {
    const start = (page - 1) * Number(pageSize);
    return filteredAndSortedData.slice(start, start + Number(pageSize));
  }, [filteredAndSortedData, page, pageSize]);

  const totalPages = Math.ceil(filteredAndSortedData.length / Number(pageSize));

  // 페이지 범위 초과 시 첫 페이지로 리셋
  if (page > totalPages && totalPages > 0) {
    setPage(1);
  }

  if (isLoading) {
    return (
      <Paper p="md" withBorder radius="md">
        <Stack gap="md">
          <Skeleton height={40} />
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} height={50} />
          ))}
        </Stack>
      </Paper>
    );
  }

  return (
    <Paper p="md" withBorder radius="md">
      <Stack gap="md">
        {/* 헤더 */}
        <Group justify="space-between">
          <Text fw={600} size="lg">{title}</Text>
          <Group gap="xs">
            {onRefresh && (
              <Tooltip label="새로고침">
                <ActionIcon variant="light" onClick={onRefresh}>
                  <IconRefresh size={18} />
                </ActionIcon>
              </Tooltip>
            )}
            {showExport && (
              <Menu shadow="md" width={200}>
                <Menu.Target>
                  <Tooltip label="내보내기">
                    <ActionIcon variant="light">
                      <IconDownload size={18} />
                    </ActionIcon>
                  </Tooltip>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item>CSV로 내보내기</Menu.Item>
                  <Menu.Item>Excel로 내보내기</Menu.Item>
                </Menu.Dropdown>
              </Menu>
            )}
          </Group>
        </Group>

        {/* 필터 영역 */}
        <Group justify="space-between">
          <Group gap="sm">
            <TextInput
              placeholder="SQL ID 또는 SQL 텍스트 검색..."
              leftSection={<IconSearch size={16} />}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              style={{ width: 300 }}
            />
            <Select
              placeholder="등급 필터"
              leftSection={<IconFilter size={16} />}
              value={gradeFilter}
              onChange={(value) => {
                setGradeFilter(value);
                setPage(1);
              }}
              data={[
                { value: 'A', label: 'Grade A (우수)' },
                { value: 'B', label: 'Grade B (양호)' },
                { value: 'C', label: 'Grade C (보통)' },
                { value: 'D', label: 'Grade D (주의)' },
                { value: 'F', label: 'Grade F (위험)' },
              ]}
              clearable
              style={{ width: 180 }}
            />
          </Group>
          <Group gap="xs">
            <Text size="sm" c="dimmed">표시:</Text>
            <Select
              value={pageSize}
              onChange={(v) => {
                setPageSize(v || '20');
                setPage(1);
              }}
              data={['10', '20', '50', '100']}
              w={80}
              size="sm"
            />
          </Group>
        </Group>

        {/* 테이블 */}
        <ScrollArea>
          <Table striped highlightOnHover withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Th
                  sorted={sortField === 'sql_id'}
                  reversed={sortDirection === 'asc'}
                  onSort={() => handleSort('sql_id')}
                  width="180px"
                >
                  SQL ID
                </Th>
                <Th
                  sorted={sortField === 'grade'}
                  reversed={sortDirection === 'asc'}
                  onSort={() => handleSort('grade')}
                  width="100px"
                  align="center"
                >
                  등급
                </Th>
                <Th
                  sorted={sortField === 'elapsed_time_ms'}
                  reversed={sortDirection === 'asc'}
                  onSort={() => handleSort('elapsed_time_ms')}
                  width="120px"
                  align="right"
                >
                  실행시간
                </Th>
                <Th
                  sorted={sortField === 'cpu_time_ms'}
                  reversed={sortDirection === 'asc'}
                  onSort={() => handleSort('cpu_time_ms')}
                  width="120px"
                  align="right"
                >
                  CPU 시간
                </Th>
                <Th
                  sorted={sortField === 'buffer_gets'}
                  reversed={sortDirection === 'asc'}
                  onSort={() => handleSort('buffer_gets')}
                  width="120px"
                  align="right"
                >
                  Buffer Gets
                </Th>
                <Th
                  sorted={sortField === 'executions'}
                  reversed={sortDirection === 'asc'}
                  onSort={() => handleSort('executions')}
                  width="100px"
                  align="right"
                >
                  실행 횟수
                </Th>
                <Table.Th style={{ width: 120, textAlign: 'center' }}>
                  <Text fw={600} size="sm">액션</Text>
                </Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {paginatedData.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={7}>
                    <Center py="xl">
                      <Text c="dimmed">
                        {search || gradeFilter ? '검색 결과가 없습니다' : '데이터가 없습니다'}
                      </Text>
                    </Center>
                  </Table.Td>
                </Table.Tr>
              ) : (
                paginatedData.map((row, index) => (
                  <Table.Tr key={`${row.sql_id}-${index}`}>
                    <Table.Td>
                      <Box>
                        <Text size="sm" ff="monospace" fw={500}>
                          {row.sql_id}
                        </Text>
                        <Text size="xs" c="dimmed" lineClamp={1}>
                          {row.sql_text || row.sql_snippet || ''}
                        </Text>
                      </Box>
                    </Table.Td>
                    <Table.Td style={{ textAlign: 'center' }}>
                      <Tooltip label={gradeDescriptions[row.grade]}>
                        <Badge color={gradeColors[row.grade]} variant="filled">
                          Grade {row.grade}
                        </Badge>
                      </Tooltip>
                    </Table.Td>
                    <Table.Td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                      {row.elapsed_time_ms.toLocaleString()} ms
                    </Table.Td>
                    <Table.Td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                      {row.cpu_time_ms.toLocaleString()} ms
                    </Table.Td>
                    <Table.Td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                      {row.buffer_gets.toLocaleString()}
                    </Table.Td>
                    <Table.Td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                      {row.executions.toLocaleString()}
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs" justify="center">
                        <Tooltip label="상세 보기">
                          <ActionIcon
                            variant="subtle"
                            color="blue"
                            onClick={() => router.push(`/analysis/sql/${row.sql_id}`)}
                          >
                            <IconEye size={16} />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label="실행계획">
                          <ActionIcon
                            variant="subtle"
                            color="grape"
                            onClick={() =>
                              router.push(
                                `/execution-plans?sql_id=${row.sql_id}&connection_id=${connectionId}`
                              )
                            }
                          >
                            <IconChartLine size={16} />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label="히스토리">
                          <ActionIcon
                            variant="subtle"
                            color="teal"
                            onClick={() =>
                              router.push(`/analysis/sql/${row.sql_id}?tab=history`)
                            }
                          >
                            <IconHistory size={16} />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
        </ScrollArea>

        {/* 페이지네이션 */}
        {totalPages > 1 && (
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              총 {filteredAndSortedData.length}개 중 {(page - 1) * Number(pageSize) + 1}-
              {Math.min(page * Number(pageSize), filteredAndSortedData.length)}개 표시
            </Text>
            <Pagination
              value={page}
              onChange={setPage}
              total={totalPages}
              size="sm"
              withEdges
            />
          </Group>
        )}
      </Stack>
    </Paper>
  );
}
