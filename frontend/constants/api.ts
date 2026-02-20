import axios, { AxiosError, type AxiosRequestConfig, type AxiosResponse } from 'axios';
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

const fallbackDevUrl = 'https://duocom.dyndns.org/charts';
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
  DEMO_MODE,
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

// Wrapper para api que maneja modo demo
export const api = {
  get: async <T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> => {
    if (DEMO_MODE) {
      const mockData = getMockResponse(url);
      return Promise.resolve({
        data: mockData as T,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: config || {} as any,
      } as AxiosResponse<T>);
    }
    return axiosInstance.get<T>(url, config);
  },
  
  post: async <T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> => {
    if (DEMO_MODE) {
      const mockData = getMockResponse(url);
      return Promise.resolve({
        data: mockData as T,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: config || {} as any,
      } as AxiosResponse<T>);
    }
    return axiosInstance.post<T>(url, data, config);
  },
  
  put: async <T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> => {
    if (DEMO_MODE) {
      const mockData = getMockResponse(url);
      return Promise.resolve({
        data: mockData as T,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: config || {} as any,
      } as AxiosResponse<T>);
    }
    return axiosInstance.put<T>(url, data, config);
  },
  
  delete: async <T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> => {
    if (DEMO_MODE) {
      const mockData = getMockResponse(url);
      return Promise.resolve({
        data: mockData as T,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: config || {} as any,
      } as AxiosResponse<T>);
    }
    return axiosInstance.delete<T>(url, config);
  },
  
  defaults: axiosInstance.defaults,
};

