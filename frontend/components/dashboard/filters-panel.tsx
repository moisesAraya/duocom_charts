import React from 'react';
import { Pressable, StyleSheet, Text, View, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { BranchMultiSelect } from './branch-multi-select';
import { useDashboardFilters } from './filters-context';

export const FiltersPanel = () => {
  const {
    startDate,
    setStartDate,
    endDate,
    setEndDate,
  } = useDashboardFilters();

  const [showStart, setShowStart] = React.useState(false);
  const [showEnd, setShowEnd] = React.useState(false);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Filtros Globales</Text>
          <Text style={styles.subtitle}>Sucursales y Rango de Fecha</Text>
        </View>
      </View>

      <BranchMultiSelect variant="card" />

      {/* Rango de Fechas */}
      <View style={styles.dateRow}>
        <View style={styles.dateBlock}>
          <Text style={styles.dateLabel}>Desde:</Text>
          <Pressable style={styles.dateButton} onPress={() => setShowStart(true)}>
            <Text style={styles.dateButtonText}>{startDate.toLocaleDateString()}</Text>
          </Pressable>
          {showStart && (
            <DateTimePicker
              value={startDate}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(event, date) => {
                setShowStart(false);
                if (date) setStartDate(date);
              }}
            />
          )}
        </View>

        <View style={styles.dateBlock}>
          <Text style={styles.dateLabel}>Hasta:</Text>
          <Pressable style={styles.dateButton} onPress={() => setShowEnd(true)}>
            <Text style={styles.dateButtonText}>{endDate.toLocaleDateString()}</Text>
          </Pressable>
          {showEnd && (
            <DateTimePicker
              value={endDate}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(event, date) => {
                setShowEnd(false);
                if (date) setEndDate(date);
              }}
            />
          )}
        </View>
      </View>
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
  dateRow: {
    flexDirection: 'row',
    marginTop: 4,
    gap: 12,
  },
  dateBlock: {
    flex: 1,
  },
  dateLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
  },
  dateButton: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
  },
  dateButtonText: {
    fontSize: 13,
    color: '#111827',
    fontWeight: '500',
  },
});
