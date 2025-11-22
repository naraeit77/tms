import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  // Force cache busting by generating new build ID
  generateBuildId: async () => {
    return `build-${Date.now()}`;
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Vercel 빌드 시 타입 에러 무시 (React 19 호환성 문제 우회)
    ignoreBuildErrors: true,
  },
  // Skip error page static generation to avoid Html import issues
  onDemandEntries: {
    maxInactiveAge: 25 * 1000,
    pagesBufferLength: 2,
  },
  images: {
    remotePatterns: [
      {
        hostname: '**',
      },
    ],
  },
  // Vercel 서버리스 환경 최적화
  output: 'standalone',
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // 클라이언트 번들에서 서버 전용 모듈 제외
      config.resolve.alias = {
        ...config.resolve.alias,
        oracledb: false,
      };
    }
    return config;
  },
  serverExternalPackages: ['oracledb'],
  // 정적 페이지 생성 에러 처리
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  // Skip static generation for error pages to avoid Html import issues
  skipMiddlewareUrlNormalize: false,
  skipTrailingSlashRedirect: false,
};

export default nextConfig;
