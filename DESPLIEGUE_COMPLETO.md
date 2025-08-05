# 🚀 Guía Completa de Despliegue - whatsapphub.cloud

## 📋 **Archivos creados:**

✅ `nginx.conf` - Configuración de Nginx  
✅ `ecosystem.config.js` - Configuración de PM2  
✅ `config.production.env` - Variables de entorno para producción  
✅ `config.development.env` - Variables de entorno para desarrollo  
✅ `.env` - Variables de entorno activas (OAuth funcionando)
✅ `deploy.sh` - Script de despliegue automatizado  
✅ `setup-server.sh` - Script de configuración inicial del servidor  
✅ `SOLUCION_OAUTH.md` - Documentación de resolución de problemas OAuth
✅ Configuración HubSpot actualizada con URLs de producción (Build #6)

## 🌐 **PASO 1: Configurar DNS**

En tu proveedor de DNS (donde compraste whatsapphub.cloud):

```
Tipo    Nombre                  Valor                TTL
A       whatsapphub.cloud      145.79.2.141         300
A       www                    145.79.2.141         300
```

**Verificar DNS:**
```bash
nslookup whatsapphub.cloud
ping whatsapphub.cloud
```

## 🖥️ **PASO 2: Configurar VPS**

### **2.1 Conectar al VPS:**
```bash
ssh root@145.79.2.141
```

### **2.2 Ejecutar configuración inicial:**
```bash
# Descargar y ejecutar script de configuración
wget https://raw.githubusercontent.com/tu-repo/setup-server.sh
chmod +x setup-server.sh
sudo ./setup-server.sh
```

### **2.3 Configurar SSL con Let's Encrypt:**
```bash
# Después de que DNS esté propagado
certbot --nginx -d whatsapphub.cloud -d www.whatsapphub.cloud
```

## 📦 **PASO 3: Desplegar Aplicación**

### **3.1 Clonar repositorio:**
```bash
cd /var/www
git clone https://github.com/tu-usuario/whatsapphub.git
cd whatsapphub
```

### **3.2 Configurar entorno:**
```bash
# Copiar configuración de producción
cp config.production.env .env

# Editar variables
nano .env
```

### **3.3 Instalar y ejecutar:**
```bash
npm install --production
chmod +x deploy.sh
./deploy.sh
```

## 🔧 **PASO 4: Configurar HubSpot**

### **4.1 Obtener credenciales OAuth:**

1. Ve a: https://app.hubspot.com/developer-projects/49753409/project/WhatsAppHub
2. En **WhatsAppHub Integration**, copia:
   - Client ID
   - Client Secret

### **4.2 Actualizar .env:**
```bash
nano .env
# Actualizar CLIENT_ID y CLIENT_SECRET
# SCOPE ya incluye todos los permisos necesarios (Build #6)
```

### **4.3 Scopes OAuth configurados (Build #6):**
- ✅ **crm.lists.write** - Crear y gestionar listas/segmentos
- ✅ **crm.objects.companies.read/write** - Gestión completa de empresas
- ✅ **crm.objects.contacts.read/write** - Gestión completa de contactos  
- ✅ **crm.objects.deals.read/write** - Gestión completa de oportunidades
- ✅ **crm.objects.owners.read** - Lectura de propietarios/usuarios
- ✅ **crm.schemas.*.read** - Esquemas de propiedades de objetos
- ✅ **files** - Gestión completa de archivos
- ✅ **forms** - Gestión completa de formularios
- ✅ **oauth** - Funcionalidades OAuth avanzadas
- ✅ **tickets** - Gestión completa de tickets de soporte

### **4.4 Subir configuración actualizada a HubSpot:**
```bash
cd WhatsAppHub
hs project upload
```

## 🧪 **PASO 5: Probar la aplicación**

### **5.1 Verificar estado:**
```bash
pm2 status
pm2 logs whatsapphub
curl https://whatsapphub.cloud/health
```

### **5.2 Probar OAuth:**
1. Ve a: `https://whatsapphub.cloud/install`
2. Autoriza en HubSpot
3. Verifica datos en: `https://whatsapphub.cloud/`

### **5.3 Probar API:**
```bash
curl https://whatsapphub.cloud/api/contacts
```

## 💻 **DESARROLLO LOCAL**

### **5.1 Configurar ngrok:**
```bash
npm install -g ngrok
ngrok http 3000
```

### **5.2 Configurar entorno local:**
```bash
cp config.development.env .env
# Actualizar WEBHOOK_URL con URL de ngrok
npm run dev
```

## 📁 **Estructura final:**

```
/var/www/whatsapphub/
├── index.js                 # Aplicación principal
├── package.json            # Dependencias
├── ecosystem.config.js     # Configuración PM2
├── .env                    # Variables de producción
├── nginx.conf              # Configuración Nginx
├── deploy.sh               # Script de despliegue
├── logs/                   # Logs de la aplicación
├── src/
│   └── services/
│       └── hubspotService.js
└── WhatsAppHub/            # Proyecto HubSpot
    └── src/app/
        ├── public-app.json
        └── webhooks/webhooks.json
```

## 🔍 **Comandos útiles:**

```bash
# Ver logs en tiempo real
pm2 logs whatsapphub --lines 100

# Reiniciar aplicación
pm2 restart whatsapphub

# Ver estado del servidor
systemctl status nginx
systemctl status certbot.timer

# Verificar SSL
openssl s_client -connect whatsapphub.cloud:443

# Test de conectividad
curl -I https://whatsapphub.cloud
```

## 🚨 **Solución de problemas:**

### **DNS no resuelve:**
- Esperar propagación (hasta 48h)
- Verificar con: `dig whatsapphub.cloud`

### **SSL no funciona:**
- Verificar que DNS esté propagado
- Ejecutar: `certbot renew --dry-run`

### **Aplicación no responde:**
- Verificar: `pm2 logs whatsapphub`
- Reiniciar: `pm2 restart whatsapphub`

### **Webhook no recibe datos:**
- Verificar firewall: `ufw status`
- Verificar logs: `tail -f /var/log/nginx/error.log`

## ✅ **Checklist de verificación:**

- [ ] DNS configurado y propagado
- [ ] VPS configurado con Node.js, Nginx, PM2
- [ ] SSL instalado y funcionando
- [ ] Aplicación desplegada y corriendo
- [ ] Variables de entorno configuradas
- [ ] Proyecto HubSpot actualizado (Build #6 con scopes ampliados)
- [ ] OAuth funcionando
- [ ] Webhooks recibiendo datos
- [ ] Logs funcionando correctamente

¡Tu aplicación estará disponible en https://whatsapphub.cloud! 🎉