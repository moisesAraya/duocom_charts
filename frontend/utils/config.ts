import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_CONFIG, api, getApiKeyHeader, setAuthToken } from '@/constants/api';

/**
 * Returns the current authentication headers for API requests.
 * You may want to adjust this implementation to match your authentication logic.
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await AsyncStorage.getItem(STORAGE_KEYS.token);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const STORAGE_KEYS = {
  USUARIO_ACTUAL: '@usuario_actual',
  CLIENTE_CONFIG: '@cliente_config',
  BACKEND_URL: '@backend_url',
  token: '@token',
  cliente: '@cliente',
  user: '@user',
  APP_STATE: '@app_state',
  SESSION_TIMESTAMP: '@session_timestamp',
} as const;

export interface Usuario {
  id: number;
  username: string;
  nombre: string;
  rol: string;
  token?: string;
  cliente?: ClienteConfig;
}



export async function getUsuarioActual(): Promise<Usuario | null> {
  const data = await AsyncStorage.getItem(STORAGE_KEYS.USUARIO_ACTUAL);
  if (data) {
    const usuario = JSON.parse(data) as Usuario;
    if (usuario.token) {
      setAuthToken(usuario.token);
    }
    return usuario;
  }
  return null;
}








export async function logout(): Promise<void> {
  await AsyncStorage.multiRemove([
    STORAGE_KEYS.USUARIO_ACTUAL,
    STORAGE_KEYS.CLIENTE_CONFIG,
    STORAGE_KEYS.token,
    STORAGE_KEYS.user,
    STORAGE_KEYS.cliente,
    STORAGE_KEYS.SESSION_TIMESTAMP,
    STORAGE_KEYS.APP_STATE,
  ]);
  setAuthToken(null);
}

export type ClienteConfig = {
  idCliente?: number | string;
  rut: string;
  nombre: string;
  razonSocial?: string;
  configuracion: Record<string, unknown>;
  nombreFantasia?: string;
  id?: number;
  [key: string]: any;
};

type ClienteConfigResponse = {
  success: boolean;
  data?: ClienteConfig;
  error?: string;
};

type UsuarioActual = {
  username?: string;
  rut?: number | string;
  esAdmin?: boolean;
  token?: string;
  cliente?: ClienteConfig;
  [key: string]: unknown;
};

export const setBackendUrl = async (url: string): Promise<void> => {
  const trimmed = url.trim();
  if (!trimmed) return;
  await AsyncStorage.setItem(STORAGE_KEYS.BACKEND_URL, trimmed);
  api.defaults.baseURL = trimmed;
};

export const getBackendUrl = async (): Promise<string> => {
  const resolved = API_CONFIG.BASE_URL.trim();
  const stored = await AsyncStorage.getItem(STORAGE_KEYS.BACKEND_URL);
  if (stored?.trim() !== resolved) {
    await AsyncStorage.setItem(STORAGE_KEYS.BACKEND_URL, resolved);
  }
  api.defaults.baseURL = resolved;
  return resolved;
};


export const setUsuarioActual = async (user: UsuarioActual): Promise<void> => {
  await AsyncStorage.setItem(STORAGE_KEYS.USUARIO_ACTUAL, JSON.stringify(user));
  if (user.token) {
    await AsyncStorage.setItem(STORAGE_KEYS.token, user.token);
    setAuthToken(user.token);
  }
  // Guardar timestamp de inicio de sesión
  await AsyncStorage.setItem(STORAGE_KEYS.SESSION_TIMESTAMP, Date.now().toString());
};

export const clearSession = async (): Promise<void> => {
  await AsyncStorage.multiRemove([
    STORAGE_KEYS.user,
    STORAGE_KEYS.token,
    STORAGE_KEYS.cliente,
  ]);
  setAuthToken(null);
};

export const hayUsuarioLogueado = async (): Promise<boolean> => {
  const token = await AsyncStorage.getItem(STORAGE_KEYS.token);
  return Boolean(token);
};

// Marcar que la app entró en background
export const markAppBackground = async (): Promise<void> => {
  await AsyncStorage.setItem(STORAGE_KEYS.APP_STATE, 'background');
};

// Verificar si la app se cerró completamente (no estaba en background)
export const wasAppClosedCompletely = async (): Promise<boolean> => {
  const state = await AsyncStorage.getItem(STORAGE_KEYS.APP_STATE);
  // Si no hay estado guardado, significa que la app se cerró completamente
  return state !== 'background';
};

// Marcar que la app está activa de nuevo
export const markAppActive = async (): Promise<void> => {
  await AsyncStorage.removeItem(STORAGE_KEYS.APP_STATE);
};

// Limpiar la sesión si la app se cerró completamente
export const clearSessionIfAppClosed = async (): Promise<boolean> => {
  const wasClosed = await wasAppClosedCompletely();
  if (wasClosed) {
    await logout();
    return true;
  }
  await markAppActive();
  return false;
};

export const esUsuarioAdmin = (user?: UsuarioActual | null): boolean => {
  const flag = user?.esAdmin ?? user?.isAdmin ?? user?.admin;
  if (typeof flag === 'boolean') return flag;
  if (typeof flag === 'number') return flag === 1;
  if (typeof flag === 'string') return flag.trim() === '1' || flag.trim() === 'true';
  return false;
};

export const setClienteConfig = async (
  cliente: ClienteConfig
): Promise<void> => {
  await AsyncStorage.setItem(STORAGE_KEYS.cliente, JSON.stringify(cliente));
};

const resolveClienteId = async (
  idCliente?: number
): Promise<number | undefined> => {
  if (idCliente) return idCliente;
  const userDataRaw = await AsyncStorage.getItem(STORAGE_KEYS.user);
  if (!userDataRaw) return undefined;
  try {
    const userData = JSON.parse(userDataRaw) as { cliente?: ClienteConfig };
    const id = userData.cliente?.idCliente;
    return typeof id === 'number' ? id : undefined;
  } catch (error) {
    return undefined;
  }
};

export const refreshClienteConfig = async (
  idCliente?: number
): Promise<ClienteConfig | null> => {
  try {
    const resolvedId = await resolveClienteId(idCliente);
    const params = resolvedId ? { idCliente: resolvedId } : undefined;
    const headers = await getAuthHeaders();
    const response = await api.get<ClienteConfigResponse>('/api/cliente-config', {
      params,
      headers,
    });

    if (response.data?.success && response.data.data) {
      await setClienteConfig(response.data.data);
      // eslint-disable-next-line no-console
      console.log('✅ [CONFIG] Cliente config updated');
      return response.data.data;
    }

    // eslint-disable-next-line no-console
    console.error(
      '❌ [CONFIG] Failed to refresh cliente config',
      response.data?.error ?? 'Unknown error'
    );
    return null;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('❌ [CONFIG] Error refreshing cliente config', error);
    return null;
  }
};

export const getClienteConfig = async (): Promise<ClienteConfig | null> => {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.cliente);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ClienteConfig;
  } catch (error) {
    return null;
  }
};
