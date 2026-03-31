import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { canonicalBranchId, useDashboardFilters } from './filters-context';

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

const branchColorRgb = (branch: string, index: number): string => {
  if (!branch) return SERIES_COLORS[index % SERIES_COLORS.length];
  let hash = 0;
  for (let i = 0; i < branch.length; i += 1) {
    hash = (hash * 31 + branch.charCodeAt(i)) % 997;
  }
  return SERIES_COLORS[hash % SERIES_COLORS.length];
};

const isSelected = (selectedIds: string[], branchId: string): boolean => {
  const c = canonicalBranchId(branchId);
  return selectedIds.some((id) => canonicalBranchId(id) === c);
};

type BranchMultiSelectProps = {
  /** Estilo compacto para barra superior (Ventas). */
  variant?: 'card' | 'inline';
  /**
   * Selección local (por gráfico). Si viene con `onToggle`, no usa el contexto global.
   */
  value?: string[];
  onToggle?: (id: string) => void;
  onSelectAll?: () => void;
  onClear?: () => void;
  /** Texto auxiliar: “este gráfico”. */
  scopeHint?: string;
  /** Una sola sucursal (radio). Solo tiene sentido con `value` + `onToggle` controlados. */
  single?: boolean;
};

export function BranchMultiSelect({
  variant = 'card',
  value,
  onToggle,
  onSelectAll,
  onClear,
  scopeHint,
  single = false,
}: BranchMultiSelectProps) {
  const {
    sucursales,
    selectedSucursales,
    toggleSucursal,
    clearSucursales,
    selectAllSucursales,
  } = useDashboardFilters();

  const [open, setOpen] = useState(false);

  const controlled = value !== undefined && typeof onToggle === 'function';
  const selectedIds = controlled ? (value ?? []) : selectedSucursales;

  const summary = useMemo(() => {
    if (!sucursales.length) return 'Sin sucursales';
    if (single && controlled) {
      if (selectedIds.length === 0) return 'Elegí una sucursal';
      const id = selectedIds[0];
      const b = sucursales.find(
        (s) => canonicalBranchId(s.id) === canonicalBranchId(id),
      );
      return b?.nombre?.trim() || String(id);
    }
    if (selectedIds.length === 0) return 'Ninguna seleccionada';
    if (selectedIds.length === sucursales.length) return 'Todas las sucursales';
    return `${selectedIds.length} de ${sucursales.length}`;
  }, [controlled, single, sucursales, selectedIds]);

  const doToggle = (id: string) => {
    if (controlled) onToggle(id);
    else toggleSucursal(id);
  };
  const doSelectAll = () => {
    if (controlled) onSelectAll?.();
    else selectAllSucursales();
  };
  const doClear = () => {
    if (controlled) onClear?.();
    else clearSucursales();
  };

  const buttonStyle =
    variant === 'inline' ? [styles.trigger, styles.triggerInline] : styles.trigger;

  return (
    <>
      <Pressable
        style={buttonStyle}
        onPress={() => setOpen(true)}
        disabled={!sucursales.length}
      >
        <View style={styles.triggerTextWrap}>
          <Text style={styles.triggerLabel}>
            {single ? 'Sucursal' : 'Sucursales'}
            {scopeHint ? ` · ${scopeHint}` : ''}
          </Text>
          <Text style={styles.triggerValue}>{summary}</Text>
        </View>
        <Text style={styles.chevron}>Elegir</Text>
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>
                {single
                  ? scopeHint
                    ? `Sucursal · ${scopeHint}`
                    : 'Sucursal'
                  : scopeHint
                    ? `Sucursales · ${scopeHint}`
                    : 'Sucursales'}
              </Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={12}>
                <Text style={styles.sheetClose}>Listo</Text>
              </Pressable>
            </View>

            {!(single && controlled) ? (
              <View style={styles.actions}>
                <Pressable style={styles.actionBtn} onPress={doSelectAll}>
                  <Text style={styles.actionBtnText}>Todas</Text>
                </Pressable>
                <Pressable style={styles.actionBtn} onPress={doClear}>
                  <Text style={styles.actionBtnText}>Ninguna</Text>
                </Pressable>
              </View>
            ) : null}

            <FlatList
              data={sucursales}
              keyExtractor={(item) => canonicalBranchId(item.id)}
              style={styles.list}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item, index }) => {
                const on = isSelected(selectedIds, item.id);
                const rgb = branchColorRgb(item.nombre || item.id, index);
                return (
                  <Pressable
                    style={[styles.row, on && styles.rowOn]}
                    onPress={() => {
                      doToggle(item.id);
                      if (single && controlled) setOpen(false);
                    }}
                  >
                    <View style={[styles.swatch, { backgroundColor: `rgb(${rgb})` }]} />
                    <Text style={[styles.rowName, !on && styles.rowNameMuted]}>{item.nombre}</Text>
                    {single && controlled ? (
                      <View style={[styles.radioOuter, on && styles.radioOuterOn]}>
                        {on ? <View style={styles.radioInner} /> : null}
                      </View>
                    ) : (
                      <View style={[styles.check, on && styles.checkOn]}>
                        {on ? <Text style={styles.checkMark}>✓</Text> : null}
                      </View>
                    )}
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                <Text style={styles.empty}>No hay sucursales disponibles.</Text>
              }
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#111827',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  triggerInline: {
    marginBottom: 12,
  },
  triggerTextWrap: {
    flex: 1,
    marginRight: 12,
  },
  triggerLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  triggerValue: {
    marginTop: 4,
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  chevron: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2563EB',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 28,
    maxHeight: '78%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  sheetClose: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2563EB',
  },
  actions: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  actionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginRight: 10,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
  },
  list: {
    marginTop: 8,
    paddingHorizontal: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginHorizontal: 6,
    marginBottom: 4,
    backgroundColor: '#FAFAFA',
  },
  rowOn: {
    backgroundColor: '#EFF6FF',
  },
  swatch: {
    width: 10,
    height: 28,
    borderRadius: 4,
    marginRight: 12,
  },
  rowName: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
    fontWeight: '500',
  },
  rowNameMuted: {
    color: '#94A3B8',
  },
  check: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  checkOn: {
    borderColor: '#2563EB',
    backgroundColor: '#2563EB',
  },
  checkMark: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  radioOuterOn: {
    borderColor: '#2563EB',
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#2563EB',
  },
  empty: {
    textAlign: 'center',
    color: '#6B7280',
    padding: 24,
    fontSize: 14,
  },
});
