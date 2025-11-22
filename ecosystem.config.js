/**
 * PM2 Ecosystem Configuration for Narae TMS v2.0
 * SQL Tuning Management System by 주식회사 나래정보기술
 *
 * Usage:
 *   pm2 start ecosystem.config.js --env production
 *   pm2 reload ecosystem.config.js
 *   pm2 stop ecosystem.config.js
 *   pm2 logs narae-tms
 */

module.exports = {
  apps: [
    {
      name: 'narae-tms',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      cwd: './',
      instances: 'max', // Use all available CPUs
      exec_mode: 'cluster', // Cluster mode for load balancing
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      listen_timeout: 10000,
      kill_timeout: 5000,
      wait_ready: true,
    },
  ],

  deploy: {
    production: {
      user: 'deploy',
      host: ['your-server.com'],
      ref: 'origin/main',
      repo: 'git@github.com:your-username/narae-tms.git',
      path: '/var/www/narae-tms',
      'pre-deploy': 'git pull',
      'post-deploy':
        'npm ci && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-setup': '',
    },
  },
};
