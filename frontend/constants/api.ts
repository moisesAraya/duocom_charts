import axios from 'axios';

declare const __DEV__: boolean;

export const API_CONFIG = {
  BASE_URL: __DEV__ ? 'http://192.168.18.79:3000' : 'http://capdatos.dyndns.org:3000', // Desarrollo local vs producción
  API_KEY: 'Duocom2025SecretKey!@#', // La API key del backend
};

export const api = axios.create({
  baseURL: API_CONFIG.BASE_URL,
  headers: {
    'x-api-key': API_CONFIG.API_KEY,
  },
});