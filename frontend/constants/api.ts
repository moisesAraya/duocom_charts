/**
 * api.ts — Cliente HTTP centralizado para la aplicación.
 *
 * Configura una instancia de Axios con la URL base del backend,
 * manejo de token JWT y un wrapper que permite modo demo con datos mock.
 *
 * La URL del backend se resuelve en este orden:
 *  1. Variable de entorno EXPO_PUBLIC_API_URL
 *  2. Campo `apiUrl` en app.json → extra
 *  3. Fallback a https://duocom.dyndns.org/charts
 *
 * Exports principales:
 *  - API_CONFIG: { BASE_URL, API_KEY }
 *  - api: wrapper de Axios con soporte de modo demo
 *  - setAuthToken(): guarda el JWT para futuras peticiones
 *  - getApiKeyHeader(): devuelve el header x-api-key
 */

import axios, { AxiosError, type AxiosRequestConfig, type AxiosResponse } from 'axios';
import Constants from 'expo-constants';

// Detectar si estamos en desarrollo de forma segura
// En producción, __DEV__ podría no existir, así que asumimos false por defecto
const isDevelopment = (() => {
  try {
    return typeof __DEV__ !== 'undefined' && __DEV__ === true;
  } catch {
    return false;
  }
})();

const getExpoDevHost = (): string | null => {
  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants as any)?.manifest2?.extra?.expoClient?.hostUri ??
    (Constants as any)?.manifest?.debuggerHost ??
    null;

  if (!hostUri || typeof hostUri !== 'string') return null;
  const host = hostUri.split(':')[0]?.trim();
  return host || null;
};

const buildDevBaseUrl = (): string => {
  const devHost = getExpoDevHost();
  if (devHost) {
    return `http://${devHost}:3002`;
  }
  return 'http://localhost:3002';
};

const fallbackDevUrl = buildDevBaseUrl();
const fallbackProdUrl = 'https://duocom.dyndns.org/charts';

const baseUrl =
  process.env.EXPO_PUBLIC_API_URL ?? 
  Constants.expoConfig?.extra?.apiUrl ??
  (isDevelopment ? fallbackDevUrl : fallbackProdUrl);
const apiKey = 
  process.env.EXPO_PUBLIC_API_KEY ?? 
  Constants.expoConfig?.extra?.apiKey ?? 
  '';
export const API_CONFIG = {
  BASE_URL: baseUrl,
  API_KEY: apiKey,
};

const axiosInstance = axios.create({
  baseURL: baseUrl,
  timeout: 60000,
});

let authToken = '';

export const setAuthToken = (token: string | null) => {
  authToken = token?.trim() ?? '';
  if (authToken) {
    axiosInstance.defaults.headers.common.Authorization = `Bearer ${authToken}`;
  } else {
    delete axiosInstance.defaults.headers.common.Authorization;
  }
};

export const getApiKeyHeader = (): Record<string, string> =>
  apiKey ? { 'x-api-key': apiKey } : {};

/** Cliente HTTP — delega directamente a la instancia de Axios configurada. */
export const api = {
  get: <T = any>(url: string, config?: AxiosRequestConfig) =>
    axiosInstance.get<T>(url, config),

  post: <T = any>(url: string, data?: any, config?: AxiosRequestConfig) =>
    axiosInstance.post<T>(url, data, config),

  put: <T = any>(url: string, data?: any, config?: AxiosRequestConfig) =>
    axiosInstance.put<T>(url, data, config),

  delete: <T = any>(url: string, config?: AxiosRequestConfig) =>
    axiosInstance.delete<T>(url, config),

  defaults: axiosInstance.defaults,
};

