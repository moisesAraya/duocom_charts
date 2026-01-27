import { api } from '@/constants/api';
import { ChartCard } from '@/components/dashboard/chart-card';
import { FilterRow, MonthYearFilter, buildYearOptions } from '@/components/dashboard/chart-filters';
import { FiltersPanel } from '@/components/dashboard/filters-panel';
import { ScreenShell } from '@/components/dashboard/screen-shell';
import { formatCompact, formatCurrency, formatDateInput, endOfMonth, startOfMonth, sparsifyLabels } from '@/components/dashboard/utils';
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

interface CuentaRow {
  cliente?: string;
  proveedor?: string;
  saldo: number;
}

interface MorosoRow {
  cliente: string;
  saldo: number;
  dias: number;
}

const truncateLabel = (value: string, max: number) =>
  value.length > max ? `${value.slice(0, max)}...` : value;

export default function FinanzasScreen() {
  const { width } = useWindowDimensions();
  const chartWidth = Math.max(280, width - 40);

  const [loadingCobrar, setLoadingCobrar] = useState(true);
  const [loadingPagar, setLoadingPagar] = useState(true);
  const [loadingMorosos, setLoadingMorosos] = useState(true);
  const [cuentasCobrar, setCuentasCobrar] = useState<CuentaRow[]>([]);
  const [cuentasPagar, setCuentasPagar] = useState<CuentaRow[]>([]);
  const [morosos, setMorosos] = useState<MorosoRow[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());

  const yearOptions = useMemo(() => buildYearOptions(8), []);
  const monthParams = useMemo(() => {
    const baseDate = new Date(selectedYear, selectedMonth, 1);
    return {
      desde: formatDateInput(startOfMonth(baseDate)),
      hasta: formatDateInput(endOfMonth(baseDate)),
    };
  }, [selectedMonth, selectedYear]);

  useEffect(() => {
    const loadCobrar = async () => {
      setLoadingCobrar(true);
      try {
        const response = await api.get('/api/dashboard/cuentas-cobrar', { params: monthParams });
        setCuentasCobrar(response.data?.data ?? []);
      } catch (error) {
        setCuentasCobrar([]);
      } finally {
        setLoadingCobrar(false);
      }
    };

    void loadCobrar();
  }, [monthParams]);

  useEffect(() => {
    const loadPagar = async () => {
      setLoadingPagar(true);
      try {
        const response = await api.get('/api/dashboard/cuentas-pagar', { params: monthParams });
        setCuentasPagar(response.data?.data ?? []);
      } catch (error) {
        setCuentasPagar([]);
      } finally {
        setLoadingPagar(false);
      }
    };

    void loadPagar();
  }, [monthParams]);

  useEffect(() => {
    const loadMorosos = async () => {
      setLoadingMorosos(true);
      try {
        const response = await api.get('/api/dashboard/clientes-morosos', { params: monthParams });
        setMorosos(response.data?.data ?? []);
      } catch (error) {
        setMorosos([]);
      } finally {
        setLoadingMorosos(false);
      }
    };

    void loadMorosos();
  }, [monthParams]);

  const cobrarLabels = useMemo(
    () => cuentasCobrar.slice(0, 10).map(item => item.cliente ?? 'Doc'),
    [cuentasCobrar]
  );
  const cobrarChart = useMemo(
    () => ({
      labels: sparsifyLabels(cobrarLabels.map(label => truncateLabel(label, 8)), 6),
      datasets: [{ data: cuentasCobrar.slice(0, 10).map(item => item.saldo ?? 0) }],
    }),
    [cuentasCobrar, cobrarLabels]
  );

  const pagarLabels = useMemo(
    () => cuentasPagar.slice(0, 10).map(item => item.proveedor ?? 'Prov'),
    [cuentasPagar]
  );
  const pagarChart = useMemo(
    () => ({
      labels: sparsifyLabels(pagarLabels.map(label => truncateLabel(label, 8)), 6),
      datasets: [{ data: cuentasPagar.slice(0, 10).map(item => item.saldo ?? 0) }],
    }),
    [cuentasPagar, pagarLabels]
  );

  const morososLabels = useMemo(
    () => morosos.slice(0, 10).map(item => item.cliente ?? 'Cliente'),
    [morosos]
  );
  const morososChart = useMemo(
    () => ({
      labels: sparsifyLabels(morososLabels.map(label => truncateLabel(label, 8)), 6),
      datasets: [{ data: morosos.slice(0, 10).map(item => item.saldo ?? 0) }],
    }),
    [morosos, morososLabels]
  );

  const totalCobrar = cuentasCobrar.reduce((acc, row) => acc + (row.saldo ?? 0), 0);
  const totalPagar = cuentasPagar.reduce((acc, row) => acc + (row.saldo ?? 0), 0);

  return (
    <ScreenShell title="Finanzas" subtitle="Cobros, pagos y riesgo">
      <>
        <FiltersPanel />
        
        <FilterRow title="Periodo financiero">
          <MonthYearFilter
            label="Mes"
            month={selectedMonth}
            year={selectedYear}
            years={yearOptions}
            onMonthChange={setSelectedMonth}
            onYearChange={setSelectedYear}
          />
        </FilterRow>

        <ChartCard
          title="Cuentas por cobrar"
          subtitle={`Total ${formatCurrency(totalCobrar)}`}
          data={cobrarChart}
          kind="bar"
          colorRgb="59, 130, 246"
          width={chartWidth}
          height={280}
          xLabel="Cliente"
          yLabel="Saldo"
          formatValue={formatCompact}
          formatDetailValue={formatCurrency}
          formatAxisValue={formatCompact}
          scrollable
          minWidth={Math.max(chartWidth, cobrarChart.labels.length * 44)}
          enterDelay={60}
          isLoading={loadingCobrar}
          isEmpty={!cuentasCobrar.length}
          emptyMessage="Sin cuentas por cobrar."
          detailLabels={cobrarLabels}
        />

        <ChartCard
          title="Cuentas por pagar"
          subtitle={`Total ${formatCurrency(totalPagar)}`}
          data={pagarChart}
          kind="bar"
          colorRgb="239, 68, 68"
          width={chartWidth}
          height={280}
          xLabel="Proveedor"
          yLabel="Saldo"
          formatValue={formatCompact}
          formatDetailValue={formatCurrency}
          formatAxisValue={formatCompact}
          scrollable
          minWidth={Math.max(chartWidth, pagarChart.labels.length * 44)}
          enterDelay={120}
          isLoading={loadingPagar}
          isEmpty={!cuentasPagar.length}
          emptyMessage="Sin cuentas por pagar."
          detailLabels={pagarLabels}
        />

        <ChartCard
          title="Clientes morosos"
          subtitle="Top saldo vencido"
          data={morososChart}
          kind="bar"
          colorRgb="245, 158, 11"
          width={chartWidth}
          height={280}
          xLabel="Cliente"
          yLabel="Saldo"
          formatValue={formatCompact}
          formatDetailValue={formatCurrency}
          formatAxisValue={formatCompact}
          scrollable
          minWidth={Math.max(chartWidth, morososChart.labels.length * 44)}
          enterDelay={180}
          isLoading={loadingMorosos}
          isEmpty={!morosos.length}
          emptyMessage="Sin morosidad detectada."
          detailLabels={morososLabels}
        />
      </>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
});
