-- Script SQL para configurar empresa de TEST en la BD central (DUOCOMAPPS)
-- Ejecutar en: Firebird DUOCOMAPPS

-- Antes de ejecutar, modificar los valores según tu ambiente:
-- - TOKEN: cambiar a un valor único
-- - IP: direccion del servidor de BD
-- - PUERTO: puerto de Firebird (default 3050)
-- - DBALIAS: ruta/alias de la BD de la empresa
-- - URL1, URL2, URL3: URLs de acceso

-- OPCIÓN 1: INSERT directo (si el campo TOKEN existe)
INSERT INTO "Clientes" (
  "RUT", 
  "RZ", 
  "RAZONSOCIAL",
  "IP", 
  "PUERTO", 
  "DBALIAS", 
  "TOKEN",
  "URL1", 
  "URL2", 
  "URL3", 
  "ESTADO"
)
VALUES (
  123456789,                              -- RUT (nueve dígitos)
  'TEST COMPANY',                         -- RZ (razón social corta)
  'TEST COMPANY SPA',                     -- RAZONSOCIAL (razón social completa)
  '192.168.1.100',                        -- IP del servidor Firebird
  '3050',                                 -- PUERTO (default Firebird)
  'C:\\DuoCOM\\BDatos\\TESTDB.FDB',       -- DBALIAS (ruta BD)
  'empresa-token-test-12345',             -- TOKEN de 8+ caracteres
  'https://duocom.dyndns.org',            -- URL1
  'https://backup1.duocom.org',           -- URL2
  'https://backup2.duocom.org',           -- URL3
  1                                       -- ESTADO (1=activo)
);
COMMIT;

-- OPCIÓN 2: UPDATE si el cliente ya existe
UPDATE "Clientes"
SET 
  "TOKEN" = 'empresa-token-test-12345',
  "ESTADO" = 1
WHERE "RUT" = 123456789;
COMMIT;

-- OPCIÓN 3: Si el campo TOKEN no existe, usar RUT + agregar columna
-- (Este paso puede ser necesario si la tabla Clientes no tiene TOKEN)
ALTER TABLE "Clientes" ADD "TOKEN" VARCHAR(255);
COMMIT;

-- Luego verificar que el registro existe y está correcto:
SELECT 
  "RUT",
  "RZ",
  "RAZONSOCIAL",
  "IP",
  "PUERTO",
  "DBALIAS",
  "TOKEN",
  "ESTADO"
FROM "Clientes"
WHERE "RUT" = 123456789;

---

-- DATOS DE TEST PARA DIFERENTES EMPRESAS:

-- TEST 1: Matriz Principal
INSERT INTO "Clientes" (
  "RUT", "RZ", "RAZONSOCIAL", "IP", "PUERTO", "DBALIAS",
  "TOKEN", "URL1", "URL2", "URL3", "ESTADO"
)
VALUES (
  111111111,
  'DUOCOM CHILE',
  'DuoCOM Chile SPA',
  'localhost',
  '3050',
  'C:\\DuoCOM\\BDatos\\DUOCOM.FDB',
  'duocom-matriz-token-001',
  'https://duocom.dyndns.org',
  'https://backup1.duocom.org',
  'https://backup2.duocom.org',
  1
);

-- TEST 2: Sucursal Nord
INSERT INTO "Clientes" (
  "RUT", "RZ", "RAZONSOCIAL", "IP", "PUERTO", "DBALIAS",
  "TOKEN", "URL1", "URL2", "URL3", "ESTADO"
)
VALUES (
  222222222,
  'DUOCOM NORD',
  'DuoCOM Sucursal Nord',
  '192.168.1.50',
  '3050',
  '\\\\SERVER-NORD\\DuoCOM\\BDatos\\DUOCOM_NORD.FDB',
  'duocom-nord-token-002',
  'https://nord.duocom.org',
  NULL,
  NULL,
  1
);

-- TEST 3: Cliente Externo
INSERT INTO "Clientes" (
  "RUT", "RZ", "RAZONSOCIAL", "IP", "PUERTO", "DBALIAS",
  "TOKEN", "URL1", "URL2", "URL3", "ESTADO"
)
VALUES (
  333333333,
  'CLIENTE EXTERNO',
  'Cliente Externo SPA',
  '10.0.0.100',
  '3050',
  'C:\\BDatos\\CLIENTE.FDB',
  'cliente-externo-token-003',
  'https://cliente.duocom.org',
  NULL,
  NULL,
  1
);

COMMIT;

-- Verificar que todos los registros están guardados:
SELECT "RUT", "RZ", "TOKEN", "ESTADO" FROM "Clientes" 
WHERE "TOKEN" IS NOT NULL
ORDER BY "RUT";

---

-- LIMPIAR (si necesitas resetear para testing):

-- Eliminar todos los registros de test:
DELETE FROM "Clientes" WHERE "RUT" IN (123456789, 111111111, 222222222, 333333333);
COMMIT;

-- O desactivar sin eliminar:
UPDATE "Clientes" 
SET "ESTADO" = 0 
WHERE "RUT" IN (123456789, 111111111, 222222222, 333333333);
COMMIT;

---

-- Ejemplo de respuesta esperada al llamar POST /api/validar-token con:
-- { "token": "duocom-matriz-token-001" }

/*
{
  "success": true,
  "data": {
    "razonSocial": "DuoCOM Chile SPA",
    "ip": "localhost",
    "puerto": 3050,
    "bdAlias": "C:\\DuoCOM\\BDatos\\DUOCOM.FDB",
    "user": "SYSDBA",
    "clave": "masterkey",
    "url1": "https://duocom.dyndns.org",
    "url2": "https://backup1.duocom.org",
    "url3": "https://backup2.duocom.org"
  }
}
*/
