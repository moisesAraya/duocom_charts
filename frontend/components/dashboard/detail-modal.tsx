import React from "react";
import {
  Modal,
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
} from "react-native";
import { formatCurrency } from "./utils";

interface DetailModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  headers: string[];
  rows: {
    label: string;
    values: (string | number)[];
  }[];
  accentColor?: string;
}

export const DetailModal = ({
  visible,
  onClose,
  title,
  subtitle,
  headers,
  rows,
  accentColor = "#3B82F6",
}: DetailModalProps) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{title}</Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
            <Pressable style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>

          <View style={styles.tableHeader}>
            {headers.map((h, i) => (
              <Text
                key={i}
                style={[
                  styles.headerText,
                  { flex: i === 0 ? 1.5 : 1, textAlign: i === 0 ? "left" : "right" },
                ]}
              >
                {h}
              </Text>
            ))}
          </View>

          <ScrollView style={styles.scroll}>
            {rows.map((row, i) => (
              <View
                key={i}
                style={[
                  styles.row,
                  { backgroundColor: i % 2 === 0 ? "#fff" : "#F8FAFC" },
                ]}
              >
                <Text style={[styles.rowLabel, { flex: 1.5 }]}>{row.label}</Text>
                {row.values.map((v, j) => (
                  <Text
                    key={j}
                    style={[
                      styles.rowValue,
                      {
                        flex: 1,
                        textAlign: "right",
                        color: j === 0 && row.values.length > 1 ? accentColor : "#1E293B",
                      },
                    ]}
                  >
                    {typeof v === "number" ? formatCurrency(v) : v}
                  </Text>
                ))}
              </View>
            ))}
            {rows.length === 0 && (
              <Text style={styles.emptyText}>Sin datos disponibles.</Text>
            )}
          </ScrollView>

          <Pressable
            style={[styles.footerBtn, { backgroundColor: accentColor }]}
            onPress={onClose}
          >
            <Text style={styles.footerBtnText}>Cerrar</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  card: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    minHeight: "50%",
    maxHeight: "85%",
    paddingBottom: 30,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1E293B",
  },
  subtitle: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
  },
  closeText: {
    fontSize: 24,
    lineHeight: 28,
    color: "#475569",
    fontWeight: "300",
  },
  tableHeader: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: "#F8FAFC",
  },
  headerText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748B",
    textTransform: "uppercase",
  },
  scroll: {
    paddingHorizontal: 20,
  },
  row: {
    flexDirection: "row",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    alignItems: "center",
  },
  rowLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#334155",
  },
  rowValue: {
    fontSize: 13,
    fontWeight: "700",
  },
  emptyText: {
    textAlign: "center",
    padding: 40,
    color: "#94A3B8",
    fontSize: 14,
  },
  footerBtn: {
    margin: 20,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  footerBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
});
