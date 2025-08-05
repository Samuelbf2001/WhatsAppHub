#!/bin/bash

# Script de configuración inicial del servidor para WhatsAppHub
# IP del servidor: 145.79.2.141

echo "🔧 Configurando servidor para WhatsAppHub..."

# Colores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
}

# Verificar que somos root
if [ "$EUID" -ne 0 ]; then
    error "Este script debe ejecutarse como root (sudo)"
    exit 1
fi

log "🚀 Iniciando configuración del servidor 145.79.2.141"

# Actualizar sistema
log "Actualizando sistema..."
apt update && apt upgrade -y

# Instalar dependencias básicas
log "Instalando dependencias..."
apt install -y curl wget git nginx ufw

# Instalar Node.js (LTS)
log "Instalando Node.js..."
curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
apt install -y nodejs

# Verificar instalación
node_version=$(node --version)
npm_version=$(npm --version)
log "Node.js instalado: $node_version"
log "npm instalado: $npm_version"

# Instalar PM2
log "Instalando PM2..."
npm install -g pm2

# Configurar PM2 para autostart
pm2 startup
pm2 save

# Configurar firewall
log "Configurando firewall..."
ufw allow ssh
ufw allow http
ufw allow https
ufw --force enable

# Crear directorio para la aplicación
log "Creando directorio de aplicación..."
mkdir -p /var/www/whatsapphub
chown -R www-data:www-data /var/www/whatsapphub

# Configurar Nginx
log "Configurando Nginx..."
# El archivo nginx.conf debe copiarse manualmente a /etc/nginx/sites-available/whatsapphub
# y crear symlink a sites-enabled

cat > /etc/nginx/sites-available/whatsapphub << 'EOF'
# Configuración básica temporal
server {
    listen 80;
    server_name whatsapphub.cloud www.whatsapphub.cloud;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

# Habilitar sitio
ln -sf /etc/nginx/sites-available/whatsapphub /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Verificar configuración de Nginx
nginx -t

if [ $? -eq 0 ]; then
    log "Configuración de Nginx válida"
    systemctl restart nginx
    systemctl enable nginx
else
    error "Error en configuración de Nginx"
    exit 1
fi

# Instalar Certbot para SSL
log "Instalando Certbot..."
apt install -y certbot python3-certbot-nginx

log "🎉 Configuración del servidor completada!"
log ""
log "📋 Próximos pasos:"
log "1. Configurar DNS para que whatsapphub.cloud apunte a 145.79.2.141"
log "2. Ejecutar: certbot --nginx -d whatsapphub.cloud -d www.whatsapphub.cloud"
log "3. Clonar repositorio en /var/www/whatsapphub"
log "4. Ejecutar script de despliegue"
log ""
log "🔧 Comandos útiles:"
log "- Ver logs de Nginx: tail -f /var/log/nginx/error.log"
log "- Reiniciar Nginx: systemctl restart nginx"
log "- Ver estado PM2: pm2 status"
log "- Ver logs de aplicación: pm2 logs whatsapphub"