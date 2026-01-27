# Troubleshooting - APK se cierra inmediatamente

## Cambios Aplicados (Última actualización)

### 1. **Simplificación del sistema de API mock**
- ❌ Eliminados interceptores complejos de axios que podían causar crashes
- ✅ Implementado wrapper simple que devuelve promesas resueltas directamente
- ✅ Sin try-catch anidados ni rejection de promesas

### 2. **Error Boundary agregado**
- ✅ Captura errores de React y previene crashes
- ✅ Muestra pantalla de error en vez de cerrar la app

### 3. **Splash Screen robusto**
- ✅ Múltiples intentos de navegación
- ✅ Fallbacks si la navegación falla
- ✅ Timeout reducido a 2 segundos

### 4. **Filters Context mejorado**
- ✅ Valores por defecto si la API falla
- ✅ Mejor manejo de errores en fetchSucursales

## Cómo verificar qué está causando el crash

### Opción 1: Ver logs con adb (Recomendado)

```bash
# Conectar dispositivo Android por USB
# Habilitar "Depuración USB" en opciones de desarrollador

# Ver logs en tiempo real
adb logcat | findstr /i "ReactNative Expo Error Exception"

# O solo errores
adb logcat *:E | findstr /i "com.duocommovil"
```

### Opción 2: Build en modo development

```bash
cd frontend

# Build de desarrollo (incluye herramientas de debug)
eas build --platform android --profile development

# Luego instalar y abrir, verás errores en la consola
```

### Opción 3: Test local antes de APK

```bash
cd frontend

# Correr en emulador o dispositivo conectado
npx expo run:android

# Si funciona aquí pero no en APK, es problema de configuración de producción
```

## Problemas Comunes y Soluciones

### 1. Assets/Images no encontrados
**Síntoma**: Se cierra al intentar cargar imágenes

**Solución**: Verificar que todas las imágenes existan:
```bash
# En frontend/assets/images/ deben estar:
# - icon.png
# - splash-icon.png
# - android-icon-foreground.png
# - android-icon-background.png
# - android-icon-monochrome.png
```

### 2. Módulos nativos faltantes
**Síntoma**: Crash al iniciar sin mensajes

**Solución**: Limpiar caché y rebuild
```bash
cd frontend
rm -rf node_modules
npm install
eas build --platform android --profile production --clear-cache
```

### 3. Hermes/JSC incompatibilidad
**Síntoma**: JavaScript engine crashes

**Solución**: Cambiar engine en app.json
```json
{
  "expo": {
    "android": {
      "jsEngine": "jsc"  // o "hermes"
    }
  }
}
```

### 4. Permisos de Android faltantes
**Síntoma**: Se cierra al intentar usar funcionalidades

**Solución**: Agregar en app.json si es necesario
```json
{
  "expo": {
    "android": {
      "permissions": [
        "INTERNET"
      ]
    }
  }
}
```

## Test Checklist antes de generar APK

- [ ] `npm run lint` pasa sin errores
- [ ] `npx expo start` funciona en modo development
- [ ] Modo demo está activado: `DEMO_MODE = true` en mock-data.ts
- [ ] Todas las imágenes existen en assets/images/
- [ ] No hay console.error sin try-catch
- [ ] app.json tiene configuración correcta

## Si nada funciona - Versión Ultra-Simple

Crear un APK mínimo para verificar que el problema no es de Expo/Android:

```bash
cd frontend

# 1. Simplificar app.json - quitar todo lo no esencial
# 2. Comentar FiltersProvider temporalmente
# 3. Simplificar splash para ir directo sin animaciones
# 4. Generar APK minimal
eas build --platform android --profile production
```

## Logs útiles para compartir

Si sigues teniendo problemas, ejecuta esto y comparte el output:

```bash
# Ver info del sistema
adb shell getprop ro.build.version.sdk
adb shell getprop ro.product.cpu.abi

# Capturar crash logs
adb logcat -d > crash_log.txt

# Ver si la app está instalada
adb shell pm list packages | findstr duocom
```

## Contacto para soporte

Si necesitas ayuda adicional, comparte:
1. Versión de Android del dispositivo
2. Output de `adb logcat` cuando se cierra
3. El archivo `crash_log.txt` generado arriba
