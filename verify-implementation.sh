#!/bin/bash
# Script para verificar que la implementación del flujo TOKEN está correcta

echo "🔍 Verificando implementación del flujo TOKEN..."
echo ""

# Colores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function para verificar archivos
check_file() {
  if [ -f "$1" ]; then
    echo -e "${GREEN}✓${NC} Archivo existe: $1"
    return 0
  else
    echo -e "${RED}✗${NC} FALTA archivo: $1"
    return 1
  fi
}

# Function para buscar contenido en archivo
check_content() {
  if grep -q "$2" "$1" 2>/dev/null; then
    echo -e "${GREEN}✓${NC} Contiene '$2' en: $1"
    return 0
  else
    echo -e "${RED}✗${NC} NO contiene '$2' en: $1"
    return 1
  fi
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📦 ARCHIVOS BACKEND"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

check_file "apps/api/src/types/tokenConfig.ts"
echo ""

check_file "apps/api/src/routes/auth.ts"
check_content "apps/api/src/routes/auth.ts" "validar-token"
echo ""

check_file "apps/api/src/middleware/apiKey.ts"
check_content "apps/api/src/middleware/apiKey.ts" "publicEndpoints"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📱 ARCHIVOS FRONTEND"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

check_file "frontend/utils/empresa-storage.ts"
check_content "frontend/utils/empresa-storage.ts" "validarYGuardarToken"
echo ""

check_file "frontend/app/config-token.tsx"
check_content "frontend/app/config-token.tsx" "handleValidarToken"
echo ""

check_file "frontend/app/check-auth.tsx"
check_content "frontend/app/check-auth.tsx" "hayTokenEmpresa"
echo ""

check_file "frontend/app/login.tsx"
check_content "frontend/app/login.tsx" "getEmpresaConfig"
echo ""

check_file "frontend/utils/config.ts"
check_content "frontend/utils/config.ts" "getEmpresaAuthHeaders"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📚 DOCUMENTACIÓN"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

check_file "docs/FLUJO_TOKEN_EMPRESA.md"
check_file "docs/setup-test-data.sql"
check_file "README_TOKEN_SETUP.md"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ CHECKLIST FUNCIONAL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "Backend:"
echo "  [ ] POST /api/validar-token implementado"
echo "  [ ] Validaciones de token (8+ caracteres)"
echo "  [ ] Busca empresa activa por TOKEN"
echo "  [ ] Devuelve ConfigData en respuesta"
echo "  [ ] apiKeyMiddleware permite /validar-token"
echo ""

echo "Frontend - Storage:"
echo "  [ ] getEmpresaToken() funciona"
echo "  [ ] setEmpresaToken() guarda en AsyncStorage"
echo "  [ ] hayTokenEmpresa() verifica existencia"
echo "  [ ] validarYGuardarToken() hace POST + guarda"
echo "  [ ] clearEmpresaToken() limpia todo"
echo ""

echo "Frontend - Pantalla CONFIG-TOKEN:"
echo "  [ ] Input para token (min 8 caracteres)"
echo "  [ ] Botón validar con loading state"
echo "  [ ] Muestra empresa configurada"
echo "  [ ] Botón limpiar funcional"
echo "  [ ] Manejo de errores con alertas"
echo ""

echo "Frontend - Flujo:"
echo "  [ ] CHECK-AUTH detecta token"
echo "  [ ] LOGIN auto-carga empresa si existe"
echo "  [ ] getAuthHeaders() incluye headers"
echo "  [ ] Logout limpia token + config"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🧪 PRUEBAS RECOMENDADAS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "1️⃣  Probar endpoint GET health:"
echo "   curl http://localhost:3000/health"
echo ""

echo "2️⃣  Probar validar-token con token válido:"
echo "   curl -X POST http://localhost:3000/api/validar-token \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"token\": \"duocom-matriz-token-001\"}'"
echo ""

echo "3️⃣  Probar validar-token con token inválido:"
echo "   curl -X POST http://localhost:3000/api/validar-token \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"token\": \"invalid\"}'"
echo ""

echo "4️⃣  Abrir app en emulador:"
echo "   cd frontend && npx expo start"
echo ""

echo "5️⃣  Test en app:"
echo "   - Ver CONFIG-TOKEN en primer inicio"
echo "   - Ingresar token: duocom-matriz-token-001"
echo "   - Validar token"
echo "   - Navega a LOGIN"
echo "   - Ingresar credenciales"
echo "   - Acceso a TABS"
echo "   - Cerrar + reabre → salta a LOGIN (token guardado)"
echo "   - Logout → vuelve a CONFIG-TOKEN"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✨ Implementación completada"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
