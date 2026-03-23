/**
 * login.tsx — Pantalla de inicio de sesión.
 *
 * Flujo de autenticación:
 *  1. La empresa ya fue configurada previamente con token (pantalla config-token).
 *  2. El usuario solo ingresa usuario y contraseña.
 *  3. Se envía POST a /api/login con x-cliente-config en headers.
 *  4. Si el login es exitoso se guarda el token JWT y se navega a la app.
 */

import React, { useState, useRef, useEffect } from "react";
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
} from "react-native";
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import { router } from "expo-router";
import { LinearGradient } from 'expo-linear-gradient';
import {
  getBackendUrl,
  setUsuarioActual,
  getAuthHeaders,
  hayUsuarioLogueado,
  setClienteConfig,
} from "@/utils/config";
import {
  getClienteConfig as getEmpresaConfig,
} from "@/utils/empresa-storage";
import AsyncStorage from "@react-native-async-storage/async-storage";

const stripTrailingSlash = (url: string): string => url.replace(/\/+$/, "");

const unique = (values: string[]): string[] => Array.from(new Set(values));

const getDevHostFromExpo = (): string | null => {
  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants as any)?.manifest2?.extra?.expoClient?.hostUri ??
    (Constants as any)?.manifest?.debuggerHost ??
    null;

  if (!hostUri || typeof hostUri !== 'string') return null;
  const host = hostUri.split(':')[0]?.trim();
  return host || null;
};

const buildLoginCandidateUrls = (baseUrl: string): string[] => {
  const normalizedBase = stripTrailingSlash(baseUrl)
    .replace(/\/api$/i, '')
    .replace(/\/login$/i, '');

  const candidates = [
    `${normalizedBase}/api/login`,
    `${normalizedBase}/login`,
  ];

  try {
    const parsed = new URL(normalizedBase);
    candidates.push(`${parsed.origin}/charts/api/login`);
    candidates.push(`${parsed.origin}/api/login`);
  } catch {
    // Si no se puede parsear como URL, usar solo las rutas relativas al baseUrl.
  }

  const isDevelopment = typeof __DEV__ !== 'undefined' && __DEV__;
  if (isDevelopment) {
    const expoHost = getDevHostFromExpo();
    if (expoHost) {
      candidates.push(`http://${expoHost}:3002/api/login`);
      candidates.push(`http://${expoHost}:3002/login`);
    }
    candidates.push('http://localhost:3002/api/login');
    candidates.push('http://127.0.0.1:3002/api/login');
  }

  return unique(candidates.map(stripTrailingSlash));
};

const safeJsonFromResponse = async <T = any>(response: Response): Promise<T | null> => {
  const raw = await response.text();
  if (!raw.trim()) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

export default function LoginScreen() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [empresaConfigCargada, setEmpresaConfigCargada] = useState(false);
  const [razonSocial, setRazonSocial] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const passwordInputRef = useRef<TextInput>(null);

  useEffect(() => {
    const checkIfLoggedIn = async () => {
      const isLoggedIn = await hayUsuarioLogueado();
      if (isLoggedIn) {
        // Comentado para forzar el login cada vez
        // router.replace(esUsuarioAdmin(json.data) ? "/admin-tabs" : "/user-tabs");
      }

      // Si hay empresa configurada, cargar su config automáticamente
      const empresaConfig = await getEmpresaConfig();
      if (empresaConfig) {
        console.log('[Login] Empresa configurada encontrada:', empresaConfig.razonSocial);
        setEmpresaConfigCargada(true);
        setRazonSocial(empresaConfig.razonSocial);
        await setClienteConfig(empresaConfig);
      } else {
        Alert.alert(
          "Empresa no configurada",
          "Debe ingresar el token de empresa antes de iniciar sesión.",
          [{ text: "Ir a configurar", onPress: () => router.replace('/config-token') }]
        );
      }
    };
    checkIfLoggedIn();
  }, []);

  const handleLogin = async () => {
    if (!empresaConfigCargada) {
      Alert.alert("Error", "Debe configurar la empresa con token antes de iniciar sesión");
      return;
    }
    if (!username.trim()) {
      Alert.alert("Error", "Por favor ingrese un nombre de usuario");
      return;
    }
    if (!password) {
      Alert.alert("Error", "Por favor ingrese la contraseña");
      return;
    }

    try {
      setLoading(true);
      const API_URL = stripTrailingSlash(await getBackendUrl());
      const empresaConfig = await getEmpresaConfig();

      if (!empresaConfig) {
        Alert.alert("Error", "No se encontró configuración de empresa. Configure token nuevamente.");
        router.replace('/config-token');
        return;
      }

      console.log("[login] URL obtenida de config:", API_URL);

      // Enviar credenciales al endpoint de login con fallback por URL
      let json = null;
      const authHeaders = await getAuthHeaders();
      const candidateLoginUrls = buildLoginCandidateUrls(API_URL);
      const networkErrors: string[] = [];
      const invalidPayloadResponses: string[] = [];
      let backendError: string | null = null;

      for (const loginUrl of candidateLoginUrls) {
        console.log("[login] Intentando conectar a:", loginUrl);

        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 12000);

          let response: Response;
          try {
            response = await fetch(loginUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...authHeaders,
                "x-cliente-config": JSON.stringify(empresaConfig),
              },
              body: JSON.stringify({
                username: username.trim(),
                password: password,
              }),
              signal: controller.signal,
            });
          } finally {
            clearTimeout(timeout);
          }

          console.log("[login] Respuesta recibida:", response.status, loginUrl);
          const parsed = await safeJsonFromResponse(response);

          if (response.ok && parsed) {
            json = parsed;
            break;
          }

          if (response.ok && !parsed) {
            const contentType = response.headers.get('content-type') || 'unknown';
            invalidPayloadResponses.push(`${loginUrl} [content-type=${contentType}]`);
            continue;
          }

          if (parsed && typeof parsed === 'object') {
            backendError = (parsed as any).error || (parsed as any).message || `Error HTTP ${response.status}`;
            break;
          }

          invalidPayloadResponses.push(`${loginUrl} [status=${response.status}]`);
        } catch (error: any) {
          const message = error instanceof Error ? error.message : 'Error de red';
          networkErrors.push(`${loginUrl} -> ${message}`);
        }
      }

      if (!json) {
        if (backendError) {
          throw new Error(backendError);
        }
        if (invalidPayloadResponses.length > 0) {
          throw new Error(
            `El backend respondió con formato no válido en login. URLs probadas: ${invalidPayloadResponses.join(' | ')}`
          );
        }
        if (networkErrors.length > 0) {
          throw new Error(
            `No se pudo conectar a login. URLs probadas: ${networkErrors.join(' | ')}`
          );
        }
      }

      if (!json) {
        throw new Error("No se pudo conectar al servidor");
      }
      if (json.success && json.data) {
        await setUsuarioActual(json.data);
        await setClienteConfig(json.data.cliente);
        const permissionsAccepted = await AsyncStorage.getItem("permissionsAccepted");
        if (permissionsAccepted === "true") {
          // Ir directo a la app principal (tabs)
          router.replace("/(tabs)/ventas");
        } else {
          // Por ahora ir directo a tabs, ya que no hay pantalla de permisos
          router.replace("/(tabs)/ventas");
        }
      } else {
        Alert.alert("Error", json.error || "Usuario incorrecto");
      }
    } catch (error: any) {
      console.error("Error en login:", error);
      Alert.alert(
        "Error de Conexión",
        error?.message || "No se pudo conectar con el servidor. Verifique su conexión."
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
      end={{ x: 1, y: 1 }}
    >
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <KeyboardAvoidingView
          behavior="padding"
          keyboardVerticalOffset={Platform.OS === "ios" ? 40 : 20}
          style={styles.keyboardView}
        >
          <View style={{ alignItems: "flex-end", paddingTop: 15, paddingRight: 16 }}>
            {/* Backend config button removed - no route exists */}
          </View>

          <View style={styles.content}>
            <ScrollView 
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.logoContainer}>
                <Image
                  source={require('../assets/images/img.png')}
                  style={styles.logo}
                  resizeMode="contain"
                />
                <Text style={styles.title}>DuoCom Charts</Text>
              </View>

              {razonSocial ? (
                <View style={styles.empresaInfo}>
                  <Ionicons name="business" size={18} color="#F97316" />
                  <Text style={styles.empresaText}>{razonSocial}</Text>
                  <Text style={styles.empresaEstado}>Conectado</Text>
                </View>
              ) : null}

              <View style={styles.form}>
                {razonSocial ? (
                  <Text style={styles.formTitle}>Iniciar Sesión</Text>
                ) : null}

                <View style={styles.inputGroup}>
                  <View style={styles.inputIconContainer}>
                    <Ionicons name="person" size={20} color="#fff" />
                    <TextInput
                      style={[styles.input, !empresaConfigCargada && styles.inputDisabled]}
                      placeholder="Usuario"
                      placeholderTextColor="#ccc"
                      value={username}
                      onChangeText={setUsername}
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable={!loading && empresaConfigCargada}
                      returnKeyType="next"
                      onSubmitEditing={() => {
                        passwordInputRef?.current?.focus();
                      }}
                    />
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <View style={styles.inputIconContainer}>
                    <Ionicons name="lock-closed" size={20} color="#fff" />
                    <TextInput
                      ref={passwordInputRef}
                      style={[styles.input, !empresaConfigCargada && styles.inputDisabled]}
                      placeholder="Contraseña"
                      placeholderTextColor="#ccc"
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable={!loading && empresaConfigCargada}
                      returnKeyType="done"
                      onSubmitEditing={handleLogin}
                    />
                    <TouchableOpacity onPress={() => setShowPassword((v) => !v)} style={styles.eyeIcon}>
                      <Ionicons name={showPassword ? "eye" : "eye-off"} size={20} color="#fff" />
                    </TouchableOpacity>
                  </View>
                </View>

                <TouchableOpacity
                  style={[
                    styles.loginButton,
                    (loading || !empresaConfigCargada) && styles.loginButtonDisabled,
                  ]}
                  onPress={handleLogin}
                  disabled={loading || !empresaConfigCargada}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="log-in" size={20} color="#fff" />
                      <Text style={styles.loginButtonText}>Iniciar Sesión</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.secondaryActionButton, loading && styles.loginButtonDisabled]}
                  onPress={() => router.replace('/config-token')}
                  disabled={loading}
                >
                  <Ionicons name="swap-horizontal" size={18} color="#fff" />
                  <Text style={styles.secondaryActionText}>Ingresar otro token</Text>
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
    justifyContent: "flex-start",
    paddingTop: 36,
    paddingHorizontal: 24,
    paddingBottom: 36,
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: 22,
  },
  logo: {
    width: 120,
    height: 120,
    marginBottom: 6,
  },
  title: {
    fontSize: 26,
    fontWeight: "bold",
    color: "#fff",
    marginTop: 6,
    letterSpacing: 1,
  },
  empresaInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(249, 115, 22, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(249, 115, 22, 0.45)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 8,
    marginBottom: 14,
  },
  empresaText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    flexShrink: 1,
  },
  empresaEstado: {
    color: '#F97316',
    fontSize: 13,
    fontWeight: '700',
  },
  form: {
    width: "100%",
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 16,
    padding: 18,
  },
  formTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 14,
  },
  inputGroup: {
    marginBottom: 14,
  },
  inputIconContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    paddingHorizontal: 16,
    height: 56,
  },
  input: {
    flex: 1,
    color: "#fff",
    fontSize: 16,
    marginLeft: 12,
    marginRight: 8,
  },
  inputDisabled: {
    opacity: 0.5,
  },
  eyeIcon: {
    padding: 4,
  },
  loginButton: {
    backgroundColor: "#F97316",
    borderRadius: 12,
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
    gap: 8,
  },
  loginButtonDisabled: {
    opacity: 0.6,
  },
  loginButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  secondaryActionButton: {
    marginTop: 10,
    borderRadius: 12,
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  secondaryActionText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
