/**
 * PM2 Ecosystem Configuration for Narae TMS v2.0
 * Production deployment configuration
 */

module.exports = {
  apps: [
    {
      name: 'narae-tms',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      cwd: '/var/www/tms',

      // 클러스터 모드 - CPU 코어 수만큼 인스턴스 생성
      instances: 'max', // 또는 구체적인 숫자 (예: 4)
      exec_mode: 'cluster',

      // 기본 환경 변수
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },

      // 프로덕션 환경 변수
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        // Oracle Instant Client 경로
        LD_LIBRARY_PATH: '/usr/lib/oracle/21/client64/lib',
        ORACLE_HOME: '/usr/lib/oracle/21/client64',
        TNS_ADMIN: '/usr/lib/oracle/21/client64/network/admin',
      },

      // 스테이징 환경 변수 (선택사항)
      env_staging: {
        NODE_ENV: 'production',
        PORT: 3001,
        LD_LIBRARY_PATH: '/usr/lib/oracle/21/client64/lib',
        ORACLE_HOME: '/usr/lib/oracle/21/client64',
        TNS_ADMIN: '/usr/lib/oracle/21/client64/network/admin',
      },

      // 메모리 및 재시작 설정
      max_memory_restart: '1G',
      min_uptime: '10s',
      max_restarts: 10,
      autorestart: true,

      // 로그 설정
      error_file: '/var/log/pm2/narae-tms-error.log',
      out_file: '/var/log/pm2/narae-tms-out.log',
      log_file: '/var/log/pm2/narae-tms-combined.log',
      time: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // Watch 설정 (Production에서는 false 권장)
      watch: false,
      ignore_watch: ['node_modules', 'logs', '.next', '.git'],

      // Graceful shutdown 설정
      kill_timeout: 5000,
      listen_timeout: 3000,
      wait_ready: true,

      // 프로세스 관리
      instance_var: 'INSTANCE_ID',

      // 크론 기반 재시작 (선택사항 - 매일 새벽 4시 재시작)
      // cron_restart: '0 4 * * *',

      // 소스 맵 비활성화 (성능 향상)
      source_map_support: false,

      // 인터프리터 옵션
      node_args: '--max-old-space-size=2048',
    },
  ],

  // 배포 설정 (PM2 deploy 사용 시)
  deploy: {
    production: {
      user: 'tms',
      host: 'sqltms.info',
      ref: 'origin/main',
      repo: 'git@github.com:yourname/narae-tms.git',
      path: '/var/www/tms',
      'post-deploy': 'npm ci && npm run build && pm2 reload ecosystem.config.js --env production && pm2 save',
      'pre-setup': 'sudo dnf install git -y',
      env: {
        NODE_ENV: 'production',
      },
    },
  },
};
