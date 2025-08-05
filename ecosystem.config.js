// Configuración PM2 para WhatsAppHub en producción

module.exports = {
  apps: [{
    name: 'whatsapphub',
    script: 'index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    env: {
      NODE_ENV: 'development',
      PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }],

  deploy: {
    production: {
      user: 'root',
      host: '145.79.2.141',
      ref: 'origin/main',
      repo: 'git@github.com:tu-usuario/whatsapphub.git',
      path: '/var/www/whatsapphub',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    }
  }
};