'use client';

/**
 * Auth Error Page
 * 인증 오류 페이지
 */

export const dynamic = 'force-dynamic';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

function AuthErrorContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');

  const getErrorInfo = (error: string | null) => {
    const errors: Record<string, { title: string; description: string }> = {
      Configuration: {
        title: '서버 구성 오류',
        description: '인증 서버 구성에 문제가 있습니다. 관리자에게 문의해주세요.',
      },
      AccessDenied: {
        title: '접근 거부',
        description: '이 리소스에 접근할 권한이 없습니다.',
      },
      Verification: {
        title: '인증 실패',
        description: '인증 토큰이 만료되었거나 유효하지 않습니다.',
      },
      Default: {
        title: '인증 오류',
        description: '인증 처리 중 오류가 발생했습니다. 다시 시도해주세요.',
      },
    };

    return errors[error || 'Default'] || errors.Default;
  };

  const errorInfo = getErrorInfo(error);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-center mb-4">
            <div className="bg-red-100 p-3 rounded-lg">
              <AlertCircle className="h-8 w-8 text-red-600" />
            </div>
          </div>
          <CardTitle className="text-2xl text-center">인증 오류</CardTitle>
          <CardDescription className="text-center">
            TMS v2.0 로그인 중 문제가 발생했습니다
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{errorInfo.title}</AlertTitle>
            <AlertDescription>{errorInfo.description}</AlertDescription>
          </Alert>

          <div className="bg-slate-50 p-4 rounded-lg">
            <h3 className="font-medium text-sm mb-2">문제 해결 방법:</h3>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>브라우저 쿠키 및 캐시를 삭제해보세요</li>
              <li>다른 브라우저를 사용해보세요</li>
              <li>문제가 계속되면 관리자에게 문의하세요</li>
            </ul>
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-3">
          <Button asChild className="w-full">
            <Link href="/auth/signin">로그인 페이지로 돌아가기</Link>
          </Button>

          <Button asChild variant="outline" className="w-full">
            <Link href="/">홈으로 이동</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
          <Card className="w-full max-w-md">
            <CardContent className="p-6 text-center">
              <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
            </CardContent>
          </Card>
        </div>
      }
    >
      <AuthErrorContent />
    </Suspense>
  );
}
