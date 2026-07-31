'use client';

// 관리자 전용 — 접속기록 관리. 가입된 모든 사용자의 구간별 접속 횟수·접속일자 조회.

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  History,
  Loader2,
  Users,
  CalendarCheck,
  Activity,
  UserCheck,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

interface SummaryRow {
  user_id: string;
  email: string;
  full_name: string | null;
  department: string | null;
  is_active: boolean;
  range_count: number;
  active_days: number;
  total_count: number;
  last_login_at: string | null;
}
interface SummaryResponse {
  from: string;
  to: string;
  summary: SummaryRow[];
  totals: { registered_users: number; active_users: number; range_logins: number };
}
interface DetailRecord {
  id: string;
  login_at: string;
  ip_address: string | null;
  user_agent: string | null;
  success: boolean;
}
interface DetailResponse {
  from: string;
  to: string;
  email: string;
  records: DetailRecord[];
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function monthStart(): string {
  const d = new Date();
  return ymd(new Date(d.getFullYear(), d.getMonth(), 1));
}
function today(): string {
  return ymd(new Date());
}

const RANGE_PRESETS = [
  { label: '이번 달', calc: (): [string, string] => [monthStart(), today()] },
  {
    label: '최근 7일',
    calc: (): [string, string] => {
      const d = new Date();
      const from = new Date(d);
      from.setDate(from.getDate() - 6);
      return [ymd(from), ymd(d)];
    },
  },
  {
    label: '최근 30일',
    calc: (): [string, string] => {
      const d = new Date();
      const from = new Date(d);
      from.setDate(from.getDate() - 29);
      return [ymd(from), ymd(d)];
    },
  },
  {
    label: '지난 달',
    calc: (): [string, string] => {
      const d = new Date();
      const first = new Date(d.getFullYear(), d.getMonth() - 1, 1);
      const last = new Date(d.getFullYear(), d.getMonth(), 0);
      return [ymd(first), ymd(last)];
    },
  },
];

export default function LoginHistoryPage() {
  const [from, setFrom] = useState<string>(monthStart);
  const [to, setTo] = useState<string>(today);
  const [detailEmail, setDetailEmail] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<SummaryResponse>({
    queryKey: ['admin', 'login-history', from, to],
    queryFn: async () => {
      const res = await fetch(`/api/admin/login-history?from=${from}&to=${to}`, { cache: 'no-store' });
      if (!res.ok) throw new Error((await res.json()).error || 'failed');
      return res.json();
    },
  });

  const rows = data?.summary ?? [];
  const totals = data?.totals;

  const applyPreset = (preset: (typeof RANGE_PRESETS)[number]) => {
    const [f, t] = preset.calc();
    setFrom(f);
    setTo(t);
  };

  return (
    <div className="container mx-auto px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <History className="h-6 w-6 text-primary" />
          접속기록 관리
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          가입된 모든 사용자의 접속기록을 조회 구간별로 관리합니다.
        </p>
      </div>

      {/* 조회 구간 */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1.5">
              <label htmlFor="from" className="text-xs text-muted-foreground">
                시작일
              </label>
              <Input
                id="from"
                type="date"
                value={from}
                max={to}
                onChange={(e) => setFrom(e.target.value)}
                className="w-[170px]"
              />
            </div>
            <span className="pb-2 text-muted-foreground">~</span>
            <div className="grid gap-1.5">
              <label htmlFor="to" className="text-xs text-muted-foreground">
                종료일
              </label>
              <Input
                id="to"
                type="date"
                value={to}
                min={from}
                max={today()}
                onChange={(e) => setTo(e.target.value)}
                className="w-[170px]"
              />
            </div>
            <div className="flex flex-wrap gap-1.5 pb-0.5">
              {RANGE_PRESETS.map((p) => (
                <Button key={p.label} size="sm" variant="outline" onClick={() => applyPreset(p)}>
                  {p.label}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard icon={<Users className="h-5 w-5 text-blue-500" />} label="가입 사용자 수" value={totals?.registered_users} />
        <StatCard icon={<UserCheck className="h-5 w-5 text-emerald-500" />} label="구간 내 접속 사용자" value={totals?.active_users} />
        <StatCard icon={<Activity className="h-5 w-5 text-violet-500" />} label="구간 총 접속 횟수" value={totals?.range_logins} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            사용자별 접속 현황 ({rows.length}명)
            {data && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {data.from} ~ {data.to}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-10 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> 불러오는 중…
            </div>
          ) : error ? (
            <div className="text-sm text-red-600 py-6">불러오기 실패: {(error as Error).message}</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>접속 아이디</TableHead>
                    <TableHead>이름</TableHead>
                    <TableHead>부서</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead className="text-right">구간 접속 횟수</TableHead>
                    <TableHead className="text-right">접속일수</TableHead>
                    <TableHead className="text-right">누적 접속</TableHead>
                    <TableHead>최근 접속일시</TableHead>
                    <TableHead className="text-right">상세</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.user_id} className={r.range_count === 0 ? 'opacity-70' : undefined}>
                      <TableCell className="font-mono text-xs">{r.email}</TableCell>
                      <TableCell>{r.full_name || <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="text-sm">
                        {r.department || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        {r.is_active ? (
                          <span className="text-xs text-green-600">활성</span>
                        ) : (
                          <span className="text-xs text-red-600">비활성</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={r.range_count > 0 ? 'default' : 'outline'}>{r.range_count}회</Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        <span className="inline-flex items-center gap-1">
                          <CalendarCheck className="h-3.5 w-3.5 text-muted-foreground" />
                          {r.active_days}일
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">{r.total_count}회</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.last_login_at ? format(new Date(r.last_login_at), 'yyyy-MM-dd HH:mm:ss') : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={r.range_count === 0}
                          onClick={() => setDetailEmail(r.email)}
                        >
                          보기
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-8">
                        가입된 사용자가 없습니다.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <DetailDialog email={detailEmail} from={from} to={to} onClose={() => setDetailEmail(null)} />
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value?: number }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-5">
        <div className="rounded-lg bg-muted p-2">{icon}</div>
        <div>
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="text-2xl font-bold">{value ?? '—'}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function DetailDialog({
  email,
  from,
  to,
  onClose,
}: {
  email: string | null;
  from: string;
  to: string;
  onClose: () => void;
}) {
  const { data, isLoading, error } = useQuery<DetailResponse>({
    queryKey: ['admin', 'login-history', 'detail', email, from, to],
    enabled: !!email,
    queryFn: async () => {
      const res = await fetch(
        `/api/admin/login-history?email=${encodeURIComponent(email!)}&from=${from}&to=${to}`,
        { cache: 'no-store' },
      );
      if (!res.ok) throw new Error((await res.json()).error || 'failed');
      return res.json();
    },
  });

  const records = data?.records ?? [];

  return (
    <Dialog open={!!email} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>접속 상세 내역</DialogTitle>
          <DialogDescription>
            <span className="font-mono">{email}</span> · {from} ~ {to}
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-10 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> 불러오는 중…
          </div>
        ) : error ? (
          <div className="text-sm text-red-600 py-6">불러오기 실패: {(error as Error).message}</div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>접속일시</TableHead>
                  <TableHead>IP 주소</TableHead>
                  <TableHead>브라우저 / 단말</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((rec) => (
                  <TableRow key={rec.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {format(new Date(rec.login_at), 'yyyy-MM-dd HH:mm:ss')}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{rec.ip_address || '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[320px] truncate" title={rec.user_agent || ''}>
                      {rec.user_agent || '—'}
                    </TableCell>
                  </TableRow>
                ))}
                {records.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-8">
                      해당 구간의 접속기록이 없습니다.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
