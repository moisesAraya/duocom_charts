import React, { useEffect, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getClienteConfig, refreshClienteConfig } from '@/utils/config';

export const ScreenShell = ({
  title,
  subtitle,
  children,
  refreshing = false,
  onRefresh,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
}) => {
  const [companyName, setCompanyName] = useState('');

  useEffect(() => {
    let mounted = true;
    const loadCompanyName = async () => {
      let cliente = await getClienteConfig();
      if (!cliente) {
        // Si no hay config en storage, refresca desde backend
        cliente = await refreshClienteConfig();
        if (!cliente) {
          // Si falló el refresh, mostrar alerta
          Alert.alert(
            'Error de configuración',
            'No se pudo cargar la configuración del cliente. Verifica tu conexión a internet e intenta nuevamente.',
            [{ text: 'OK' }]
          );
        }
      }
      if (!mounted) return;
      setCompanyName(cliente?.razonSocial || cliente?.nombre || cliente?.nombreFantasia || '');
    };
    void loadCompanyName();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <View style={styles.screen}>
      <View pointerEvents="none" style={styles.bgShapePrimary} />
      <View pointerEvents="none" style={styles.bgShapeSecondary} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#F97316']}
              tintColor="#F97316"
            />
          ) : undefined
        }
      >
        <View style={styles.header}>
          {companyName ? (
            <Text style={styles.companyName}>{companyName}</Text>
          ) : null}
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {children}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F7F3EF',
  },
  bgShapePrimary: {
    position: 'absolute',
    top: -120,
    right: -80,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: '#FCD34D',
    opacity: 0.28,
  },
  bgShapeSecondary: {
    position: 'absolute',
    bottom: -140,
    left: -90,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: '#93C5FD',
    opacity: 0.22,
  },
  content: {
    padding: 20,
    paddingTop: 108, // 88 (header height) + 20 (padding)
    paddingBottom: 120,
  },
  header: {
    marginBottom: 16,
  },
  companyName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
  },
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    color: '#6B7280',
  },
});
