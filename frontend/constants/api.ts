import axios, { AxiosError } from 'axios';

declare const __DEV__: boolean;

const fallbackDevUrl = 'http://192.168.18.79:3000';
const fallbackProdUrl = 'http://capdatos.dyndns.org:3000';

const baseUrl =
  process.env.EXPO_PUBLIC_API_URL ?? (__DEV__ ? fallbackDevUrl : fallbackProdUrl);
const apiKey = process.env.EXPO_PUBLIC_API_KEY ?? '';
export const API_CONFIG = {
  BASE_URL: baseUrl,
  API_KEY: apiKey,
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

api.interceptors.request.use(config => {
  if (authToken) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${authToken}`;
  }
  if (apiKey) {
    config.headers = config.headers ?? {};
    config.headers['x-api-key'] = apiKey;
  }
  // eslint-disable-next-line no-console
  console.info(
    '[api] Request',
    config.method?.toUpperCase(),
    config.url,
    config.params ?? '',
    authToken ? 'AUTH=SET' : 'AUTH=EMPTY'
  );
  return config;
});

api.interceptors.response.use(
  response => {
    // eslint-disable-next-line no-console
    console.info('[api] Response', response.status, response.config.url);
    return response;
  },
  (error: AxiosError) => {
    const status = error.response?.status;
    // eslint-disable-next-line no-console
    console.warn('[api] Error', status ?? 'NO_STATUS', error.config?.url);
    return Promise.reject(error);
  }
);
