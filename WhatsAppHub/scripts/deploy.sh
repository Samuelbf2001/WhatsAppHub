#!/bin/bash

# Script de despliegue para WhatsAppHub en whatsapphub.cloud

echo "🚀 Iniciando despliegue de WhatsAppHub..."

# Colores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Función para logs
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
}

# Verificar que estamos en el directorio correcto
if [ ! -f "package.json" ]; then
    error "No se encontró package.json. Ejecuta este script desde el directorio del proyecto."
    exit 1
fi

# Backup de la aplicación actual
log "Creando backup..."
if [ -d "/var/www/whatsapphub-backup" ]; then
    rm -rf /var/www/whatsapphub-backup
fi
cp -r /var/www/whatsapphub /var/www/whatsapphub-backup 2>/dev/null || warn "No se pudo crear backup"

# Git pull
log "Actualizando código desde repositorio..."
git pull origin main

if [ $? -ne 0 ]; then
    error "Error al hacer git pull"
    exit 1
fi

# Instalar dependencias
log "Instalando dependencias..."
npm install --production

if [ $? -ne 0 ]; then
    error "Error al instalar dependencias"
    exit 1
fi

# Copiar archivo de configuración de producción
log "Configurando entorno de producción..."
cp .env.production .env

# Crear directorio de logs si no existe
mkdir -p logs

# Verificar que PM2 esté instalado
if ! command -v pm2 &> /dev/null; then
    log "Instalando PM2..."
    npm install -g pm2
fi

# Detener aplicación actual
log "Deteniendo aplicación actual..."
pm2 stop whatsapphub 2>/dev/null || warn "La aplicación no estaba corriendo"

# Iniciar aplicación
log "Iniciando aplicación..."
pm2 start ecosystem.config.js --env production

if [ $? -eq 0 ]; then
    log "✅ Aplicación iniciada correctamente"
    
    # Guardar configuración PM2
    pm2 save
    
    # Verificar estado
    pm2 status whatsapphub
    
    log "🎉 Despliegue completado exitosamente!"
    log "🌐 Aplicación disponible en: https://whatsapphub.cloud"
    
else
    error "Error al iniciar la aplicación"
    
    # Restaurar backup si existe
    if [ -d "/var/www/whatsapphub-backup" ]; then
        warn "Restaurando backup..."
        rm -rf /var/www/whatsapphub
        mv /var/www/whatsapphub-backup /var/www/whatsapphub
        pm2 start ecosystem.config.js --env production
    fi
    
    exit 1
fi

log "Logs disponibles con: pm2 logs whatsapphub"