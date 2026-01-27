import React, { useEffect } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import * as ExpoSplashScreen from 'expo-splash-screen';

export default function SplashScreen() {
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const prepare = async () => {
      try {
        await ExpoSplashScreen.preventAutoHideAsync();
        await ExpoSplashScreen.hideAsync();

        timeout = setTimeout(() => {
          // Login temporalmente desactivado - redirige directo a tabs
          router.replace('/(tabs)/resumenes');
        }, 3000);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error in splash preparation:', error);
      }
    };

    void prepare();

    return () => {
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
