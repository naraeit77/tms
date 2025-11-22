'use client';

/**
 * Global Error Page
 * Catches errors in the root layout
 */

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body>
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(to bottom right, #f8fafc, #e2e8f0)',
          padding: '1rem',
        }}>
          <div style={{
            width: '100%',
            maxWidth: '28rem',
            background: 'white',
            borderRadius: '0.5rem',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
            padding: '2rem',
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '1rem',
              }}>
                <div style={{
                  background: '#fef2f2',
                  padding: '1rem',
                  borderRadius: '0.5rem',
                }}>
                  <svg
                    style={{ height: '3rem', width: '3rem', color: '#dc2626' }}
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

              <h1 style={{
                fontSize: '1.875rem',
                fontWeight: 'bold',
                color: '#0f172a',
                marginBottom: '0.5rem',
              }}>
                500
              </h1>
              <h2 style={{
                fontSize: '1.25rem',
                fontWeight: '600',
                color: '#334155',
                marginBottom: '1rem',
              }}>
                서버 오류가 발생했습니다
              </h2>
              <p style={{
                color: '#64748b',
                marginBottom: '1.5rem',
              }}>
                죄송합니다. 일시적인 오류가 발생했습니다.
                잠시 후 다시 시도해주세요.
              </p>

              {error.digest && (
                <div style={{
                  background: '#f1f5f9',
                  padding: '1rem',
                  borderRadius: '0.5rem',
                  marginBottom: '1.5rem',
                  textAlign: 'left',
                }}>
                  <p style={{
                    fontSize: '0.75rem',
                    color: '#475569',
                    fontFamily: 'monospace',
                  }}>
                    Error ID: {error.digest}
                  </p>
                </div>
              )}

              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
                paddingTop: '1rem',
              }}>
                <button
                  onClick={reset}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0.5rem 1rem',
                    background: '#0f172a',
                    color: 'white',
                    borderRadius: '0.5rem',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '1rem',
                  }}
                >
                  다시 시도
                </button>
                <a
                  href="/"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0.5rem 1rem',
                    border: '1px solid #cbd5e1',
                    color: '#334155',
                    borderRadius: '0.5rem',
                    textDecoration: 'none',
                  }}
                >
                  홈으로 이동
                </a>
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
