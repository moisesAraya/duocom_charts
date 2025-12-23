# 📊 Dashboard Empresarial Duocom

Aplicación móvil React Native con Expo que muestra un dashboard completo de KPIs empresariales conectada a base de datos Firebird.

## 🚀 Características

- **6 Tipos de Gráficos Empresariales:**
  - 📈 Clientes por Hora (línea)
  - 📊 Resumen Mensual de Ventas (barras)
  - 📦 Inventario Valorizado (barras)
  - 🔄 Ranking de Productos por Rotación (barras)
  - 💰 Cuentas por Cobrar (barras)
  - 💸 Cuentas por Pagar (barras)

- **Funcionalidades:**
  - Filtro por sucursal
  - Drill-down en gráficos
  - Modal de detalles
  - Autenticación con API Key
  - Diseño responsivo para móviles

## 🛠️ Tecnologías

- **Frontend:** React Native + Expo SDK 54
- **Backend:** Express.js + Firebird DB
- **Gráficos:** React Native Chart Kit
- **Navegación:** Expo Router
- **Estado:** React Hooks
- **API:** Axios con autenticación

## 📋 Requisitos Previos

- Node.js 18+
- npm o yarn
- Expo CLI
- Android Studio (para Android) o Xcode (para iOS)

## 🔧 Instalación y Configuración

### 1. Instalar dependencias

```bash
npm install
```

### 2. Instalar servidor backend (opcional para desarrollo local)

```bash
npm install express cors
```

### 3. Ejecutar el servidor de desarrollo

```bash
# Terminal 1: Servidor backend (datos mock)
npm run server

# Terminal 2: Aplicación React Native
npm start
```

## 📱 Uso de la Aplicación

### Desarrollo Local
1. El servidor backend mock se ejecuta en `http://localhost:3000`
2. La app detecta automáticamente el entorno de desarrollo

### Producción
1. Cambia `API_CONFIG.BASE_URL` en `constants/api.ts` a tu servidor real
2. Asegúrate de que los endpoints estén implementados en tu backend Firebird

## 🔗 Endpoints de la API

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/sucursales` | GET | Lista de sucursales |
| `/api/dashboard/clientes-hora` | GET | Clientes atendidos por hora |
| `/api/dashboard/resumen-mensual-ventas` | GET | Resumen mensual de ventas por sucursal |
| `/api/dashboard/inventario-valorizado` | GET | Inventario valorizado por sucursal |
| `/api/dashboard/productos-rotacion` | GET | Ranking de productos por rotación |
| `/api/dashboard/cuentas-cobrar` | GET | Resumen de cuentas por cobrar |
| `/api/dashboard/cuentas-pagar` | GET | Resumen de cuentas por pagar |
| `/api/login` | POST | Autenticación de usuario |

### Parámetros de consulta:
- `sucursal`: ID de sucursal (opcional)
- `meses`: Número de meses para datos históricos (opcional)

## 🗂️ Estructura del Proyecto

```
charts_duocom/
├── app/
│   ├── _layout.tsx          # Layout principal con autenticación
│   ├── login.tsx            # Pantalla de login
│   └── (tabs)/
│       ├── _layout.tsx      # Layout de pestañas
│       └── index.tsx        # Dashboard principal
├── constants/
│   └── api.ts               # Configuración de API
├── hooks/
│   └── useAuth.tsx          # Hook de autenticación
├── server.js                # Servidor backend mock
└── package.json
```

## 🔐 Autenticación

La aplicación usa API Key authentication:
- **Header:** `x-api-key: Duocom2025SecretKey!@#`
- Configurado automáticamente en `constants/api.ts`

## 📊 Stored Procedures Utilizados

- `_ProyVentaAnual` - Ventas mensuales/anuales
- `_PvtVentaHoraria` - Ventas por hora
- `_PvtStock` - Stock por sucursal
- `_PvtRotación` - Rotación de productos
- `_PvtDocXCobrar` - Documentos por cobrar
- `_PvtDocXPagar` - Documentos por pagar

## 🚀 Despliegue

### Backend
1. Implementa los endpoints en tu servidor Express.js
2. Conecta a tu base de datos Firebird
3. Configura la API Key

### Frontend
```bash
# Build para producción
npx expo build:android
npx expo build:ios
```

## 🐛 Solución de Problemas

### Error de conexión
- Verifica que el servidor backend esté corriendo
- Revisa la URL en `constants/api.ts`
- Confirma la API Key

### Gráficos no se muestran
- Verifica que los datos se estén recibiendo del backend
- Revisa la consola para errores de parsing
- Confirma que los nombres de campos coincidan

### Problemas de rendimiento
- Los gráficos se optimizan automáticamente para móviles
- Labels rotados a 90° para mejor legibilidad
- Datos limitados a top 10 para evitar sobrecarga

## 🤝 Contribución

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📄 Licencia

Este proyecto está bajo la Licencia MIT - ver el archivo [LICENSE](LICENSE) para más detalles.

---

**Desarrollado con ❤️ para empresarios que necesitan insights en tiempo real**
