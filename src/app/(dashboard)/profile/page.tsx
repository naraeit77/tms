'use client';

/**
 * User Profile Page
 * 사용자 프로필 조회 및 수정
 */

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, User, Mail, Shield } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';

interface ProfileFormData {
  name: string;
  email: string;
  current_password?: string;
  new_password?: string;
  confirm_password?: string;
}

export default function ProfilePage() {
  const { data: session, status, update } = useSession();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState<ProfileFormData>({
    name: session?.user?.name || '',
    email: session?.user?.email || '',
  });

  const [passwordData, setPasswordData] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });

  // 프로필 업데이트 Mutation
  const updateProfileMutation = useMutation({
    mutationFn: async (data: { name: string }) => {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to update profile');
      }

      return res.json();
    },
    onSuccess: async () => {
      await update({ name: formData.name });
      toast({
        title: '프로필 업데이트 완료',
        description: '프로필 정보가 성공적으로 업데이트되었습니다.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: '프로필 업데이트 실패',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // 비밀번호 변경 Mutation
  const changePasswordMutation = useMutation({
    mutationFn: async (data: { current_password: string; new_password: string }) => {
      const res = await fetch('/api/profile/password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to change password');
      }

      return res.json();
    },
    onSuccess: () => {
      setPasswordData({
        current_password: '',
        new_password: '',
        confirm_password: '',
      });
      toast({
        title: '비밀번호 변경 완료',
        description: '비밀번호가 성공적으로 변경되었습니다.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: '비밀번호 변경 실패',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfileMutation.mutate({ name: formData.name });
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (passwordData.new_password !== passwordData.confirm_password) {
      toast({
        title: '비밀번호 불일치',
        description: '새 비밀번호와 확인 비밀번호가 일치하지 않습니다.',
        variant: 'destructive',
      });
      return;
    }

    if (passwordData.new_password.length < 8) {
      toast({
        title: '비밀번호 길이 부족',
        description: '비밀번호는 최소 8자 이상이어야 합니다.',
        variant: 'destructive',
      });
      return;
    }

    changePasswordMutation.mutate({
      current_password: passwordData.current_password,
      new_password: passwordData.new_password,
    });
  };

  if (status === 'loading') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">내 프로필</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">계정 정보 및 비밀번호 관리</p>
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const initials = session?.user?.name
    ? session.user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
    : session?.user?.email?.[0].toUpperCase() || 'U';

  const roleLabel = session?.user?.role === 'admin' ? '관리자' : session?.user?.role === 'tuner' ? '튜너' : '뷰어';

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">내 프로필</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1">계정 정보 및 비밀번호 관리</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* 프로필 정보 */}
        <Card>
          <CardHeader>
            <CardTitle>프로필 정보</CardTitle>
            <CardDescription>기본 계정 정보를 확인하고 수정합니다</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 아바타 */}
            <div className="flex items-center gap-4">
              <Avatar className="h-20 w-20">
                <AvatarFallback className="bg-slate-700 text-white text-2xl">{initials}</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium text-lg">{session?.user?.name || session?.user?.email}</p>
                <p className="text-sm text-muted-foreground">{roleLabel}</p>
              </div>
            </div>

            <form onSubmit={handleProfileSubmit} className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="name">
                  <User className="inline h-4 w-4 mr-1" />
                  이름
                </Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="이름을 입력하세요"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="email">
                  <Mail className="inline h-4 w-4 mr-1" />
                  이메일
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  disabled
                  className="bg-slate-100"
                />
                <p className="text-xs text-muted-foreground">이메일은 변경할 수 없습니다.</p>
              </div>

              <div className="grid gap-2">
                <Label>
                  <Shield className="inline h-4 w-4 mr-1" />
                  역할
                </Label>
                <Input value={roleLabel} disabled className="bg-slate-100" />
                <p className="text-xs text-muted-foreground">역할은 관리자만 변경할 수 있습니다.</p>
              </div>

              <Button type="submit" disabled={updateProfileMutation.isPending} className="w-full">
                <Save className="h-4 w-4 mr-2" />
                {updateProfileMutation.isPending ? '저장 중...' : '프로필 저장'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* 비밀번호 변경 */}
        <Card>
          <CardHeader>
            <CardTitle>비밀번호 변경</CardTitle>
            <CardDescription>계정 보안을 위해 주기적으로 비밀번호를 변경하세요</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="current_password">현재 비밀번호</Label>
                <Input
                  id="current_password"
                  type="password"
                  value={passwordData.current_password}
                  onChange={(e) => setPasswordData({ ...passwordData, current_password: e.target.value })}
                  placeholder="현재 비밀번호 입력"
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="new_password">새 비밀번호</Label>
                <Input
                  id="new_password"
                  type="password"
                  value={passwordData.new_password}
                  onChange={(e) => setPasswordData({ ...passwordData, new_password: e.target.value })}
                  placeholder="새 비밀번호 입력 (최소 8자)"
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="confirm_password">새 비밀번호 확인</Label>
                <Input
                  id="confirm_password"
                  type="password"
                  value={passwordData.confirm_password}
                  onChange={(e) => setPasswordData({ ...passwordData, confirm_password: e.target.value })}
                  placeholder="새 비밀번호 재입력"
                  required
                />
              </div>

              <Button type="submit" disabled={changePasswordMutation.isPending} className="w-full">
                <Save className="h-4 w-4 mr-2" />
                {changePasswordMutation.isPending ? '변경 중...' : '비밀번호 변경'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* 계정 정보 */}
      <Card className="border-blue-500 bg-blue-50">
        <CardContent className="flex gap-3 pt-6">
          <User className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-blue-900">계정 정보</p>
            <p className="text-xs text-blue-800">
              이메일: {session?.user?.email} | 역할: {roleLabel}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
