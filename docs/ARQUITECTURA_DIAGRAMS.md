# ARQUITECTURA - Flujo de Configuración por TOKEN

## Diagrama de Flujo - Navegación

```
┌─────────────────────────────────────────────┐
│           APP INICIADA                      │
│         SPLASH SCREEN (2s)                  │
└────────────────────┬────────────────────────┘
                     │
                     ▼
         ┌──────────────────────┐
         │   CHECK-AUTH         │
         │  (Verificación)      │
         └──────────┬───────────┘
                    │
        ┌───────────┼───────────┐
        │           │           │
        ▼           ▼           ▼
   [Usuario?]  [Token?]    [Error]
        │           │           │
       SÍ          SÍ          NO
        │           │           │
        ▼           ▼           ▼
     TABS ──→  LOGIN  ──────→  CONFIG-TOKEN
    (App)    (User/Pass)    (Ingreso Token)
               │                   │
               │                   ▼
               │         [Validar Token]
               │                   │
               │          ┌────────┴────────┐
               │          │                 │
               │         SÍ                 NO
               │          │                 │
               │          ▼                 ▼
               │       (Guardar)         (Error!)
               │          │              (Retry)
               │          ▼
               └─────→ TABS (App)
```

## Diagrama de Componentes

```
┌─────────────────────────────────────────────────────────────┐
│                       FRONTEND EXPO                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │          NAVIGATION LAYER                           │  │
│  │  ┌────────┐  ┌────────────┐  ┌──────────────┐      │  │
│  │  │  Index │→ │ Check-Auth │→ │ Config-Token │      │  │
│  │  └────────┘  └────────────┘  └──────┬───────┘      │  │
│  │                                      ↓              │  │
│  │                            ┌──────────────────┐    │  │
│  │                            │  Login           │    │  │
│  │                            └─────────┬────────┘    │  │
│  │                                      ↓              │  │
│  │                            ┌──────────────────┐    │  │
│  │                            │  Tabs / App      │    │  │
│  │                            └──────────────────┘    │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │          STORAGE LAYER                              │  │
│  │                                                      │  │
│  │  ┌──────────────────┐      ┌──────────────────┐    │  │
│  │  │ empresa-storage  │      │  config.ts       │    │  │
│  │  │ (Token Mgmt)     │      │  (Session Mgmt)  │    │  │
│  │  │                  │      │                  │    │  │
│  │  │ • Token handling │      │ • User data      │    │  │
│  │  │ • Config storage │      │ • JWT            │    │  │
│  │  │ • Validation     │      │ • Logout         │    │  │
│  │  │ • Headers prep   │      │ • getAuthHeaders │    │  │
│  │  └────────┬─────────┘      └────────┬─────────┘    │  │
│  │           │                         │               │  │
│  │           └──────────────┬──────────┘               │  │
│  │                          ▼                          │  │
│  │             AsyncStorage (Persistent)              │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │          API LAYER                                  │  │
│  │                                                      │  │
│  │  ┌──────────────────────────────────────────────┐   │  │
│  │  │         api.ts (Axios Instance)             │   │  │
│  │  │  • Base URL configuration                   │   │  │
│  │  │  • HTTP methods (get, post, put, delete)    │   │  │
│  │  │  • Authorization header injection           │   │  │
│  │  │  • x-api-key + x-cliente-config headers     │   │  │
│  │  └──────────────────────────────────────────────┘   │  │
│  └──────────────────────────────────────────────────────┘  │
│                          ▲                                  │
│                          │ HTTP/S                          │
└──────────────────────────┼──────────────────────────────────┘
                           │
           ┌───────────────┼───────────────┐
           │               │               │
           ▼               ▼               ▼
    ┌────────────┐  ┌────────────┐  ┌────────────┐
    │  GET       │  │ POST       │  │ PUT        │
    │  /health   │  │ /validar-  │  │ /api/*     │
    │            │  │ token      │  │ (Protected)│
    │ Public     │  │ Public     │  │            │
    │ (No auth)  │  │ (No auth)  │  │ (JWT req)  │
    └────────────┘  └────────────┘  └────────────┘
           │               │               │
           └───────────────┼───────────────┘
                           │
           ┌───────────────┴───────────────┐
           │                               │
           ▼                               ▼
    ┌─────────────────────────────────────────────┐
    │            BACKEND EXPRESS API              │
    │          (apps/api/src)                    │
    ├─────────────────────────────────────────────┤
    │                                             │
    │  ┌──────────────────────────────────────┐  │
    │  │  MIDDLEWARE LAYER                    │  │
    │  │  • CORS                              │  │
    │  │  • Body Parser JSON                  │  │
    │  │  • Rate Limiting                     │  │
    │  │  • API Key Validation (selective)    │  │
    │  │  • JWT Auth (selective)              │  │
    │  └──────────────────────────────────────┘  │
    │                                             │
    │  ┌──────────────────────────────────────┐  │
    │  │  ROUTES LAYER                        │  │
    │  │                                      │  │
    │  │  ┌─ auth.ts                         │  │
    │  │  │  • POST /validar-token ★★★      │  │
    │  │  │  • POST /validar-rut             │  │
    │  │  │  • POST /login                   │  │
    │  │  │                                  │  │
    │  │  ├─ cliente-config.ts               │  │
    │  │  │  • GET /cliente-config           │  │
    │  │  │                                  │  │
    │  │  ├─ dashboard.ts                    │  │
    │  │  │  • GET /dashboard/*              │  │
    │  │  │                                  │  │
    │  │  └─ dashboard_new.ts                │  │
    │  │     • GET /dashboard-new/*          │  │
    │  │                                      │  │
    │  └──────────────────────────────────────┘  │
    │                                             │
    │  ┌──────────────────────────────────────┐  │
    │  │  DATABASE LAYER                      │  │
    │  │                                      │  │
    │  │  ┌─ db/firebird.ts                  │  │
    │  │  │  • Connection config              │  │
    │  │  │                                  │  │
    │  │  ├─ db/firebirdPool.ts              │  │
    │  │  │  • Connection pooling             │  │
    │  │  │  • Query execution                │  │
    │  │  │  • executeQuery()                 │  │
    │  │  │                                  │  │
    │  │  └─ Firebird Instances              │  │
    │  │     • DUOCOMAPPS (central BD)      │  │
    │  │     • CLIENTE BDs (per empresa)    │  │
    │  │                                      │  │
    │  └──────────────────────────────────────┘  │
    │                                             │
    └─────────────────────────────────────────────┘
           │             │             │
           ▼             ▼             ▼
    ┌────────────┐ ┌────────────┐ ┌────────────┐
    │DUOCOMAPPS  │ │CLIENT BD 1 │ │CLIENT BD N │
    │Central BD  │ │ (Firebird) │ │ (Firebird) │
    │            │ │            │ │            │
    │• Clientes  │ │• Datos      │ │• Datos     │
    │• Tokens    │ │• Usuarios   │ │• Usuarios  │
    │• Configs   │ │• Módulos    │ │• Módulos   │
    └────────────┘ └────────────┘ └────────────┘
```

## Diagrama de Flujo de Datos - Validar Token

```
┌─────────────────────────────────────────────────────────┐
│               USER INPUT (Frontend)                     │
│     Token: "empresa-token-secret-123"                  │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
        ┌────────────────────────────────────┐
        │  validarYGuardarToken(token)       │
        │  (empresa-storage.ts)              │
        └────────────┬─────────────────────────┘
                     │
                     ├─ Validar: token.length >= 8
                     │
                     ▼
    ┌────────────────────────────────────────┐
    │  api.post('/api/validar-token', {      │
    │    token: 'empresa-token-secret-123'   │
    │  }, {                                  │
    │    headers: getApiKeyHeader()           │
    │  })                                    │
    └────────────┬────────────────────────────┘
                 │ NETWORK
                 ▼
    ┌─────────────────────────────────────────────────┐
    │      Backend: POST /api/validar-token          │
    │      (apps/api/src/routes/auth.ts)             │
    │                                                 │
    │  1. Parsear body: { token: "..." }             │
    │  2. Validar: 8+ caracteres                     │
    │  3. fetchClienteByToken(token)                 │
    │     ├─ dbConfig DUOCOMAPPS                     │
    │     ├─ SELECT * FROM "Clientes"                │
    │     │  WHERE "TOKEN" = ? AND "ESTADO" = 1     │
    │     └─ Retorna: row[0] o null                  │
    │  4. buildClienteConfig(row)                    │
    │     ├─ rut                                     │
    │     ├─ razonSocial                             │
    │     ├─ ip, puerto, bdAlias                     │
    │     ├─ url1, url2, url3                        │
    │     └─ Retorna: ClienteConfig object           │
    │  5. Responder: { success, data }               │
    │                                                 │
    └────────────┬─────────────────────────────────────┘
                 │ RESPONSE (JSON)
                 ▼
    ┌──────────────────────────────────────────────┐
    │ {                                            │
    │   "success": true,                           │
    │   "data": {                                  │
    │     "razonSocial": "DuoCOM Chile",          │
    │     "ip": "192.168.1.100",                  │
    │     "puerto": 3050,                         │
    │     "bdAlias": "C:\\DuoCOM\\...",           │
    │     "user": "SYSDBA",                       │
    │     "clave": "masterkey",                   │
    │     "url1": "https://duocom.org",           │
    │     "url2": null,                           │
    │     "url3": null                            │
    │   }                                          │
    │ }                                            │
    └────────────┬──────────────────────────────────┘
                 │ FRONTEND
                 ▼
    ┌──────────────────────────────────────┐
    │  setEmpresaToken(token)              │
    │  • AsyncStorage: @empresa_token      │
    │                                      │
    │  setClienteConfig(data)              │
    │  • AsyncStorage: @empresa_cliente_config │
    │  • JSON stringified                  │
    │                                      │
    │  getEmpresaAuthHeaders()             │
    │  • { "x-cliente-config": JSON }      │
    │                                      │
    └──────────────┬───────────────────────┘
                   │
                   ▼
        ┌────────────────────────┐
        │  Persistencia Local    │
        │  (Reutilizable)        │
        └────────────────────────┘
```

## Headers de Autenticación - Evolución

### Estado Inicial
```
GET /api/health
[sin headers especiales]
✓ Respuesta pública
```

### Después de Validar Token
```
POST /api/login
Content-Type: application/json
x-api-key: Duocom2025SecretKey!@#
x-cliente-config: {
  "razonSocial": "DuoCOM Chile",
  "ip": "192.168.1.100",
  ...
}

Body:
{
  "username": "admin",
  "password": "pass123"
}
```

### Después de Login (Sesión Usuario)
```
GET /api/cliente-config
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
x-api-key: Duocom2025SecretKey!@#
x-cliente-config: {
  "razonSocial": "DuoCOM Chile",
  ...
}

✓ JWT del usuario
✓ API Key
✓ Configuración de empresa
```

## Almacenamiento Local (AsyncStorage)

```
Frontend Device Storage
├─ @usuario_actual (JSON)
│  └─ { id, username, token, cliente, ... }
│
├─ @cliente_config (JSON)
│  └─ { rut, nombre, razonSocial, ... }
│
├─ @token (JWT string)
│  └─ "eyJhbGciOiJIUzI1NiI..."
│
├─ @empresa_token ★
│  └─ "empresa-token-secret-123"
│
├─ @empresa_cliente_config ★
│  └─ {
│       "razonSocial": "DuoCOM",
│       "ip": "192.168.1.100",
│       "puerto": 3050,
│       "bdAlias": "..."
│     }
│
├─ @empresa_last_validation ★
│  └─ "2025-01-15T10:30:00.000Z"
│
└─ @backend_url
   └─ "https://duocom.dyndns.org/charts"

★ = Nuevo en esta implementación
```

## Transiciones de Estado

```
┌──────────────────────────────────────────────────────┐
│ STATE MACHINE: Application States                   │
├──────────────────────────────────────────────────────┤
│                                                      │
│  START                                              │
│   │                                                 │
│   ├─ No Token, No User                              │
│   │  └─→ CONFIG-TOKEN (Ingreso de Token)            │
│   │                                                 │
│   ├─ Token Existe, No User                          │
│   │  └─→ LOGIN (Usuario ya configuró empresa)       │
│   │                                                 │
│   ├─ Token Existe, User JWT Válido                  │
│   │  └─→ TABS (No re-login necesario)               │
│   │                                                 │
│   └─ Error / JWT Expirado                           │
│      └─→ CONFIG-TOKEN (Reconfigurar)                │
│                                                      │
│  CONFIG-TOKEN                                       │
│   ├─ [Validar Token] + SUCCESS                      │
│   │  └─→ Guardar Token + Config → LOGIN             │
│   │                                                 │
│   ├─ [Validar Token] + ERROR                        │
│   │  └─→ Mostrar Error → Reintentar (mismo estado)  │
│   │                                                 │
│   └─ [Limpiar Token]                               │
│      └─→ Limpiar AsyncStorage → Recargar           │
│                                                      │
│  LOGIN                                              │
│   ├─ [Login] + SUCCESS                              │
│   │  └─→ Guardar JWT + User → TABS                  │
│   │                                                 │
│   ├─ [Login] + ERROR                               │
│   │  └─→ Mostrar Error → Reintentar (mismo estado)  │
│   │                                                 │
│   └─ [Cambiar Empresa]                             │
│      └─→ Limpiar Token → CONFIG-TOKEN              │
│                                                      │
│  TABS (App Principal)                               │
│   ├─ Normal Usage                                   │
│   │  └─→ Mantener sesión activa                     │
│   │                                                 │
│   └─ [Logout]                                       │
│      └─→ Limpiar Token + JWT → CONFIG-TOKEN        │
│                                                      │
└──────────────────────────────────────────────────────┘
```

---

**Toda la arquitectura está integrada y lista para deployment** ✨
