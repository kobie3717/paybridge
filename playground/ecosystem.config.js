module.exports = {
  apps: [
    {
      name: 'paybridge-playground',
      script: 'server.js',
      cwd: '/root/paybridge/playground',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '256M',
      env: {
        NODE_ENV: 'production',
        PORT: 4020,
      },
      error_file: '/root/logs/paybridge-playground-error.log',
      out_file: '/root/logs/paybridge-playground-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
