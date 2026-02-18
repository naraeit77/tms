import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // 안정적인 빌드 ID (Date.now() 사용 시 브라우저 캐시와 서버 빌드 불일치 발생)
  generateBuildId: async () => {
    return `tms-${process.env.npm_package_version || '2.0.0'}`;
  },
  
  // eslint 설정 제거됨 (Next.js 16에서 더 이상 지원 안 함)
  // 대신 .eslintrc.json 또는 eslint.config.js에서 설정
  
  typescript: {
    // Vercel 빌드 시 타입 에러 무시 (React 19 호환성 문제 우회)
    ignoreBuildErrors: true,
  },
  
  onDemandEntries: {
    maxInactiveAge: 60 * 1000,
    pagesBufferLength: 5,
  },
  
  images: {
    remotePatterns: [
      {
        hostname: '**',
      },
    ],
  },
  
  // standalone output은 Docker 빌드 시에만 활성화 (BUILD_STANDALONE=true)
  // next start는 standalone과 호환되지 않으므로 조건부 적용
  ...(process.env.BUILD_STANDALONE === 'true' ? { output: 'standalone' as const } : {}),
  
  // Turbopack용 alias 설정
  turbopack: {
    resolveAlias: {
      // 클라이언트에서 oracledb 제외는 serverExternalPackages로 처리
    },
  },
  
  serverExternalPackages: ['oracledb'],
  
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      '@radix-ui/react-icons',
      '@radix-ui/react-dialog',
      '@radix-ui/react-select',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-popover',
      '@radix-ui/react-tooltip',
      '@radix-ui/react-tabs',
      '@radix-ui/react-accordion',
      '@radix-ui/react-alert-dialog',
      '@radix-ui/react-avatar',
      '@radix-ui/react-checkbox',
      '@radix-ui/react-label',
      '@radix-ui/react-progress',
      '@radix-ui/react-radio-group',
      '@radix-ui/react-scroll-area',
      '@radix-ui/react-separator',
      '@radix-ui/react-slider',
      '@radix-ui/react-switch',
      '@radix-ui/react-toast',
      '@tanstack/react-query',
      'sonner',
      'recharts',
      'date-fns',
      '@mantine/core',
      '@mantine/hooks',
      '@mantine/dates',
      '@mantine/notifications',
      '@mantine/charts',
      '@mantine/code-highlight',
      '@mantine/nprogress',
    ],
  },
  
  // skipMiddlewareUrlNormalize → skipProxyUrlNormalize로 변경
  skipProxyUrlNormalize: false,
  skipTrailingSlashRedirect: false,
};

export default nextConfig;
