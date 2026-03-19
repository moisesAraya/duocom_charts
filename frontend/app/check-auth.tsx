/**
 * check-auth.tsx — Pantalla intermedia de verificación de autenticación.
 *
 * Flujo:
 * 1. Si hay usuario logueado y config válida -> ir a tabs (ventas)
 * 2. Si hay token empresa y se puede inicializar -> ir a login
 * 3. Si no hay token empresa -> ir a config-token (ingreso de token)
 * 4. Si hay error -> ir a config-token con opción de reintentar
 */

import React, { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRootNavigationState, useRouter } from 'expo-router';
import {
  getUsuarioActual,
  getClienteConfig,
  logout,
} from '@/utils/config';
import {
  hayTokenEmpresa,
  inicializarConfigDesdeToken,
} from '@/utils/empresa-storage';

export default function CheckAuthScreen() {
  const router = useRouter();
  const rootNavState = useRootNavigationState();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // Espera a que el root layout/navigator esté montado
    if (!rootNavState?.key) return;

    const checkTokenAndRedirect = async () => {
      try {
        console.log('[CheckAuth] Iniciando verificación...');

        // 1. Verificar si ya hay usuario logueado con config válida
        const usuario = await getUsuarioActual();
        const clienteConfig = await getClienteConfig();

        if (usuario && clienteConfig) {
          console.log('[CheckAuth] Usuario logueado encontrado, ir a ventas');
          router.replace('/(tabs)/ventas');
          return;
        }

        // 2. Verificar si hay token de empresa
        const tieneToken = await hayTokenEmpresa();
        console.log('[CheckAuth] ¿Tiene token empresa?', tieneToken);

        if (tieneToken) {
          // Intentar inicializar config desde token
          console.log('[CheckAuth] Inicializando config desde token...');
          const config = await inicializarConfigDesdeToken();

          if (config) {
            console.log('[CheckAuth] Config inicializada exitosamente, ir a login');
            router.replace('/login');
            return;
          }
        }

        // 3. No hay token válido, ir a configuración de token
        console.log('[CheckAuth] No hay token válido, ir a config-token');
        router.replace('/config-token');
      } catch (error) {
        console.error('[CheckAuth] Error durante verificación:', error);
        try {
          await logout?.();
        } catch {}
        // Ir a pantalla de configuración de token
        router.replace('/config-token');
      } finally {
        setIsChecking(false);
      }
    };

    checkTokenAndRedirect();
  }, [rootNavState?.key, router]);

  return (
    <LinearGradient
      colors={['#667eea', '#764ba2']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <View style={styles.content}>
        <Image
          source={require('../assets/images/img.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        {isChecking && (
          <>
            <Text style={styles.title}>Iniciando sesión...</Text>
            <Text style={styles.subtitle}>Por favor espere</Text>
          </>
        )}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
  },
  logo: {
    width: 100,
    height: 100,
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
  },
});
