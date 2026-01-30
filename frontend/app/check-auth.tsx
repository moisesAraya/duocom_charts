import React, { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRootNavigationState, useRouter } from 'expo-router';
import { getUsuarioActual, getClienteConfig, logout } from '@/utils/config';

export default function SplashScreen() {
  const router = useRouter();
  const rootNavState = useRootNavigationState();

  useEffect(() => {
    // Espera a que el root layout/navigator esté montado
    if (!rootNavState?.key) return;

    const checkTokenAndRedirect = async () => {
      try {
        // Si aquí de verdad quieres validar token/config, hazlo acá.
        // Ejemplo típico: usuario logeado => / (tabs), sino => /login

        const usuario = await getUsuarioActual();

        // (Opcional) Si tu config puede fallar, lo envuelves con try/catch
        // const cfg = await getClienteConfig();

        if (usuario) {
          router.replace('/(tabs)/ventas'); // ir a la pantalla principal de ventas
        } else {
          router.replace('/login');
        }
      } catch (e) {
        // ante error, manda a login (o haz logout si aplica)
        try {
          await logout?.();
        } catch {}
        router.replace('/login');
      }
    };

    checkTokenAndRedirect();
  }, [rootNavState?.key, router]);

  return (
    <LinearGradient
      colors={['#0B1F3A', '#F97316']}
      style={styles.splashContainer}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <View style={styles.splashContent}>
        <Image
          source={require('../assets/images/img.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.splashTitulo}>DuoCom Charts</Text>
        <Text style={styles.splashSubtitulo}>Sistema de visualización de estadísticas</Text>
        <View style={styles.splashDivider} />
        <EmpresaNombreDinamico />
        <Text style={styles.splashSlogan}>Servicios integrales en Informática</Text>
      </View>
    </LinearGradient>
  );
}

function EmpresaNombreDinamico() {
  const [nombre, setNombre] = useState('');

  useEffect(() => {
    let alive = true;
    getClienteConfig()
      .then(cfg => {
        if (!alive) return;
        setNombre(cfg?.razonSocial || cfg?.nombreFantasia || '');
      })
      .catch(() => {
        if (!alive) return;
        setNombre('');
      });

    return () => {
      alive = false;
    };
  }, []);

  return <Text style={styles.splashEmpresa}>{nombre || ' '}</Text>;
}

const styles = StyleSheet.create({
  splashContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  splashContent: {
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  logo: {
    width: 200,
    height: 200,
    marginBottom: 10,
  },
  splashTitulo: {
    fontSize: 36,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 6,
    letterSpacing: 2,
    textAlign: 'center',
  },
  splashSubtitulo: {
    fontSize: 16,
    color: 'white',
    opacity: 0.9,
    marginBottom: 20,
  },
  splashDivider: {
    width: 50,
    height: 2,
    backgroundColor: '#FDBA74',
    marginBottom: 20,
    opacity: 0.8,
    borderRadius: 1,
  },
  splashEmpresa: {
    fontSize: 20,
    fontWeight: '600',
    color: 'white',
    marginBottom: 3,
  },
  splashSlogan: {
    fontSize: 12,
    color: 'white',
    opacity: 0.8,
    textAlign: 'center',
  },
});
