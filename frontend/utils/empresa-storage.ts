/**
 * empresa-storage.ts — Gestión de token y configuración de empresa.
 *
 * Responsable de:
 *  - Almacenar token de empresa en AsyncStorage
 *  - Almacenar configuración de conexión del cliente
 *  - Funciones para validar, guardar, recuperar y limpiar datos
 *  - Flujo de inicialización con token
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_CONFIG, api, getApiKeyHeader } from '@/constants/api';

/** Claves de AsyncStorage para empresa */
export const EMPRESA_STORAGE_KEYS = {
  empresaToken: '@empresa_token',
  clienteConfig: '@empresa_cliente_config',
  lastValidation: '@empresa_last_validation',
} as const;

/**
 * Configuración de conexión obtenida del backend al validar token
 */
export interface EmpresaClienteConfig {
  razonSocial: string;
  ip: string;
  puerto: number;
  bdAlias: string;
  user: string;
  clave: string;
  url1?: string;
  url2?: string;
  url3?: string;
}

/**
 * Respuesta del backend al validar token
 */
export interface ValidarTokenResponse {
  success: boolean;
  data?: EmpresaClienteConfig;
  error?: string;
  message?: string;
}

/* ═══════════════════════════════════════════
   Funciones de Storage — Token
═══════════════════════════════════════════ */

/**
 * Obtiene el token de empresa guardado localmente
 */
export async function getEmpresaToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(EMPRESA_STORAGE_KEYS.empresaToken);
  } catch (error) {
    console.error('[EmpresaStorage] Error al obtener token:', error);
    return null;
  }
}

/**
 * Guarda el token de empresa localmente
 */
export async function setEmpresaToken(token: string): Promise<void> {
  try {
    const trimmed = token.trim();
    if (!trimmed) {
      throw new Error('Token no puede estar vacío');
    }
    await AsyncStorage.setItem(EMPRESA_STORAGE_KEYS.empresaToken, trimmed);
  } catch (error) {
    console.error('[EmpresaStorage] Error al guardar token:', error);
    throw error;
  }
}

/**
 * Verifica si existe un token de empresa válido
 */
export async function hayTokenEmpresa(): Promise<boolean> {
  const token = await getEmpresaToken();
  return Boolean(token && token.length >= 8);
}

/**
 * Elimina el token de empresa del storage
 */
export async function clearEmpresaToken(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([
      EMPRESA_STORAGE_KEYS.empresaToken,
      EMPRESA_STORAGE_KEYS.clienteConfig,
      EMPRESA_STORAGE_KEYS.lastValidation,
    ]);
  } catch (error) {
    console.error('[EmpresaStorage] Error al limpiar token:', error);
    throw error;
  }
}

/* ═══════════════════════════════════════════
   Funciones de Storage — Configuración
═══════════════════════════════════════════ */

/**
 * Obtiene la configuración del cliente guardada localmente
 */
export async function getClienteConfig(): Promise<EmpresaClienteConfig | null> {
  try {
    const data = await AsyncStorage.getItem(EMPRESA_STORAGE_KEYS.clienteConfig);
    if (!data) return null;
    return JSON.parse(data) as EmpresaClienteConfig;
  } catch (error) {
    console.error('[EmpresaStorage] Error al obtener config:', error);
    return null;
  }
}

/**
 * Guarda la configuración del cliente localmente
 */
export async function setClienteConfig(config: EmpresaClienteConfig): Promise<void> {
  try {
    if (!config || !config.razonSocial) {
      throw new Error('Configuración del cliente inválida');
    }
    await AsyncStorage.setItem(
      EMPRESA_STORAGE_KEYS.clienteConfig,
      JSON.stringify(config)
    );
    // Guardar timestamp de última validación
    await AsyncStorage.setItem(
      EMPRESA_STORAGE_KEYS.lastValidation,
      new Date().toISOString()
    );
  } catch (error) {
    console.error('[EmpresaStorage] Error al guardar config:', error);
    throw error;
  }
}

/**
 * Obtiene el timestamp de la última validación
 */
export async function getLastValidation(): Promise<Date | null> {
  try {
    const timestamp = await AsyncStorage.getItem(EMPRESA_STORAGE_KEYS.lastValidation);
    return timestamp ? new Date(timestamp) : null;
  } catch (error) {
    console.error('[EmpresaStorage] Error al obtener timestamp:', error);
    return null;
  }
}

/* ═══════════════════════════════════════════
   Funciones de Validación
═══════════════════════════════════════════ */

/**
 * Valida un token contra el backend y guarda la configuración
 *
 * @param token Token de empresa a validar
 * @returns Configuración del cliente si es válido
 * @throws Error si el token es inválido
 */
export async function validarYGuardarToken(token: string): Promise<EmpresaClienteConfig> {
  try {
    const trimmed = token.trim();

    if (!trimmed) {
      throw new Error('Token requerido');
    }

    if (trimmed.length < 8) {
      throw new Error('Token debe tener mínimo 8 caracteres');
    }

    console.log('[EmpresaStorage] Validando token...');

    // Llamar al backend para validar token
    const response = await api.post<ValidarTokenResponse>(
      '/api/validar-token',
      { token: trimmed },
      {
        headers: getApiKeyHeader(),
      }
    );

    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error || 'Token inválido');
    }

    const clienteConfig = response.data.data;
    console.log(
      '[EmpresaStorage] Token validado para empresa:',
      clienteConfig.razonSocial
    );

    // Guardar token y configuración
    await setEmpresaToken(trimmed);
    await setClienteConfig(clienteConfig);

    return clienteConfig;
  } catch (error) {
    console.error('[EmpresaStorage] Error al validar token:', error);
    throw error instanceof Error
      ? error
      : new Error('Error al validar token');
  }
}

/**
 * Inicializa la configuración desde token guardado.
 * Si hay token almacenado, lo usa para cargar/revalidar la config.
 *
 * @returns Configuración del cliente si existe token y es válido
 */
export async function inicializarConfigDesdeToken(): Promise<EmpresaClienteConfig | null> {
  try {
    const token = await getEmpresaToken();

    if (!token) {
      console.log('[EmpresaStorage] No hay token guardado');
      return null;
    }

    // Intentar usar configuración en cache
    const cachedConfig = await getClienteConfig();
    if (cachedConfig) {
      console.log(
        '[EmpresaStorage] Usando config en cache para empresa:',
        cachedConfig.razonSocial
      );
      return cachedConfig;
    }

    // Si no hay cache, revalidar token
    console.log('[EmpresaStorage] Revalidando token...');
    return await validarYGuardarToken(token);
  } catch (error) {
    console.error('[EmpresaStorage] Error al inicializar config:', error);
    return null;
  }
}

/* ═══════════════════════════════════════════
   Headers para Requests
═══════════════════════════════════════════ */

/**
 * Obtiene los headers de autenticación necesarios para requests
 * Incluye: x-api-key, x-cliente-config (si existe)
 */
export async function getEmpresaAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    ...getApiKeyHeader(),
  };

  const clienteConfig = await getClienteConfig();
  if (clienteConfig) {
    headers['x-cliente-config'] = JSON.stringify(clienteConfig);
  }

  return headers;
}

/**
 * Valida que la configuración sea completa
 */
export function isClienteConfigValid(config: any): config is EmpresaClienteConfig {
  return (
    config &&
    typeof config === 'object' &&
    typeof config.razonSocial === 'string' &&
    typeof config.ip === 'string' &&
    typeof config.puerto === 'number' &&
    typeof config.bdAlias === 'string' &&
    typeof config.user === 'string' &&
    typeof config.clave === 'string'
  );
}
