/**
 * _layout.tsx — Layout raíz de la aplicación (expo-router).
 *
 * Configura:
 *  - ErrorBoundary: captura errores no manejados para evitar crash.
 *  - AppStateManager: detecta transiciones foreground/background
 *    para limpiar la sesión si la app se cerró completamente.
 *  - ThemeProvider: aplica tema claro u oscuro según preferencia del sistema.
 *  - Stack de navegación: splash → login → (tabs).
 */

import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Component, type ReactNode, useEffect } from 'react';
import { View, Text, AppState, type AppStateStatus } from 'react-native';
import { markAppBackground, markAppActive } from '@/utils/config';

// Error boundary simple sin dependencias
class SimpleErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: '#fff' }}>
          <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 10, color: '#000' }}>
            Algo salió mal
          </Text>
          <Text style={{ color: '#666', textAlign: 'center' }}>
            {this.state.error?.message || 'Error desconocido'}
          </Text>
        </View>
      );
    }

    return this.props.children;
  }
}

function AppStateManager() {
  useEffect(() => {
    // Marcar como activa al iniciar
    markAppActive();

    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        // App va a background
        markAppBackground();
      } else if (nextAppState === 'active') {
        // App vuelve a foreground
        markAppActive();
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return null;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <SimpleErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <AppStateManager />
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="splash" />
            <Stack.Screen name="login" />
            <Stack.Screen name="(tabs)" />
          </Stack>
          <StatusBar style="auto" />
        </ThemeProvider>
      </GestureHandlerRootView>
    </SimpleErrorBoundary>
  );
}
