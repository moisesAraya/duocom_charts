/**
 * config-token.tsx — Pantalla de configuración inicial por token.
 *
 * Flujo de ingreso de token:
 *  1. Usuario ingresa token de empresa
 *  2. Botón "Validar token" hace POST a /api/validar-token
 *  3. Si es válido, guarda token + configuración y navega a login
 *  4. Si hay error, muestra que el token es inválido
 *  5. Botón "Limpiar" para volver a empezar
 */

import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  validarYGuardarToken,
  clearEmpresaToken,
  getClienteConfig,
} from '@/utils/empresa-storage';
import { logout } from '@/utils/config';

export default function ConfigTokenScreen() {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [empresaConfig, setEmpresaConfig] = useState('');

  // Cargar config guardada al iniciar
  useEffect(() => {
    const loadConfig = async () => {
      const config = await getClienteConfig();
      if (config) {
        setEmpresaConfig(config.razonSocial);
      }
    };
    loadConfig();
  }, []);

  const handleValidarToken = async () => {
    if (!token.trim()) {
      Alert.alert('Error', 'Ingrese un token');
      return;
    }

    setLoading(true);
    try {
      console.log('[ConfigToken] Validando token...');
      const config = await validarYGuardarToken(token);
      
      Alert.alert(
        'Éxito',
        `Token validado para empresa: ${config.razonSocial}`,
        [
          {
            text: 'Continuar',
            onPress: () => {
              // Navegar a login
              router.replace('/login');
            },
          },
        ]
      );
    } catch (error) {
      console.error('[ConfigToken] Error:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Error al validar token';
      Alert.alert('Error', errorMessage);
    } finally {
      setLoading(false);
    }
  };



  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <LinearGradient
          colors={['#0B1F3A', '#F97316']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.background}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Logo/Header */}
            <View style={styles.headerContainer}>
              <Image
                source={require('@/assets/images/img.png')}
                style={styles.logo}
                resizeMode="contain"
              />
              <Text style={styles.title}>Configuración de Empresa</Text>
              <Text style={styles.subtitle}>
                Ingrese el token para configurar su empresa
              </Text>
            </View>

            {/* Tarjeta de configuración */}
            <View style={styles.card}>
              {/* Sección: Token */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Token de Empresa</Text>
                <View style={styles.inputGroup}>
                  <View style={styles.inputContainer}>
                    <Ionicons
                      name="key"
                      size={20}
                      color="#fff"
                      style={styles.inputIcon}
                    />
                    <TextInput
                      style={styles.input}
                      placeholder="Ingrese token"
                      placeholderTextColor="#ccc"
                      value={token}
                      onChangeText={setToken}
                      secureTextEntry={false}
                      editable={!loading}
                      selectTextOnFocus
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                </View>
              </View>

              {/* Estado de configuración */}
              {empresaConfig && (
                <View style={styles.configStatus}>
                  <Ionicons
                    name="checkmark-circle"
                    size={20}
                    color="#fff"
                  />
                  <View style={styles.statusText}>
                    <Text style={styles.statusLabel}>Empresa Configurada:</Text>
                    <Text style={styles.statusValue}>{empresaConfig}</Text>
                  </View>
                </View>
              )}

              {/* Botones */}
              <View style={styles.buttonContainer}>
                <TouchableOpacity
                  style={[styles.button, styles.primaryButton, loading && styles.buttonDisabled]}
                  onPress={handleValidarToken}
                  disabled={loading || !token.trim()}
                >
                  {loading ? (
                    <ActivityIndicator color="white" size="small" />
                  ) : (
                    <>
                      <Ionicons name="checkmark" size={20} color="white" />
                      <Text style={styles.buttonText}>Validar Token</Text>
                    </>
                  )}
                </TouchableOpacity>


              </View>

            </View>

            {/* Pie de página */}
            <View style={styles.supportContainer}>
              <Text style={styles.supportLabel}>Soporte Técnico</Text>
              <TouchableOpacity 
                 style={styles.supportLink}
                 onPress={() => Alert.alert('Soporte', 'Contactando a soporte: +569 68322651')}
              >
                <Ionicons name="call" size={16} color="#F97316" />
                <Text style={styles.supportText}>+569 68322651</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </LinearGradient>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0B1F3A',
  },
  container: {
    flex: 1,
  },
  background: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
    justifyContent: 'flex-start',
    paddingTop: 80,
    paddingBottom: 24,
  },
  headerContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logo: {
    width: 80,
    height: 80,
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  inputGroup: {
    gap: 12,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 50,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: '#fff',
  },
  configStatus: {
    flexDirection: 'row',
    backgroundColor: 'rgba(249, 115, 22, 0.18)',
    borderLeftWidth: 4,
    borderLeftColor: '#F97316',
    padding: 12,
    borderRadius: 8,
    marginBottom: 24,
    alignItems: 'center',
  },
  statusText: {
    marginLeft: 12,
    flex: 1,
  },
  statusLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: 4,
  },
  statusValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  buttonContainer: {
    gap: 12,
    marginBottom: 20,
  },
  button: {
    flexDirection: 'row',
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  primaryButton: {
    backgroundColor: '#F97316',
  },
  secondaryButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  supportContainer: {
    marginTop: 40,
    alignItems: 'center',
    gap: 8,
    paddingBottom: 24,
  },
  supportLabel: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  supportLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  supportText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
