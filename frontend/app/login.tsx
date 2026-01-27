import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  esUsuarioAdmin,
  getAuthHeaders,
  getBackendUrl,
  hayUsuarioLogueado,
  setClienteConfig,
  setUsuarioActual,
} from '@/utils/config';

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rut, setRut] = useState('');
  const [rutValidado, setRutValidado] = useState(false);
  const [razonSocial, setRazonSocial] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const passwordInputRef = useRef<TextInput>(null);

  useEffect(() => {
  }, []);

  useEffect(() => {
    if (rut.length >= 8) {
      void validarRutAutomatico();
    } else {
      setRutValidado(false);
      setRazonSocial('');
    }
  }, [rut]);

  const validarRutAutomatico = async () => {
    try {
      const API_URL = await getBackendUrl();
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_URL}/api/validar-rut`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ rut }),
      });
      const json = await response.json();
      if (json.success) {
        setRutValidado(true);
      } else {
        setRutValidado(false);
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error validando RUT:', error);
      setRutValidado(false);
    }
  };

  const validarRutManual = async () => {
    if (!rut.trim()) {
      Alert.alert('Error', 'Por favor ingrese un RUT');
      return;
    }

    try {
      setLoading(true);
      const API_URL = await getBackendUrl();
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_URL}/api/validar-rut`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ rut }),
      });
      const json = await response.json();
      if (json.success) {
        setRutValidado(true);
        await setClienteConfig(json.data);
        setRazonSocial(json.data?.razonSocial ?? '');
      } else {
        setRutValidado(false);
        Alert.alert('RUT invalido', json.error || 'RUT no encontrado');
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error validando RUT:', error);
      setRutValidado(false);
      Alert.alert(
        'Error de conexion',
        'No se pudo conectar con el servidor.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!rutValidado) {
      Alert.alert('Error', 'Por favor ingrese un RUT valido');
      return;
    }
    if (!username.trim()) {
      Alert.alert('Error', 'Por favor ingrese un nombre de usuario');
      return;
    }
    if (!password) {
      Alert.alert('Error', 'Por favor ingrese la contrasena');
      return;
    }

    try {
      setLoading(true);
      const API_URL = await getBackendUrl();
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_URL}/api/login`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          username: username.trim(),
          password,
          rut,
        }),
      });
      const json = await response.json();
      if (json.success && json.data) {
        const token = typeof json.token === 'string' ? json.token : '';
        await setUsuarioActual({ ...json.data, token });
        if (json.data.cliente) {
          await setClienteConfig(json.data.cliente);
        }
        router.replace(esUsuarioAdmin(json.data) ? '/ventas' : '/ventas');
      } else {
        Alert.alert('Error', json.error || 'Usuario incorrecto');
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error en login:', error);
      Alert.alert(
        'Error de conexion',
        'No se pudo conectar con el servidor.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient
      colors={['#0B1F3A', '#F97316']}
      style={styles.container}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <KeyboardAvoidingView
          behavior="padding"
          keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 20}
          style={styles.keyboardView}>
          <View style={styles.content}>
            <ScrollView
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}>
              <View style={styles.logoContainer}>
                <Image
                  source={require('../assets/images/icon.png')}
                  style={styles.logo}
                  resizeMode="contain"
                />
                <Text style={styles.title}>DuoCom Charts</Text>
              </View>

              <View style={styles.form}>
                <View style={styles.inputGroup}>
                  <View style={styles.inputIconContainer}>
                    <Ionicons name="card" size={20} color="#999" />
                    <TextInput
                      style={styles.input}
                      placeholder="RUT Empresa"
                      placeholderTextColor="#666"
                      value={rut}
                      onChangeText={text => setRut(text.replace(/\D/g, ''))}
                      keyboardType="numeric"
                      maxLength={9}
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable={!loading}
                      returnKeyType="next"
                    />
                    <TouchableOpacity
                      style={[
                        styles.validateButtonSmall,
                        rutValidado && styles.validateButtonSmallSuccess,
                      ]}
                      onPress={validarRutManual}
                      disabled={loading || rut.length < 8}>
                      <Ionicons
                        name={rutValidado ? 'checkmark-circle' : 'search'}
                        size={16}
                        color="white"
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                {razonSocial ? (
                  <View style={styles.companyInfo}>
                    <Text style={styles.companyText}>
                      Bienvenido {razonSocial}
                    </Text>
                  </View>
                ) : null}

                <View style={styles.inputGroup}>
                  <View style={styles.inputIconContainer}>
                    <Ionicons name="person" size={20} color="#999" />
                    <TextInput
                      style={[
                        styles.input,
                        !rutValidado && styles.inputDisabled,
                      ]}
                      placeholder="Usuario"
                      placeholderTextColor="#666"
                      value={username}
                      onChangeText={setUsername}
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable={!loading && rutValidado}
                      returnKeyType="next"
                      onSubmitEditing={() => {
                        passwordInputRef?.current?.focus();
                      }}
                    />
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <View style={styles.inputIconContainer}>
                    <Ionicons name="lock-closed" size={20} color="#999" />
                    <TextInput
                      ref={passwordInputRef}
                      style={[
                        styles.input,
                        !rutValidado && styles.inputDisabled,
                      ]}
                      placeholder="Contrasena"
                      placeholderTextColor="#666"
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable={!loading && rutValidado}
                      returnKeyType="done"
                      onSubmitEditing={handleLogin}
                    />
                    <TouchableOpacity
                      onPress={() => setShowPassword(value => !value)}
                      style={styles.eyeIcon}>
                      <Ionicons
                        name={showPassword ? 'eye' : 'eye-off'}
                        size={20}
                        color="#999"
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                <TouchableOpacity
                  style={[
                    styles.loginButton,
                    (loading || !rutValidado) && styles.loginButtonDisabled,
                  ]}
                  onPress={handleLogin}
                  disabled={loading || !rutValidado}>
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="log-in" size={20} color="#fff" />
                      <Text style={styles.loginButtonText}>Iniciar Sesion</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    paddingTop: 80,
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logo: {
    width: 200,
    height: 200,
    marginBottom: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FDBA74',
    marginTop: 16,
    letterSpacing: 1,
  },
  form: {
    width: '100%',
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputIconContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(249, 115, 22, 0.45)',
    paddingHorizontal: 16,
    height: 56,
  },
  input: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    marginLeft: 12,
    marginRight: 8,
  },
  inputDisabled: {
    opacity: 0.5,
  },
  validateButtonSmall: {
    backgroundColor: '#F97316',
    borderRadius: 8,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  validateButtonSmallSuccess: {
    backgroundColor: '#F97316',
  },
  eyeIcon: {
    padding: 4,
  },
  loginButton: {
    backgroundColor: '#F97316',
    borderRadius: 12,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    gap: 8,
  },
  loginButtonDisabled: {
    opacity: 0.6,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  companyInfo: {
    marginTop: 8,
    marginBottom: 8,
    alignItems: 'center',
  },
  companyText: {
    color: '#FDBA74',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
