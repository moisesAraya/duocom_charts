import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useDashboardFilters } from './filters-context';

const SERIES_COLORS = [
  '59, 130, 246',
  '16, 185, 129',
  '245, 158, 11',
  '139, 92, 246',
  '236, 72, 153',
  '14, 116, 144',
  '234, 88, 12',
  '248, 113, 113',
  '34, 197, 94',
  '251, 146, 60',
];

const getBranchColor = (branch: string, fallbackIndex = 0): string => {
  if (!branch) return SERIES_COLORS[fallbackIndex % SERIES_COLORS.length];
  let hash = 0;
  for (let i = 0; i < branch.length; i += 1) {
    hash = (hash * 31 + branch.charCodeAt(i)) % 997;
  }
  return SERIES_COLORS[hash % SERIES_COLORS.length];
};

export const FiltersPanel = () => {
  const {
    sucursales,
    selectedSucursales,
    toggleSucursal,
    clearSucursales,
    selectAllSucursales,
  } = useDashboardFilters();

  const allSelected = selectedSucursales.length === sucursales.length;
  const noneSelected = selectedSucursales.length === 0;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Sucursales</Text>
          <Text style={styles.subtitle}>
            {noneSelected
              ? 'Ninguna seleccionada'
              : allSelected
              ? 'Todas las sucursales'
              : `${selectedSucursales.length} de ${sucursales.length} seleccionadas`}
          </Text>
        </View>
      </View>

      <View style={styles.actionRow}>
        <Pressable
          style={styles.actionChip}
          onPress={selectAllSucursales}
        >
          <Text style={styles.actionChipText}>Todas</Text>
        </Pressable>
        <Pressable
          style={styles.actionChip}
          onPress={clearSucursales}
        >
          <Text style={styles.actionChipText}>Ninguna</Text>
        </Pressable>
      </View>

      {sucursales.length > 0 ? (
        <View style={styles.chipRow}>
          {sucursales.map((sucursal, index) => {
            const isSelected = selectedSucursales.includes(sucursal.id);
            const colorRgb = getBranchColor(sucursal.id, index);
            return (
              <Pressable
                key={sucursal.id}
                style={[styles.chip, isSelected && styles.chipActive]}
                onPress={() => toggleSucursal(sucursal.id)}
              >
                <View
                  style={[
                    styles.colorIndicator,
                    { backgroundColor: `rgb(${colorRgb})` },
                  ]}
                />
                <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>
                  {sucursal.nombre}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <Text style={styles.emptyText}>No hay sucursales disponibles</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    marginBottom: 18,
    shadowColor: '#111827',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  subtitle: {
    marginTop: 6,
    color: '#6B7280',
    fontSize: 12,
  },
  actionRow: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  actionChip: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginRight: 8,
    marginBottom: 8,
    backgroundColor: '#F3F4F6',
  },
  actionChipText: {
    fontSize: 12,
    color: '#111827',
    fontWeight: '600',
  },
  emptyText: {
    marginTop: 4,
    fontSize: 12,
    color: '#9CA3AF',
  },
  chipRow: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  chip: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    marginRight: 8,
    marginBottom: 8,
    backgroundColor: '#F9FAFB',
    flexDirection: 'row',
    alignItems: 'center',
  },
  chipActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  colorIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  chipText: {
    fontSize: 12,
    color: '#111827',
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#F9FAFB',
  },
});
