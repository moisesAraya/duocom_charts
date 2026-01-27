import React, { useEffect } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import * as ExpoSplashScreen from 'expo-splash-screen';

export default function SplashScreen() {
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let isMounted = true;

    const prepare = async () => {
      try {
        await ExpoSplashScreen.preventAutoHideAsync();
      } catch (e) {
        // Ignorar error, continuar
      }

      try {
        await ExpoSplashScreen.hideAsync();
      } catch (e) {
        // Ignorar error, continuar
      }

      // Usar timeout más corto y asegurar navegación
      timeout = setTimeout(() => {
        if (isMounted) {
          try {
            // Modo demo - va directo a resumenes sin login
            router.replace('/(tabs)/resumenes');
          } catch (e) {
            // Si falla, intentar de nuevo
            setTimeout(() => {
              try {
                router.replace('/(tabs)/resumenes');
              } catch (err) {
                // Último intento con push
                router.push('/(tabs)/resumenes');
              }
            }, 500);
          }
        }
      }, 2000);
    };

    prepare().catch(() => {
      // Si todo falla, navegar de todos modos
      if (isMounted) {
        router.replace('/(tabs)/resumenes');
      }
    });

    return () => {
      isMounted = false;
      if (timeout) clearTimeout(timeout);
    };
  }, []);

  return (
    <LinearGradient
      colors={['#0B1F3A', '#F97316']}
      style={styles.splashContainer}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}>
      <View style={styles.splashContent}>
        <Image
          source={require('../assets/images/icon.png')}
          style={styles.logo}
          resizeMode="contain"
        />

        <Text style={styles.splashTitulo}>DuoCom Charts</Text>
        <Text style={styles.splashSubtitulo}>Sistema de visualización de estadísticas</Text>
        <View style={styles.splashDivider} />
        <Text style={styles.splashEmpresa}>DuoCom SpA.</Text>
        <Text style={styles.splashSlogan}>Servicios integrales en Informática</Text>
      </View>
    </LinearGradient>
  );
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
