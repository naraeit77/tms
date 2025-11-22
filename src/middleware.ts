import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

/**
 * NextAuth Middleware
 * 인증이 필요한 경로 보호
 */
export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const isAuth = !!token;
    const isAuthPage = req.nextUrl.pathname.startsWith('/auth');

    // 인증된 사용자가 auth 페이지 접근 시 dashboard로 리다이렉트
    if (isAuthPage && isAuth) {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ req, token }) => {
        const isAuthPage = req.nextUrl.pathname.startsWith('/auth');
        const isDashboardPage = req.nextUrl.pathname.startsWith('/dashboard');
        const isMonitoringPage = req.nextUrl.pathname.startsWith('/monitoring');
        const isTuningPage = req.nextUrl.pathname.startsWith('/tuning');
        const isConnectionsPage = req.nextUrl.pathname.startsWith('/connections');

        // auth 페이지는 항상 접근 가능
        if (isAuthPage) {
          return true;
        }

        // 보호된 페이지는 인증 필요
        if (isDashboardPage || isMonitoringPage || isTuningPage || isConnectionsPage) {
          return !!token;
        }

        // 기타 페이지는 접근 가능
        return true;
      },
    },
    pages: {
      signIn: '/auth/signin',
    },
  }
);

// 미들웨어가 적용될 경로 설정
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
