import { Tabs } from 'expo-router';
import React, { useEffect, useState } from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { clearSession, getClienteConfig } from '@/utils/config';
import { LinearGradient } from 'expo-linear-gradient';
import { FiltersProvider } from '@/components/dashboard/filters-context';
import { API_CONFIG } from '@/constants/api';

const HeaderTitle = () => {
  const [companyName, setCompanyName] = useState('');

  useEffect(() => {
    let mounted = true;
    const loadCompanyName = async () => {
      // En modo demo, mostrar nombre de ejemplo
      if (API_CONFIG.DEMO_MODE) {
        if (mounted) {
          setCompanyName('Empresa Demo');
        }
        return;
      }
      
      const cliente = await getClienteConfig();
      if (!mounted) return;
      setCompanyName(cliente?.razonSocial || cliente?.nombre || '');
    };
    void loadCompanyName();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <View style={styles.headerTitle}>
      <Text style={styles.headerKicker}>Dashboard</Text>
      <Text style={styles.headerMain} numberOfLines={1}>
        {companyName || 'Cargando...'}
      </Text>
    </View>
  );
};

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <FiltersProvider>
      <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#F97316',
        tabBarInactiveTintColor: '#94A3B8',
        headerShown: true,
        tabBarButton: HapticTab,
        headerTitle: '',
        headerTransparent: true,
        headerBackground: () => (
          <LinearGradient
            colors={['#0B1F3A', '#1F3B73', '#F97316']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerBackground}
          />
        ),
        headerStyle: styles.header,
        headerRight: () => (
          API_CONFIG.DEMO_MODE ? null : (
            <Pressable
              onPress={() => {
                void clearSession();
                router.replace('/login');
              }}
              style={styles.logoutButton}>
              <Text style={styles.logoutText}>Salir</Text>
            </Pressable>
          )
        ),
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
        tabBarBackground: () => <View style={styles.tabBarBackground} />,
      }}>
      <Tabs.Screen
        name="ventas"
        options={{
          title: 'Ventas',
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons name="chart-bar" size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="inventario"
        options={{
          title: 'Inventario',
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons name="package-variant" size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="finanzas"
        options={{
          title: 'Finanzas',
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons name="cash-multiple" size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="proyecciones"
        options={{
          title: 'Proyecciones',
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons name="chart-line" size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="alertas"
        options={{
          title: 'Alertas',
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons name="alert-circle-outline" size={24} color={color} />
          ),
        }}
      />
    </Tabs>
    </FiltersProvider>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 88,
    borderBottomWidth: 0,
  },
  headerBackground: {
    flex: 1,
  },
  headerTitle: {
    paddingLeft: 12,
  },
  headerKicker: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.75)',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  headerMain: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  logoutButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginRight: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
  },
  logoutText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  tabBar: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 0,
    borderRadius: 14,
    marginHorizontal: 12,
    marginBottom: 10,
    paddingBottom: 6,
    paddingTop: 6,
    height: 66,
    position: 'absolute',
    left: 0,
    right: 0,
  },
  tabBarBackground: {
    backgroundColor: 'transparent',
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
});
