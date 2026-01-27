# Instrucciones para Generar APK

## 🎯 Modo Demo (Actual)

La app está configurada en **MODO DEMO** para mostrar gráficos de ejemplo sin necesidad de conectarse al backend.

### Características del Modo Demo:

✅ **Sin login requerido** - Va directo al dashboard  
✅ **Sin conexión a backend** - Usa datos de demostración  
✅ **Datos mock realistas** - Muestra gráficos funcionales  
✅ **Perfecto para presentaciones** - No requiere red ni servidor  

### Activar/Desactivar Modo Demo

Para cambiar entre modo demo y modo producción, edita [constants/mock-data.ts](constants/mock-data.ts) línea 3:

```typescript
export const DEMO_MODE = true; // true = demo, false = backend real
```

### Reactivar Backend y Login

Si quieres conectar al backend real:

1. **Desactivar modo demo**: En [constants/mock-data.ts](constants/mock-data.ts)
   ```typescript
   export const DEMO_MODE = false;
   ```

2. **Reactivar pantalla de login**: En [app/splash.tsx](app/splash.tsx) línea 17
   ```typescript
   router.replace('/login'); // en lugar de '/(tabs)/resumenes'
   ```

## Problemas Solucionados

Se han corregido varios problemas que causaban que el APK se cerrara inmediatamente:

1. ✅ **__DEV__ no disponible en producción** - Ahora usa detección segura de entorno
2. ✅ **Variables de entorno configuradas** - Las URLs de API están en app.json y eas.json
3. ✅ **Console.log protegidos** - Solo se ejecutan en modo desarrollo

## Configuración de Variables de Entorno

Las variables de entorno están configuradas en tres lugares:

### 1. app.json (fallback)
```json
"extra": {
  "apiUrl": "http://capdatos.dyndns.org:3000",
  "apiKey": ""
}
```

### 2. eas.json (builds con EAS)
- **development**: usa `http://192.168.18.79:3000`
- **preview/production**: usa `http://capdatos.dyndns.org:3000`

### 3. .env (opcional, para desarrollo local)
Crea un archivo `.env` basado en `.env.example`:
```
EXPO_PUBLIC_API_URL=http://192.168.18.79:3000
EXPO_PUBLIC_API_KEY=
```

## 🚀 Para Generar un Nuevo APK:

```bash
cd frontend

# Opción 1: Build con EAS (recomendado)
eas build -p android --profile production

# Opción 2: Build preview (para testing)
eas build -p android --profile preview
```

El APK estará listo para instalar y mostrará **datos de demostración** automáticamente.

## Troubleshooting

Si aún tienes problemas:

1. **Limpiar caché**:
   ```bash
   cd frontend
   npx expo start -c
   ```

2. **Regenerar proyecto**:
   ```bash
   rm -rf node_modules
   npm install
   ```

3. **Ver logs del dispositivo**:
   ```bash
   adb logcat | grep -i "ReactNative\|Expo"
   ```

4. **Verificar configuración**:
   - Asegúrate que el servidor API esté accesible desde el dispositivo
   - Verifica que la URL en `app.json` sea correcta
