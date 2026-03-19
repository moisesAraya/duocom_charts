/**
 * tokenConfig.ts — Tipos para configuración empresarial por token.
 *
 * Define la estructura de respuesta al validar un token de empresa.
 */

export interface TokenConfigData {
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

export interface TokenValidationResponse {
  success: boolean;
  data?: TokenConfigData;
  error?: string;
  message?: string;
}

export interface TokenValidationRequest {
  token: string;
}
