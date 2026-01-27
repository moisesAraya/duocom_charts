import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_CONFIG, api, getApiKeyHeader, setAuthToken } from '@/constants/api';

export type ClienteConfig = {
  idCliente?: number | string;
  rut: string;
  nombre: string;
  razonSocial?: string;
  configuracion: Record<string, unknown>;
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

const STORAGE_KEYS = {
  backendUrl: '@backendUrl',
  user: '@userData',
  token: '@authToken',
  cliente: '@clienteConfig',
};

export const setBackendUrl = async (url: string): Promise<void> => {
  const trimmed = url.trim();
  if (!trimmed) return;
  await AsyncStorage.setItem(STORAGE_KEYS.backendUrl, trimmed);
  api.defaults.baseURL = trimmed;
};

export const getBackendUrl = async (): Promise<string> => {
  const stored = await AsyncStorage.getItem(STORAGE_KEYS.backendUrl);
  const resolved = stored?.trim() || API_CONFIG.BASE_URL;
  api.defaults.baseURL = resolved;
  return resolved;
};

export const getAuthHeaders = async (): Promise<Record<string, string>> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...getApiKeyHeader(),
  };
  const token = await AsyncStorage.getItem(STORAGE_KEYS.token);
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
};

export const setUsuarioActual = async (user: UsuarioActual): Promise<void> => {
  await AsyncStorage.setItem(STORAGE_KEYS.user, JSON.stringify(user));
  if (user.token) {
    await AsyncStorage.setItem(STORAGE_KEYS.token, user.token);
    setAuthToken(user.token);
  }
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
