'use client';

// 관리자 전용 — 사용자 목록 / 등록 / 수정 / 삭제 / 사용기한 설정

export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  UserPlus,
  Pencil,
  Trash2,
  Loader2,
  ShieldCheck,
  CalendarClock,
  CircleSlash,
  CheckCircle2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

interface UserRow {
  id: string;
  email: string;
  full_name: string | null;
  department: string | null;
  phone: string | null;
  is_active: boolean;
  expires_at: string | null;
  last_login_at: string | null;
  created_at: string;
  role_id: string | null;
  role_name: string | null;
  role_display_name: string | null;
}
interface RoleOption {
  id: string;
  name: string;
  display_name: string;
}
interface ListResponse {
  data: UserRow[];
  roles: RoleOption[];
}

interface FormState {
  email: string;
  password: string;
  fullName: string;
  department: string;
  phone: string;
  roleId: string;
  expiresAt: string;
  isActive: boolean;
}

const EMPTY_FORM: FormState = {
  email: '',
  password: '',
  fullName: '',
  department: '',
  phone: '',
  roleId: '',
  expiresAt: '',
  isActive: true,
};

function toDateInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  // input[type=date] 는 YYYY-MM-DD
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

function fromDateInput(value: string): string | null {
  if (!value) return null;
  // 만료일은 그날의 23:59:59 로 잡아 직관적
  return new Date(`${value}T23:59:59`).toISOString();
}

function formatExpires(expires: string | null): { label: string; tone: 'muted' | 'warn' | 'expired' | 'ok' } {
  if (!expires) return { label: '무제한', tone: 'muted' };
  const d = new Date(expires);
  const now = Date.now();
  const diffDays = Math.ceil((d.getTime() - now) / (24 * 3600 * 1000));
  if (d.getTime() <= now) return { label: `만료 (${format(d, 'yyyy-MM-dd')})`, tone: 'expired' };
  if (diffDays <= 7) return { label: `${diffDays}일 남음 (${format(d, 'yyyy-MM-dd')})`, tone: 'warn' };
  return { label: format(d, 'yyyy-MM-dd'), tone: 'ok' };
}

export default function AdminUsersPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery<ListResponse>({
    queryKey: ['admin', 'users'],
    queryFn: async () => {
      const res = await fetch('/api/admin/users', { cache: 'no-store' });
      if (!res.ok) throw new Error((await res.json()).error || 'failed');
      return res.json();
    },
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<UserRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);

  const roles = data?.roles ?? [];
  const users = data?.data ?? [];

  return (
    <div className="container mx-auto px-6 py-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            사용자 관리
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            회원 등록·수정·삭제 및 사용기한을 관리합니다.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <UserPlus className="h-4 w-4" /> 사용자 추가
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">전체 사용자 ({users.length}명)</CardTitle>
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
                    <TableHead>이메일</TableHead>
                    <TableHead>이름</TableHead>
                    <TableHead>역할</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead>사용기한</TableHead>
                    <TableHead>최근 로그인</TableHead>
                    <TableHead className="text-right">관리</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => {
                    const ex = formatExpires(u.expires_at);
                    return (
                      <TableRow key={u.id}>
                        <TableCell className="font-mono text-xs">{u.email}</TableCell>
                        <TableCell>{u.full_name || <span className="text-muted-foreground">—</span>}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{u.role_display_name || u.role_name || '—'}</Badge>
                        </TableCell>
                        <TableCell>
                          {u.is_active ? (
                            <span className="inline-flex items-center gap-1 text-green-600 text-xs">
                              <CheckCircle2 className="h-3.5 w-3.5" /> 활성
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-red-600 text-xs">
                              <CircleSlash className="h-3.5 w-3.5" /> 비활성
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span
                            className={
                              ex.tone === 'expired'
                                ? 'inline-flex items-center gap-1 text-red-600 text-xs'
                                : ex.tone === 'warn'
                                ? 'inline-flex items-center gap-1 text-amber-600 text-xs'
                                : ex.tone === 'ok'
                                ? 'inline-flex items-center gap-1 text-slate-700 dark:text-slate-300 text-xs'
                                : 'inline-flex items-center gap-1 text-muted-foreground text-xs'
                            }
                          >
                            <CalendarClock className="h-3.5 w-3.5" />
                            {ex.label}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {u.last_login_at ? format(new Date(u.last_login_at), 'yyyy-MM-dd HH:mm') : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex gap-1">
                            <Button size="sm" variant="ghost" onClick={() => setEditTarget(u)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setDeleteTarget(u)}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {users.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                        사용자가 없습니다.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        roles={roles}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })}
      />
      <EditUserDialog
        target={editTarget}
        onOpenChange={(open) => !open && setEditTarget(null)}
        roles={roles}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })}
      />
      <DeleteUserDialog
        target={deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })}
      />
    </div>
  );
}

// ============= Create dialog =============

function CreateUserDialog({
  open,
  onOpenChange,
  roles,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: RoleOption[];
  onSuccess: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => defaultForm(roles));
  const defaultRoleId = useMemo(() => roles.find((r) => r.name === 'viewer')?.id ?? roles[0]?.id ?? '', [roles]);
  const defaultExpiresAt = useMemo(() => {
    const d = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    return toDateInput(d.toISOString());
  }, []);

  useEffect(() => {
    if (open) {
      setForm({ ...EMPTY_FORM, roleId: defaultRoleId, expiresAt: defaultExpiresAt });
    }
  }, [open, defaultRoleId, defaultExpiresAt]);

  const mutation = useMutation({
    mutationFn: async (payload: FormState) => {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: payload.email,
          password: payload.password,
          fullName: payload.fullName,
          roleId: payload.roleId || null,
          department: payload.department,
          phone: payload.phone,
          isActive: payload.isActive,
          expiresAt: fromDateInput(payload.expiresAt),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'failed');
      return res.json();
    },
    onSuccess: () => {
      toast.success('사용자가 추가되었습니다.');
      onSuccess();
      onOpenChange(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>사용자 추가</DialogTitle>
          <DialogDescription>새 회원을 직접 등록합니다.</DialogDescription>
        </DialogHeader>
        <UserForm form={form} setForm={setForm} roles={roles} mode="create" />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            취소
          </Button>
          <Button onClick={() => mutation.mutate(form)} disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            등록
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============= Edit dialog =============

function EditUserDialog({
  target,
  onOpenChange,
  roles,
  onSuccess,
}: {
  target: UserRow | null;
  onOpenChange: (open: boolean) => void;
  roles: RoleOption[];
  onSuccess: () => void;
}) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  useEffect(() => {
    if (target) {
      setForm({
        email: target.email,
        password: '',
        fullName: target.full_name ?? '',
        department: target.department ?? '',
        phone: target.phone ?? '',
        roleId: target.role_id ?? '',
        expiresAt: toDateInput(target.expires_at),
        isActive: target.is_active,
      });
    }
  }, [target]);

  const mutation = useMutation({
    mutationFn: async (payload: FormState) => {
      if (!target) throw new Error('no target');
      const res = await fetch(`/api/admin/users/${target.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: payload.fullName,
          department: payload.department,
          phone: payload.phone,
          roleId: payload.roleId || null,
          isActive: payload.isActive,
          expiresAt: fromDateInput(payload.expiresAt),
          ...(payload.password ? { password: payload.password } : {}),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'failed');
      return res.json();
    },
    onSuccess: () => {
      toast.success('수정되었습니다.');
      onSuccess();
      onOpenChange(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog open={!!target} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>사용자 수정</DialogTitle>
          <DialogDescription>{target?.email}</DialogDescription>
        </DialogHeader>
        <UserForm form={form} setForm={setForm} roles={roles} mode="edit" />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            취소
          </Button>
          <Button onClick={() => mutation.mutate(form)} disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============= Delete dialog =============

function DeleteUserDialog({
  target,
  onOpenChange,
  onSuccess,
}: {
  target: UserRow | null;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const mutation = useMutation({
    mutationFn: async () => {
      if (!target) throw new Error('no target');
      const res = await fetch(`/api/admin/users/${target.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error || 'failed');
      return res.json();
    },
    onSuccess: () => {
      toast.success('삭제되었습니다.');
      onSuccess();
      onOpenChange(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <AlertDialog open={!!target} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>사용자 삭제</AlertDialogTitle>
          <AlertDialogDescription>
            <strong>{target?.email}</strong> 계정과 이 계정이 소유한 모든 DB 연결·튜닝
            데이터가 영구 삭제됩니다. 되돌릴 수 없습니다.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>취소</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              mutation.mutate();
            }}
            disabled={mutation.isPending}
            className="bg-red-600 hover:bg-red-700"
          >
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            삭제
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ============= Form (shared) =============

function UserForm({
  form,
  setForm,
  roles,
  mode,
}: {
  form: FormState;
  setForm: (f: FormState) => void;
  roles: RoleOption[];
  mode: 'create' | 'edit';
}) {
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm({ ...form, [k]: v });

  return (
    <div className="space-y-3 py-1">
      <div className="grid gap-1.5">
        <Label htmlFor="email">이메일</Label>
        <Input
          id="email"
          type="email"
          value={form.email}
          disabled={mode === 'edit'}
          onChange={(e) => set('email', e.target.value)}
          placeholder="user@example.com"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="password">{mode === 'create' ? '비밀번호' : '비밀번호 재설정 (선택)'}</Label>
        <Input
          id="password"
          type="password"
          value={form.password}
          onChange={(e) => set('password', e.target.value)}
          placeholder={mode === 'edit' ? '비워두면 변경 안 함' : '최소 8자'}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="fullName">이름</Label>
          <Input id="fullName" value={form.fullName} onChange={(e) => set('fullName', e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="department">부서</Label>
          <Input id="department" value={form.department} onChange={(e) => set('department', e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="role">역할</Label>
          <Select value={form.roleId} onValueChange={(v) => set('roleId', v)}>
            <SelectTrigger id="role">
              <SelectValue placeholder="역할 선택" />
            </SelectTrigger>
            <SelectContent>
              {roles.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="expiresAt">사용기한</Label>
          <Input
            id="expiresAt"
            type="date"
            value={form.expiresAt}
            onChange={(e) => set('expiresAt', e.target.value)}
          />
          <p className="text-[11px] text-muted-foreground">비우면 무제한</p>
        </div>
      </div>
      <div className="flex items-center justify-between rounded-lg border p-3 bg-slate-50 dark:bg-slate-900/40">
        <div>
          <Label htmlFor="isActive" className="cursor-pointer">활성 상태</Label>
          <p className="text-[11px] text-muted-foreground">비활성 시 로그인 차단</p>
        </div>
        <Switch id="isActive" checked={form.isActive} onCheckedChange={(c) => set('isActive', c)} />
      </div>
    </div>
  );
}

function defaultForm(roles: RoleOption[]): FormState {
  return {
    ...EMPTY_FORM,
    roleId: roles.find((r) => r.name === 'viewer')?.id ?? roles[0]?.id ?? '',
  };
}
