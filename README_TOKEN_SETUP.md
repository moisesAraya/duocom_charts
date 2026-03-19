# Flujo de Configuración Inicial por TOKEN - RESUMEN EJECUTIVO

## 📋 Cambios Realizados

### Backend (TypeScript)
1. **Nuevo endpoint:** `POST /api/validar-token`
2. **Nuevos tipos:** `TokenConfigData`, `TokenValidationResponse`
3. **Función helper:** `fetchClienteByToken()`
4. **Middleware actualizado:** `apiKeyMiddleware` (excepciones públicas)

### Frontend (React Native / Expo)
1. **Nuevo módulo:** `utils/empresa-storage.ts` - Gestión de token + config
2. **Nueva pantalla:** `app/config-token.tsx` - Ingreso de token
3. **Pantalla actualizada:** `app/check-auth.tsx` - Nuevo flujo
4. **Pantalla actualizada:** `app/login.tsx` - Auto-load empresa
5. **Función actualizada:** `config.ts` - getAuthHeaders() con headers de empresa

---

## 🔄 Flujo de Uso

```
SPLASH
  ↓
CHECK-AUTH
  ├─ Si: usuario logueado → TABS (app)
  ├─ Si: token empresa → LOGIN
  └─ No: → CONFIG-TOKEN
    ├─ Usuario ingresa token
    ├─ Backend valida
    ├─ Guarda localmente
    └─ → LOGIN
```

---

## ✅ Features Implementados

- ✓ Almacenamiento persistente de token + configuración
- ✓ Validación de token en backend (8+ caracteres)
- ✓ Búsqueda de empresa activa por TOKEN
- ✓ Fallback a búsqueda por RUT (si TOKEN no existe como campo)
- ✓ Auto-load de empresa en login si está configurada
- ✓ Limpieza completa al logout
- ✓ Headers automáticos (x-api-key + x-cliente-config)
- ✓ Manejo robusto de errores
- ✓ Loading states + user feedback

---

## 📚 Documentación Completa

Para detalles completos, ver: [`docs/FLUJO_TOKEN_EMPRESA.md`](./FLUJO_TOKEN_EMPRESA.md)

### Incluye:
- Arquitectura detallada
- Request/response ejemplos
- Casos de test (5 escenarios)
- SQL setup data
- Guía paso a paso

---

## 🧪 Test Data

SQL para configurar empresa de test:

```bash
# Archivo: docs/setup-test-data.sql
# Ejecutar en BD DUOCOMAPPS con DBeaver o similar
```

Datos de ejemplo:
- RUT: 111111111
- Token: `duocom-matriz-token-001`
- Empresa: DuoCOM Chile SPA

---

## 🚀 Inicio Rápido

### 1. Setup Database
```bash
# Ejecutar docs/setup-test-data.sql en DUOCOMAPPS
# Línea 24-36 (opción 1)
```

### 2. Backend
```bash
cd apps/api
npm run dev        # port 3000
# Verificar: curl http://localhost:3000/health
```

### 3. Frontend
```bash
cd frontend
npx expo start
# Seleccionar: i (iOS) o a (Android)
```

### 4. Test
1. Abrir app en emulador
2. Ver CONFIG-TOKEN
3. Ingresar: `duocom-matriz-token-001`
4. Validar token
5. Ir a login
6. Ingresar credenciales
7. ✓ Acceso!

---

## 📦 Archivos Nuevos

```
Backend:
  - apps/api/src/types/tokenConfig.ts

Frontend:
  - frontend/utils/empresa-storage.ts
  - frontend/app/config-token.tsx

Docs:
  - docs/FLUJO_TOKEN_EMPRESA.md
  - docs/setup-test-data.sql
  - README_TOKEN_SETUP.md (this file)
```

---

## 🔐 Seguridad

✅ Implementado:
- Validación frontend + backend
- Sanitización de inputs
- Limpieza al logout
- Headers de autenticación en cada request

⚠️ Producción:
- Encriptar tokens en AsyncStorage
- HTTPS obligatorio
- Rate limiting en /validar-token
- Auditoría de intentos fallidos

---

## 📞 Troubleshooting

### Sintoma: CONFIG-TOKEN no aparece
**Solución:** Verificar `check-auth.tsx` routing

### Sintoma: Token validado pero error en Login
**Solución:** 
- Verificar credenciales BD correctas
- Revisar config.ts (usuario/password Firebird)

### Sintoma: App no persiste token
**Solución:** 
- Verificar AsyncStorage permisos
- Revisar logs: `[EmpresaStorage]`

### Sintoma: Headers no se envían
**Solución:** 
- Llamar `getAuthHeaders()` en request
- Verificar: `getEmpresaAuthHeaders()` en empresa-storage

---

## 🎯 Proximos Pasos Opcionales

1. Encriptación de tokens en AsyncStorage
2. Biometría (Face ID / Huella)
3. Refresh automático de token
4. Dashboard de cambio de empresa
5. Caché offline

---

**Implementación completada - Lista para testing y deployment**
