/**
 * apiKey.ts — Middleware de validación de API Key.
 *
 * Verifica que el header 'x-api-key' contenga la clave correcta.
 * Protege endpoints públicos (validar-rut, login) para que solo
 * aplicaciones autorizadas puedan usarlos.
 *
 * TODO: Actualmente está DESHABILITADO para desarrollo.
 *       Descomentar la validación antes de ir a producción.
 */

import { RequestHandler } from 'express';
import { config } from '../config';

export const apiKeyMiddleware: RequestHandler = (req, res, next) => {
  // TODO: Habilitar validación antes de producción
  // const apiKey = req.headers['x-api-key'];
  // if (!apiKey || apiKey !== config.apiKey) {
  //   res.status(401).json({ success: false, error: 'API key inválida' });
  //   return;
  // }
  next();
};
