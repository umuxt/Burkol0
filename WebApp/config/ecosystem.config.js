// PM2 process manager configuration for BeePlan WebApp
// Usage:
//   cd WebApp
//   pm2 start ecosystem.config.js
//   pm2 status
//   pm2 logs beeplan
//   pm2 restart beeplan
//   pm2 save && pm2 startup

module.exports = {
  apps: [
    {
      name: 'beeplan',
      script: 'server.js',
      instances: 1,
      exec_mode: 'fork', // or 'cluster' to use all CPU cores
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        // Set a strong secret in production via environment if needed
        // BEEPLAN_SECRET: 'change-me-in-production'
      },
      env_development: {
        NODE_ENV: 'development',
      },
      out_file: 'logs/out.log',
      error_file: 'logs/err.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
}

