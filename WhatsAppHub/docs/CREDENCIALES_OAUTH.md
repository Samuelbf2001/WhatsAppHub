# 🔑 Credenciales OAuth de HubSpot - WhatsAppHub

## ✅ **Credenciales obtenidas del proyecto HubSpot:**

### **Información del proyecto:**
- **Proyecto:** WhatsAppHub Integration
- **Build:** #3 (desplegado)
- **Portal ID:** 49753409
- **URL del proyecto:** https://app.hubspot.com/developer-projects/49753409/project/WhatsAppHub

### **Credenciales OAuth:**
```
ID de aplicación: 17272157
ID de cliente: 16364eec-31a5-4421-9c58-e9d0f2868797
Secreto del cliente: 0da5a703-ef03-4d69-b4dd-62d5e7a59042
```

### **Variables de entorno configuradas:**
```env
CLIENT_ID=16364eec-31a5-4421-9c58-e9d0f2868797
CLIENT_SECRET=0da5a703-ef03-4d69-b4dd-62d5e7a59042
SCOPE=crm.lists.write crm.objects.companies.read crm.objects.companies.write crm.objects.contacts.read crm.objects.contacts.write crm.objects.deals.read crm.objects.deals.write crm.objects.owners.read crm.schemas.companies.read crm.schemas.contacts.read crm.schemas.deals.read files forms oauth tickets
```

### **🔐 Scopes OAuth configurados:**
- **crm.lists.write** - Crear y gestionar listas/segmentos
- **crm.objects.companies.read/write** - Gestión completa de empresas
- **crm.objects.contacts.read/write** - Gestión completa de contactos  
- **crm.objects.deals.read/write** - Gestión completa de oportunidades
- **crm.objects.owners.read** - Lectura de propietarios/usuarios
- **crm.schemas.companies.read** - Esquemas de propiedades de empresas
- **crm.schemas.contacts.read** - Esquemas de propiedades de contactos
- **crm.schemas.deals.read** - Esquemas de propiedades de oportunidades
- **files** - Gestión completa de archivos
- **forms** - Gestión completa de formularios
- **oauth** - Funcionalidades OAuth avanzadas
- **tickets** - Gestión completa de tickets de soporte

## 📋 **Archivos actualizados:**

✅ `config.production.env` - Credenciales para producción  
✅ `config.development.env` - Credenciales para desarrollo  

## 🚀 **Próximos pasos:**

### **1. Para desarrollo local:**
```bash
# Copiar configuración de desarrollo
cp config.development.env .env

# Iniciar aplicación
npm run dev

# Probar OAuth
# Visita: http://localhost:3000/install
```

### **2. Para producción:**
```bash
# En el servidor 145.79.2.141
cp config.production.env .env

# Desplegar aplicación
./deploy.sh
```

## 🔗 **URLs configuradas:**

### **Desarrollo:**
- OAuth: http://localhost:3000/install
- Callback: http://localhost:3000/oauth-callback

### **Producción:**
- OAuth: https://whatsapphub.cloud/install
- Callback: https://whatsapphub.cloud/oauth-callback

## ✅ **Estado actual:**

✅ **Credenciales OAuth obtenidas**  
✅ **Archivos de configuración actualizados**  
✅ **Scopes OAuth ampliados (Build #6)**  
✅ **Proyecto HubSpot desplegado con nuevos permisos**  
✅ **Problema de redirección OAuth resuelto** (.env configurado)  
⏳ **Pendiente:** Configurar DNS y desplegar en servidor  

## 🔗 **Enlaces del Build #6:**
- **📊 Build #6:** https://app.hubspot.com/developer-projects/49753409/project/WhatsAppHub/activity/build/6
- **🚀 Deploy #4:** https://app.hubspot.com/developer-projects/49753409/project/WhatsAppHub/activity/deploy/4

## 🛠️ **Problema resuelto - Archivo .env:**
Se identificó y resolvió un problema crítico donde el archivo `.env` no existía, causando que:
- ❌ La aplicación no tuviera variables OAuth configuradas
- ❌ HubSpot no pudiera redirigir correctamente después de autorización
- ✅ **Solución:** Archivo `.env` creado con todas las credenciales correctas

**¡Listo para probar el flujo OAuth!** 🎉 