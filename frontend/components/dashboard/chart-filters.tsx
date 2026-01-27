import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
import React, { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { formatDateDisplay } from './utils';

type RangeOption<T extends string> = { label: string; value: T };

interface DateFilterProps {
  label: string;
  value: Date;
  onChange: (date: Date) => void;
}

interface SegmentedFilterProps<T extends string> {
  label: string;
  value: T;
  options: RangeOption<T>[];
  onChange: (value: T) => void;
}

interface MonthYearFilterProps {
  label: string;
  month: number;
  year: number;
  years: number[];
  onMonthChange: (month: number) => void;
  onYearChange: (year: number) => void;
}

interface SelectFilterProps<T extends string | number> {
  label: string;
  value: T;
  options: { label: string; value: T }[];
  onChange: (value: T) => void;
}

const monthLabels = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

export const FilterRow = ({ title, children }: { title?: string; children: React.ReactNode }) => (
  <View style={styles.row}>
    {title ? <Text style={styles.title}>{title}</Text> : null}
    <View style={styles.controls}>{children}</View>
  </View>
);

export const DateFilter = ({ label, value, onChange }: DateFilterProps) => {
  const [show, setShow] = useState(false);
  const displayValue = useMemo(() => formatDateDisplay(value), [value]);

  const onSelect = (_event: DateTimePickerEvent, selected?: Date) => {
    setShow(Platform.OS === 'ios');
    if (selected) onChange(selected);
  };

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable onPress={() => setShow(true)} style={styles.input}>
        <Text style={styles.inputText}>{displayValue}</Text>
      </Pressable>
      {show ? (
        <DateTimePicker
          value={value}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'calendar'}
          onChange={onSelect}
        />
      ) : null}
    </View>
  );
};

export const SegmentedFilter = <T extends string>({
  label,
  value,
  options,
  onChange,
}: SegmentedFilterProps<T>) => (
  <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <View style={styles.segmentRow}>
      {options.map(option => {
        const isActive = option.value === value;
        return (
          <Pressable
            key={option.value}
            style={[styles.segment, isActive && styles.segmentActive]}
            onPress={() => onChange(option.value)}
          >
            <Text style={[styles.segmentText, isActive && styles.segmentTextActive]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  </View>
);

export const MonthYearFilter = ({
  label,
  month,
  year,
  years,
  onMonthChange,
  onYearChange,
}: MonthYearFilterProps) => (
  <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <View style={styles.pickerRow}>
      <View style={styles.pickerWrap}>
        <Picker
          selectedValue={month}
          onValueChange={(value: number) => onMonthChange(value)}
          style={styles.picker}
        >
          {monthLabels.map((item, index) => (
            <Picker.Item key={item} label={item} value={index} />
          ))}
        </Picker>
      </View>
      <View style={styles.pickerWrap}>
        <Picker
          selectedValue={year}
          onValueChange={(value: number) => onYearChange(value)}
          style={styles.picker}
        >
          {years.map(value => (
            <Picker.Item key={value} label={String(value)} value={value} />
          ))}
        </Picker>
      </View>
    </View>
  </View>
);

export const SelectFilter = <T extends string | number>({
  label,
  value,
  options,
  onChange,
}: SelectFilterProps<T>) => (
  <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <View style={styles.pickerWrap}>
      <Picker selectedValue={value} onValueChange={onChange} style={styles.picker}>
        {options.map(option => (
          <Picker.Item key={`${option.value}`} label={option.label} value={option.value} />
        ))}
      </Picker>
    </View>
  </View>
);

export const buildYearOptions = (span = 6): number[] => {
  const current = new Date().getFullYear();
  return Array.from({ length: span }, (_, index) => current - (span - 1) + index);
};

const styles = StyleSheet.create({
  row: {
    marginBottom: 12,
  },
  title: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
    marginBottom: 6,
  },
  controls: {
    gap: 8,
  },
  field: {
    marginBottom: 8,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4B5563',
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#F9FAFB',
  },
  inputText: {
    fontSize: 13,
    color: '#111827',
  },
  segmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  segment: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    marginRight: 6,
    marginBottom: 6,
    backgroundColor: '#F9FAFB',
  },
  segmentActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  segmentText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#111827',
  },
  segmentTextActive: {
    color: '#F9FAFB',
  },
  pickerRow: {
    flexDirection: 'row',
    gap: 8,
  },
  pickerWrap: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#F9FAFB',
  },
  picker: {
    height: 50,
  },
});
