# 🔑 Credenciales OAuth de HubSpot - WhatsAppHub

## ✅ **Credenciales obtenidas del proyecto HubSpot:**

### **Información del proyecto:**
- **Proyecto:** WhatsAppHub Integration
- **Build:** #3 (desplegado)
- **Portal ID:** 49753409
- **URL del proyecto:** https://app.hubspot.com/developer-projects/49753409/project/WhatsAppHub

### **Credenciales OAuth:**
```
ID de aplicación: 12402854
ID de cliente: 0e35816b-ac03-4c90-ace2-02b3075f9d18
Secreto del cliente: 7ecf7262-f9b1-4f58-8940-be9ca36930e5
```

### **Variables de entorno configuradas:**
```env
CLIENT_ID=0e35816b-ac03-4c90-ace2-02b3075f9d18
CLIENT_SECRET=7ecf7262-f9b1-4f58-8940-be9ca36930e5
```

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
✅ **Proyecto HubSpot desplegado (Build #3)**  
⏳ **Pendiente:** Configurar DNS y desplegar en servidor  

**¡Listo para probar el flujo OAuth!** 🎉 