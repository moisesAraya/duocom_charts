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
import { router } from "expo-router";
import { LinearGradient } from 'expo-linear-gradient';
import {
  getBackendUrl,
  setUsuarioActual,
  getAuthHeaders,
  hayUsuarioLogueado,
  setBackendUrl,
  esUsuarioAdmin,
  setClienteConfig,
} from "@/utils/config";
import AsyncStorage from "@react-native-async-storage/async-storage";

const stripTrailingSlash = (url: string): string => url.replace(/\/+$/, "");

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
  const [rut, setRut] = useState("");
  const [rutValidado, setRutValidado] = useState(false);
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
    };
    checkIfLoggedIn();
  }, []);

  useEffect(() => {
    if (rut.length >= 8) {
      validarRutAutomatico();
    } else {
      setRutValidado(false);
    }
  }, [rut]);

  const validarRutAutomatico = async () => {
    try {
      const API_URL = stripTrailingSlash(await getBackendUrl());
      const response = await fetch(`${API_URL}/api/validar-rut`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": "Duocom2025SecretKey!@#",
        },
        body: JSON.stringify({ rut }),
      });
      const json = await safeJsonFromResponse<{ success?: boolean; data?: any }>(response);
      if (response.ok && json?.success) {
        setRutValidado(true);
        await setClienteConfig(json.data);
        setRazonSocial(json.data?.razonSocial ?? "");
      } else {
        setRutValidado(false);
      }
    } catch (error) {
      console.error("Error validando RUT:", error);
      setRutValidado(false);
    }
  };

  const validarRutManual = async () => {
    if (!rut.trim()) {
      Alert.alert("Error", "Por favor ingrese un RUT");
      return;
    }

    try {
      setLoading(true);
      const API_URL = stripTrailingSlash(await getBackendUrl());
      const response = await fetch(`${API_URL}/api/validar-rut`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": "Duocom2025SecretKey!@#",
        },
        body: JSON.stringify({ rut }),
      });
      const json = await safeJsonFromResponse<{ success?: boolean; data?: any; error?: string }>(response);
      if (response.ok && json?.success) {
        setRutValidado(true);
        await setClienteConfig(json.data);
        setRazonSocial(json.data?.razonSocial ?? "");
      } else {
        setRutValidado(false);
        Alert.alert("RUT Inválido", json?.error || "RUT no encontrado o respuesta no valida del servidor");
      }
    } catch (error) {
      console.error("Error validando RUT:", error);
      setRutValidado(false);
      Alert.alert("Error de Conexión", "No se pudo conectar con el servidor. Verifique su conexión.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!rutValidado) {
      Alert.alert("Error", "Por favor ingrese un RUT válido");
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
      console.log("🔐 [LOGIN] URL obtenida de config:", API_URL);

      const validarResponse = await fetch(`${API_URL}/api/validar-rut`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": "Duocom2025SecretKey!@#",
        },
        body: JSON.stringify({ rut }),
      });
      const validarJson = await safeJsonFromResponse<{ success?: boolean; data?: any; error?: string }>(validarResponse);
      if (!validarResponse.ok || !validarJson?.success) {
        Alert.alert("Error", validarJson?.error || "RUT no válido o respuesta no valida del servidor");
        return;
      }
      const clienteConfig = validarJson.data;
      console.log("🔐 [LOGIN] Config obtenida:", clienteConfig.razonSocial);

      let json = null;
      try {
        console.log("🔐 [LOGIN] Intentando conectar a:", `${API_URL}/api/login`);
        const response = await fetch(`${API_URL}/api/login`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": "Duocom2025SecretKey!@#",
            "x-cliente-config": JSON.stringify(clienteConfig),
          },
          body: JSON.stringify({
            username: username.trim(),
            password: password,
            rut: rut,
          }),
        });
        console.log("🔐 [LOGIN] Respuesta recibida:", response.status);
        json = await safeJsonFromResponse(response);
        if (!json) {
          throw new Error(`Respuesta vacia o invalida desde ${API_URL}/api/login`);
        }
        console.log("🔐 [LOGIN] Conexión exitosa con:", API_URL);
      } catch (error: any) {
        console.log("❌ [LOGIN] Falló con:", API_URL, error.message);
        throw error;
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
        "No se pudo conectar con el servidor. Verifique su conexión."
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

              <View style={styles.form}>
                <View style={styles.inputGroup}>
                  <View style={styles.inputIconContainer}>
                    <Ionicons name="card" size={20} color="#fff" />
                    <TextInput
                      style={styles.input}
                      placeholder="RUT Empresa"
                      placeholderTextColor="#ccc"
                      value={rut}
                      onChangeText={(text) => setRut(text.replace(/\D/g, ''))}
                      keyboardType="numeric"
                      maxLength={9}
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable={!loading}
                      returnKeyType="next"
                    />
                    <TouchableOpacity
                      style={[styles.validateButtonSmall, rutValidado && styles.validateButtonSmallSuccess]}
                      onPress={validarRutManual}
                      disabled={loading || rut.length < 8}
                    >
                      <Ionicons
                        name={rutValidado ? "checkmark-circle" : "search"}
                        size={16}
                        color="white"
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                {razonSocial ? (
                  <View style={styles.companyInfo}>
                    <Text style={styles.companyText}>Bienvenido {razonSocial}</Text>
                  </View>
                ) : null}

                <View style={styles.inputGroup}>
                  <View style={styles.inputIconContainer}>
                    <Ionicons name="person" size={20} color="#fff" />
                    <TextInput
                      style={[styles.input, !rutValidado && styles.inputDisabled]}
                      placeholder="Usuario"
                      placeholderTextColor="#ccc"
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
                    <Ionicons name="lock-closed" size={20} color="#fff" />
                    <TextInput
                      ref={passwordInputRef}
                      style={[styles.input, !rutValidado && styles.inputDisabled]}
                      placeholder="Contraseña"
                      placeholderTextColor="#ccc"
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable={!loading && rutValidado}
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
                    (loading || !rutValidado) && styles.loginButtonDisabled,
                  ]}
                  onPress={handleLogin}
                  disabled={loading || !rutValidado}
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
    paddingTop: 80,
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: 48,
  },
  logo: {
    width: 200,
    height: 200,
    marginBottom: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#fff",
    marginTop: 16,
    letterSpacing: 1,
  },
  form: {
    width: "100%",
  },
  inputGroup: {
    marginBottom: 16,
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
  validateButtonSmall: {
    backgroundColor: "#F97316",
    borderRadius: 8,
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  validateButtonSmallSuccess: {
    backgroundColor: "#F97316",
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
    marginTop: 8,
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
  companyInfo: {
    marginTop: 8,
    marginBottom: 8,
    alignItems: "center",
  },
  companyText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
});
