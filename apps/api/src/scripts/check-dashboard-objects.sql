-- check-dashboard-objects.sql
-- Verifica si existen los procedimientos y tablas usados por el dashboard.
-- Version compatible con editores SQL mas estrictos (sin WITH / SET LIST).

-- 1) Estado por objeto: FOUND / MISSING
SELECT
    'PROCEDURE' AS object_type,
    'GRAF_VTAMES_SUC' AS object_name,
    CASE
        WHEN EXISTS (
            SELECT 1
            FROM RDB$PROCEDURES p
            WHERE UPPER(TRIM(p.RDB$PROCEDURE_NAME)) = 'GRAF_VTAMES_SUC'
        ) THEN 'FOUND'
        ELSE 'MISSING'
    END AS status
FROM RDB$DATABASE

UNION ALL

SELECT
    'PROCEDURE',
    '_PROYVENTAANUAL',
    CASE
        WHEN EXISTS (
            SELECT 1
            FROM RDB$PROCEDURES p
            WHERE UPPER(TRIM(p.RDB$PROCEDURE_NAME)) = '_PROYVENTAANUAL'
        ) THEN 'FOUND'
        ELSE 'MISSING'
    END
FROM RDB$DATABASE

UNION ALL

SELECT
    'PROCEDURE',
    '_PVTVENTAHORARIA',
    CASE
        WHEN EXISTS (
            SELECT 1
            FROM RDB$PROCEDURES p
            WHERE UPPER(TRIM(p.RDB$PROCEDURE_NAME)) = '_PVTVENTAHORARIA'
        ) THEN 'FOUND'
        ELSE 'MISSING'
    END
FROM RDB$DATABASE

UNION ALL

SELECT
    'PROCEDURE',
    'X_RETPRODSXGRUPO',
    CASE
        WHEN EXISTS (
            SELECT 1
            FROM RDB$PROCEDURES p
            WHERE UPPER(TRIM(p.RDB$PROCEDURE_NAME)) = 'X_RETPRODSXGRUPO'
        ) THEN 'FOUND'
        ELSE 'MISSING'
    END
FROM RDB$DATABASE

UNION ALL

SELECT
    'PROCEDURE',
    '_PVTSTOCK',
    CASE
        WHEN EXISTS (
            SELECT 1
            FROM RDB$PROCEDURES p
            WHERE UPPER(TRIM(p.RDB$PROCEDURE_NAME)) = '_PVTSTOCK'
        ) THEN 'FOUND'
        ELSE 'MISSING'
    END
FROM RDB$DATABASE

UNION ALL

SELECT
    'PROCEDURE',
    '_PVTDOCXPAGAR',
    CASE
        WHEN EXISTS (
            SELECT 1
            FROM RDB$PROCEDURES p
            WHERE UPPER(TRIM(p.RDB$PROCEDURE_NAME)) = '_PVTDOCXPAGAR'
        ) THEN 'FOUND'
        ELSE 'MISSING'
    END
FROM RDB$DATABASE

UNION ALL

SELECT
    'PROCEDURE',
    '_PVTROTACION',
    CASE
        WHEN EXISTS (
            SELECT 1
            FROM RDB$PROCEDURES p
            WHERE UPPER(TRIM(p.RDB$PROCEDURE_NAME)) = '_PVTROTACION'
        ) THEN 'FOUND'
        ELSE 'MISSING'
    END
FROM RDB$DATABASE

UNION ALL

SELECT
    'TABLE',
    'ESUCURSALES',
    CASE
        WHEN EXISTS (
            SELECT 1
            FROM RDB$RELATIONS r
            WHERE COALESCE(r.RDB$SYSTEM_FLAG, 0) = 0
                AND UPPER(TRIM(r.RDB$RELATION_NAME)) = 'ESUCURSALES'
        ) THEN 'FOUND'
        ELSE 'MISSING'
    END
FROM RDB$DATABASE

ORDER BY 1, 2;


-- 2) Solo faltantes (MISSING)
SELECT object_type, object_name
FROM (
    SELECT
        'PROCEDURE' AS object_type,
        'GRAF_VTAMES_SUC' AS object_name,
        CASE
            WHEN EXISTS (
                SELECT 1 FROM RDB$PROCEDURES p
                WHERE UPPER(TRIM(p.RDB$PROCEDURE_NAME)) = 'GRAF_VTAMES_SUC'
            ) THEN 1 ELSE 0
        END AS exists_flag
    FROM RDB$DATABASE

    UNION ALL

    SELECT
        'PROCEDURE',
        '_PROYVENTAANUAL',
        CASE
            WHEN EXISTS (
                SELECT 1 FROM RDB$PROCEDURES p
                WHERE UPPER(TRIM(p.RDB$PROCEDURE_NAME)) = '_PROYVENTAANUAL'
            ) THEN 1 ELSE 0
        END
    FROM RDB$DATABASE

    UNION ALL

    SELECT
        'PROCEDURE',
        '_PVTVENTAHORARIA',
        CASE
            WHEN EXISTS (
                SELECT 1 FROM RDB$PROCEDURES p
                WHERE UPPER(TRIM(p.RDB$PROCEDURE_NAME)) = '_PVTVENTAHORARIA'
            ) THEN 1 ELSE 0
        END
    FROM RDB$DATABASE

    UNION ALL

    SELECT
        'PROCEDURE',
        'X_RETPRODSXGRUPO',
        CASE
            WHEN EXISTS (
                SELECT 1 FROM RDB$PROCEDURES p
                WHERE UPPER(TRIM(p.RDB$PROCEDURE_NAME)) = 'X_RETPRODSXGRUPO'
            ) THEN 1 ELSE 0
        END
    FROM RDB$DATABASE

    UNION ALL

    SELECT
        'PROCEDURE',
        '_PVTSTOCK',
        CASE
            WHEN EXISTS (
                SELECT 1 FROM RDB$PROCEDURES p
                WHERE UPPER(TRIM(p.RDB$PROCEDURE_NAME)) = '_PVTSTOCK'
            ) THEN 1 ELSE 0
        END
    FROM RDB$DATABASE

    UNION ALL

    SELECT
        'PROCEDURE',
        '_PVTDOCXPAGAR',
        CASE
            WHEN EXISTS (
                SELECT 1 FROM RDB$PROCEDURES p
                WHERE UPPER(TRIM(p.RDB$PROCEDURE_NAME)) = '_PVTDOCXPAGAR'
            ) THEN 1 ELSE 0
        END
    FROM RDB$DATABASE

    UNION ALL

    SELECT
        'PROCEDURE',
        '_PVTROTACION',
        CASE
            WHEN EXISTS (
                SELECT 1 FROM RDB$PROCEDURES p
                WHERE UPPER(TRIM(p.RDB$PROCEDURE_NAME)) = '_PVTROTACION'
            ) THEN 1 ELSE 0
        END
    FROM RDB$DATABASE

    UNION ALL

    SELECT
        'TABLE',
        'ESUCURSALES',
        CASE
            WHEN EXISTS (
                SELECT 1 FROM RDB$RELATIONS r
                WHERE COALESCE(r.RDB$SYSTEM_FLAG, 0) = 0
                    AND UPPER(TRIM(r.RDB$RELATION_NAME)) = 'ESUCURSALES'
            ) THEN 1 ELSE 0
        END
    FROM RDB$DATABASE
) x
WHERE x.exists_flag = 0
ORDER BY object_type, object_name;


-- 3) Ayuda de diagnostico: nombres parecidos
SELECT TRIM(p.RDB$PROCEDURE_NAME) AS procedure_name
FROM RDB$PROCEDURES p
WHERE UPPER(TRIM(p.RDB$PROCEDURE_NAME)) LIKE '%PROY%'
     OR UPPER(TRIM(p.RDB$PROCEDURE_NAME)) LIKE '%PVT%'
     OR UPPER(TRIM(p.RDB$PROCEDURE_NAME)) LIKE '%GRAF%'
     OR UPPER(TRIM(p.RDB$PROCEDURE_NAME)) LIKE '%GRUPO%'
ORDER BY 1;

SELECT TRIM(r.RDB$RELATION_NAME) AS table_name
FROM RDB$RELATIONS r
WHERE COALESCE(r.RDB$SYSTEM_FLAG, 0) = 0
    AND UPPER(TRIM(r.RDB$RELATION_NAME)) LIKE '%SUCURSAL%'
ORDER BY 1;
