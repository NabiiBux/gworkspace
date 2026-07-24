// PM2 process config for the VPS. Start with:  pm2 start ecosystem.config.js
// dotenv inside backend-server.js loads backend/.env, so no env vars are needed here.
module.exports = {
  apps: [
    {
      name: 'gworkspace-api',
      script: 'backend-server.js',
      cwd: __dirname,
      instances: 1,                 // single instance — the in-process daily billing scheduler must not run twice
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 20,
      restart_delay: 5000,
      max_memory_restart: '600M',
      out_file: './logs/api.out.log',
      error_file: './logs/api.err.log',
      merge_logs: true,
      time: true,                   // timestamps in logs (like Railway logs)
      env: { NODE_ENV: 'production' },
    },
  ],
};
