import axios, { AxiosError } from 'axios';
import Constants from 'expo-constants';
import { DEMO_MODE, getMockResponse } from './mock-data';

// Detectar si estamos en desarrollo de forma segura
// En producción, __DEV__ podría no existir, así que asumimos false por defecto
const isDevelopment = (() => {
  try {
    return typeof __DEV__ !== 'undefined' && __DEV__ === true;
  } catch {
    return false;
  }
})();

const fallbackDevUrl = 'http://192.168.18.79:3000';
const fallbackProdUrl = 'http://capdatos.dyndns.org:3000';

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
  DEMO_MODE,
};

export const api = axios.create({
  baseURL: baseUrl,
  timeout: 60000,
});

let authToken = '';

export const setAuthToken = (token: string | null) => {
  authToken = token?.trim() ?? '';
  if (authToken) {
    api.defaults.headers.common.Authorization = `Bearer ${authToken}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
};

export const getApiKeyHeader = (): Record<string, string> =>
  apiKey ? { 'x-api-key': apiKey } : {};

// Interceptor para modo demo
api.interceptors.request.use(config => {
  // Si estamos en modo demo, cancelar la petición y devolver mock
  if (DEMO_MODE) {
    const mockData = getMockResponse(config.url || '');
    if (isDevelopment) {
      console.info('[api] DEMO MODE - Returning mock data for', config.url);
    }
    // Lanzar una respuesta falsa que será capturada
    return Promise.reject({ 
      config, 
      response: { 
        data: mockData, 
        status: 200, 
        statusText: 'OK',
        headers: {},
        config 
      },
      isAxiosError: false,
      isMockResponse: true,
    });
  }

  if (authToken) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${authToken}`;
  }
  if (apiKey) {
    config.headers = config.headers ?? {};
    config.headers['x-api-key'] = apiKey;
  }
  if (isDevelopment) {
    // eslint-disable-next-line no-console
    console.info(
      '[api] Request',
      config.method?.toUpperCase(),
      config.url,
      config.params ?? '',
      authToken ? 'AUTH=SET' : 'AUTH=EMPTY'
    );
  }
  return config;
});

api.interceptors.response.use(
  response => {
    if (isDevelopment) {
      // eslint-disable-next-line no-console
      console.info('[api] Response', response.status, response.config.url);
    }
    return response;
  },
  (error: any) => {
    // Si es una respuesta mock, devolverla como exitosa
    if (error.isMockResponse) {
      return Promise.resolve(error.response);
    }

    if (isDevelopment) {
      const status = error.response?.status;
      // eslint-disable-next-line no-console
      console.warn('[api] Error', status ?? 'NO_STATUS', error.config?.url);
    }
    return Promise.reject(error);
  }
);
