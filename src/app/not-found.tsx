/**
 * Custom 404 Not Found Page
 * Server component to avoid context issues during build
 */

import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-lg p-8">
        <div className="text-center space-y-6">
          <div className="flex items-center justify-center mb-4">
            <div className="bg-orange-100 p-4 rounded-lg">
              <svg
                className="h-12 w-12 text-orange-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
          </div>

          <h1 className="text-3xl font-bold text-slate-900">404</h1>
          <h2 className="text-xl font-semibold text-slate-700">페이지를 찾을 수 없습니다</h2>
          <p className="text-slate-600">
            요청하신 페이지가 존재하지 않거나 이동되었습니다.
          </p>

          <div className="bg-slate-50 p-4 rounded-lg text-left">
            <h3 className="font-medium text-sm mb-2 text-slate-900">이런 경우일 수 있습니다:</h3>
            <ul className="text-sm text-slate-600 space-y-1 list-disc list-inside">
              <li>URL이 잘못 입력되었습니다</li>
              <li>페이지가 삭제되었거나 이동했습니다</li>
              <li>접근 권한이 없는 페이지입니다</li>
            </ul>
          </div>

          <div className="flex flex-col gap-3 pt-4">
            <Link
              href="/"
              className="inline-flex items-center justify-center px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              홈으로 이동
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
            >
              대시보드로 이동
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
