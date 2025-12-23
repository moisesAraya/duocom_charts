import { api } from '@/constants/api';
import { Picker } from '@react-native-picker/picker';
import React, { useEffect, useState } from 'react';
import { Dimensions, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BarChart, LineChart } from 'react-native-chart-kit';

// Interfaces para diferentes tipos de datos
interface VentaHoraria {
  sucursal: string;
  hora: number;
  clientes: number;
}

interface VentaMensual {
  mes: string;
  ventas: number;
  sucursal?: string;
}

interface StockSucursal {
  sucursal: string;
  producto: string;
  stock: number;
  minimo: number;
}

interface RotacionProducto {
  producto: string;
  rotacion: number;
  sucursal?: string;
}

interface DocumentoCobrar {
  cliente: string;
  monto: number;
  vencimiento: string;
  sucursal?: string;
}

interface DocumentoPagar {
  proveedor: string;
  monto: number;
  vencimiento: string;
  sucursal?: string;
}

interface VentasMedioPago {
  medio_pago: string;
  monto: number;
}

interface ResumenAnualVentas {
  anio: number;
  ventas: number;
  sucursal?: string;
}

interface ClientesMorosos {
  cliente: string;
  deuda: number;
  dias_moroso: number;
}

interface RentabilidadProductos {
  producto: string;
  rentabilidad: number;
}

interface ProyeccionVentasMes {
  dia: number;
  proyeccion: number;
  sucursal?: string;
}

interface Sucursal {
  ID: number;
  NOMBRE: string;
}

type ChartType = 'ventas_horarias' | 'ventas_mensuales' | 'stock_sucursal' | 'rotacion_productos' | 'documentos_cobrar' | 'documentos_pagar' | 'ventas_medio_pago' | 'resumen_anual_ventas' | 'clientes_morosos' | 'rentabilidad_productos' | 'proyeccion_ventas_mes';

export default function DashboardScreen() {
  // Estados para diferentes tipos de datos
  const [ventasHorarias, setVentasHorarias] = useState<VentaHoraria[]>([]);
  const [ventasMensuales, setVentasMensuales] = useState<VentaMensual[]>([]);
  const [stockSucursal, setStockSucursal] = useState<StockSucursal[]>([]);
  const [rotacionProductos, setRotacionProductos] = useState<RotacionProducto[]>([]);
  const [documentosCobrar, setDocumentosCobrar] = useState<DocumentoCobrar[]>([]);
  const [documentosPagar, setDocumentosPagar] = useState<DocumentoPagar[]>([]);
  const [ventasMedioPago, setVentasMedioPago] = useState<VentasMedioPago[]>([]);
  const [resumenAnualVentas, setResumenAnualVentas] = useState<ResumenAnualVentas[]>([]);
  const [clientesMorosos, setClientesMorosos] = useState<ClientesMorosos[]>([]);
  const [rentabilidadProductos, setRentabilidadProductos] = useState<RentabilidadProductos[]>([]);
  const [proyeccionVentasMes, setProyeccionVentasMes] = useState<ProyeccionVentasMes[]>([]);

  // Estados comunes
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [sucursalSeleccionada, setSucursalSeleccionada] = useState<string>('todas');
  const [chartType, setChartType] = useState<ChartType>('ventas_horarias');
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [detalleSeleccionado, setDetalleSeleccionado] = useState<any>(null);

  useEffect(() => {
    fetchSucursales();
    fetchData();
  }, [sucursalSeleccionada, chartType]);

  const fetchSucursales = async () => {
    try {
      const response = await api.get('/api/sucursales');
      if (response.data.success) {
        setSucursales(response.data.data.filter((s: any) => s && s.ID && s.NOMBRE));
      }
    } catch (error) {
      console.error('Error fetching sucursales:', error);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const params: any = {};

      if (sucursalSeleccionada !== 'todas') {
        const sucursal = sucursales.find(s => s.NOMBRE === sucursalSeleccionada);
        if (sucursal) {
          params.sucursal = sucursal.ID;
        }
      }

      switch (chartType) {
        case 'ventas_horarias':
          params.meses = 3;
          const responseHorarias = await api.get('/api/dashboard/clientes-hora', { params });
          if (responseHorarias.data.success) {
            setVentasHorarias(responseHorarias.data.data);
          }
          break;

        case 'ventas_mensuales':
          const responseMensuales = await api.get('/api/dashboard/resumen-mensual-ventas', { params });
          if (responseMensuales.data.success) {
            setVentasMensuales(responseMensuales.data.data);
          }
          break;

        case 'stock_sucursal':
          const responseStock = await api.get('/api/dashboard/inventario-valorizado', { params });
          if (responseStock.data.success) {
            setStockSucursal(responseStock.data.data);
          }
          break;

        case 'rotacion_productos':
          const responseRotacion = await api.get('/api/dashboard/productos-rotacion', { params });
          if (responseRotacion.data.success) {
            setRotacionProductos(responseRotacion.data.data);
          }
          break;

        case 'documentos_cobrar':
          const responseCobrar = await api.get('/api/dashboard/cuentas-cobrar', { params });
          if (responseCobrar.data.success) {
            setDocumentosCobrar(responseCobrar.data.data);
          }
          break;

        case 'documentos_pagar':
          const responsePagar = await api.get('/api/dashboard/cuentas-pagar', { params });
          if (responsePagar.data.success) {
            setDocumentosPagar(responsePagar.data.data);
          }
          break;

        case 'ventas_medio_pago':
          const responseMedioPago = await api.get('/api/dashboard/ventas-medio-pago', { params });
          if (responseMedioPago.data.success) {
            setVentasMedioPago(responseMedioPago.data.data);
          }
          break;

        case 'resumen_anual_ventas':
          const responseAnual = await api.get('/api/dashboard/resumen-anual-ventas', { params });
          if (responseAnual.data.success) {
            setResumenAnualVentas(responseAnual.data.data);
          }
          break;

        case 'clientes_morosos':
          const responseMorosos = await api.get('/api/dashboard/clientes-morosos', { params });
          if (responseMorosos.data.success) {
            setClientesMorosos(responseMorosos.data.data);
          }
          break;

        case 'rentabilidad_productos':
          const responseRentabilidad = await api.get('/api/dashboard/rentabilidad-productos', { params });
          if (responseRentabilidad.data.success) {
            setRentabilidadProductos(responseRentabilidad.data.data);
          }
          break;

        case 'proyeccion_ventas_mes':
          const responseProyeccion = await api.get('/api/dashboard/proyeccion-ventas-mes', { params });
          if (responseProyeccion.data.success) {
            setProyeccionVentasMes(responseProyeccion.data.data);
          }
          break;
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChartPress = (data: any) => {
    // Implementar drill-down según el tipo de gráfico
    setDetalleSeleccionado(data);
    setModalVisible(true);
  };

  const renderChart = () => {
    const screenWidth = Dimensions.get('window').width;

    switch (chartType) {
      case 'ventas_horarias':
        return renderVentasHorariasChart(screenWidth);

      case 'ventas_mensuales':
        return renderVentasMensualesChart(screenWidth);

      case 'stock_sucursal':
        return renderStockSucursalChart(screenWidth);

      case 'rotacion_productos':
        return renderRotacionProductosChart(screenWidth);

      case 'documentos_cobrar':
        return renderDocumentosCobrarChart(screenWidth);

      case 'documentos_pagar':
        return renderDocumentosPagarChart(screenWidth);

      case 'ventas_medio_pago':
        return renderVentasMedioPagoChart(screenWidth);

      case 'resumen_anual_ventas':
        return renderResumenAnualVentasChart(screenWidth);

      case 'clientes_morosos':
        return renderClientesMorososChart(screenWidth);

      case 'rentabilidad_productos':
        return renderRentabilidadProductosChart(screenWidth);

      case 'proyeccion_ventas_mes':
        return renderProyeccionVentasMesChart(screenWidth);

      default:
        return <Text>Selecciona un tipo de gráfico</Text>;
    }
  };

  const renderVentasHorariasChart = (screenWidth: number) => {
    const datosPorSucursal = ventasHorarias?.reduce((acc, venta) => {
      if (!acc[venta.sucursal]) {
        acc[venta.sucursal] = [];
      }
      acc[venta.sucursal].push(venta);
      return acc;
    }, {} as Record<string, VentaHoraria[]>) || {};

    const sucursalesParaMostrar = sucursalSeleccionada === 'todas' ? Object.keys(datosPorSucursal) : [sucursalSeleccionada];

    const chartData = {
      labels: Array.from({length: 24}, (_, i) => i.toString()),
      datasets: sucursalesParaMostrar.map(suc => ({
        data: Array.from({length: 24}, (_, i) => {
          const horaData = datosPorSucursal[suc]?.find(v => v.hora === i);
          return horaData?.clientes || 0;
        }),
        color: (opacity = 1) => {
          const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7'];
          const colorIndex = sucursalesParaMostrar.indexOf(suc) % colors.length;
          return colors[colorIndex] + Math.floor(opacity * 255).toString(16).padStart(2, '0');
        },
        strokeWidth: 3,
      })),
      legend: sucursalesParaMostrar.map(suc => suc),
    };

    const chartConfig = {
      backgroundColor: '#ffffff',
      backgroundGradientFrom: '#ffffff',
      backgroundGradientTo: '#ffffff',
      decimalPlaces: 0,
      color: (opacity = 1) => `rgba(0, 122, 255, ${opacity})`,
      labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
      style: { borderRadius: 16 },
      propsForLabels: { fontSize: 10, rotation: 90 },
    };

    return (
      <View>
        <Text style={styles.chartTitle}>Clientes por Hora</Text>
        {chartData.datasets[0]?.data.length > 0 ? (
          <LineChart
            data={chartData}
            width={screenWidth - 40}
            height={350}
            chartConfig={chartConfig}
            style={styles.chart}
            onDataPointClick={handleChartPress}
            bezier
          />
        ) : (
          <Text style={styles.noDataText}>No hay datos disponibles</Text>
        )}
      </View>
    );
  };

  const renderVentasMensualesChart = (screenWidth: number) => {
    const chartData = {
      labels: ventasMensuales.map(v => v.mes?.substring(0, 3) || 'N/A'),
      datasets: [{
        data: ventasMensuales.map(v => v.ventas || 0),
      }],
    };

    const chartConfig = {
      backgroundColor: '#ffffff',
      backgroundGradientFrom: '#ffffff',
      backgroundGradientTo: '#ffffff',
      decimalPlaces: 0,
      color: (opacity = 1) => `rgba(34, 197, 94, ${opacity})`,
      labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
      style: { borderRadius: 16 },
      propsForLabels: { fontSize: 12 },
    };

    return (
      <View>
        <Text style={styles.chartTitle}>Resumen Mensual de Ventas</Text>
        {chartData.datasets[0]?.data.length > 0 ? (
          <BarChart
            data={chartData}
            width={screenWidth - 40}
            height={350}
            chartConfig={chartConfig}
            style={styles.chart}
            yAxisLabel=""
            yAxisSuffix=""
            showValuesOnTopOfBars
          />
        ) : (
          <Text style={styles.noDataText}>No hay datos disponibles</Text>
        )}
      </View>
    );
  };

  const renderStockSucursalChart = (screenWidth: number) => {
    const productosPrincipales = stockSucursal
      .sort((a, b) => b.stock - a.stock)
      .slice(0, 10);

    const chartData = {
      labels: productosPrincipales.map(p => (p.producto?.substring(0, 10) || 'N/A') + '...'),
      datasets: [{
        data: productosPrincipales.map(p => p.stock || 0),
      }],
    };

    const chartConfig = {
      backgroundColor: '#ffffff',
      backgroundGradientFrom: '#ffffff',
      backgroundGradientTo: '#ffffff',
      decimalPlaces: 0,
      color: (opacity = 1) => `rgba(255, 193, 7, ${opacity})`,
      labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
      style: { borderRadius: 16 },
      propsForLabels: { fontSize: 10, rotation: 45 },
    };

    return (
      <View>
        <Text style={styles.chartTitle}>Inventario Valorizado</Text>
        {chartData.datasets[0]?.data.length > 0 ? (
          <BarChart
            data={chartData}
            width={screenWidth - 40}
            height={350}
            chartConfig={chartConfig}
            style={styles.chart}
            yAxisLabel=""
            yAxisSuffix=""
            showValuesOnTopOfBars
          />
        ) : (
          <Text style={styles.noDataText}>No hay datos disponibles</Text>
        )}
      </View>
    );
  };

  const renderRotacionProductosChart = (screenWidth: number) => {
    const productosRotacion = rotacionProductos
      .sort((a, b) => b.rotacion - a.rotacion)
      .slice(0, 10);

    const chartData = {
      labels: productosRotacion.map(p => (p.producto?.substring(0, 10) || 'N/A') + '...'),
      datasets: [{
        data: productosRotacion.map(p => p.rotacion || 0),
      }],
    };

    const chartConfig = {
      backgroundColor: '#ffffff',
      backgroundGradientFrom: '#ffffff',
      backgroundGradientTo: '#ffffff',
      decimalPlaces: 2,
      color: (opacity = 1) => `rgba(220, 53, 69, ${opacity})`,
      labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
      style: { borderRadius: 16 },
      propsForLabels: { fontSize: 10, rotation: 45 },
    };

    return (
      <View>
        <Text style={styles.chartTitle}>Ranking de Productos por Rotación</Text>
        {chartData.datasets[0]?.data.length > 0 ? (
          <BarChart
            data={chartData}
            width={screenWidth - 40}
            height={350}
            chartConfig={chartConfig}
            style={styles.chart}
            yAxisLabel=""
            yAxisSuffix=""
            showValuesOnTopOfBars
          />
        ) : (
          <Text style={styles.noDataText}>No hay datos disponibles</Text>
        )}
      </View>
    );
  };

  const renderDocumentosCobrarChart = (screenWidth: number) => {
    const clientesPrincipales = documentosCobrar
      .sort((a, b) => b.monto - a.monto)
      .slice(0, 8);

    const chartData = {
      labels: clientesPrincipales.map(c => (c.cliente?.substring(0, 8) || 'N/A') + '...'),
      datasets: [{
        data: clientesPrincipales.map(c => c.monto || 0),
      }],
    };

    const chartConfig = {
      backgroundColor: '#ffffff',
      backgroundGradientFrom: '#ffffff',
      backgroundGradientTo: '#ffffff',
      decimalPlaces: 0,
      color: (opacity = 1) => `rgba(255, 193, 7, ${opacity})`,
      labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
      style: { borderRadius: 16 },
      propsForLabels: { fontSize: 10, rotation: 45 },
    };

    return (
      <View>
        <Text style={styles.chartTitle}>Cuentas por Cobrar</Text>
        {chartData.datasets[0]?.data.length > 0 ? (
          <BarChart
            data={chartData}
            width={screenWidth - 40}
            height={350}
            chartConfig={chartConfig}
            style={styles.chart}
            yAxisLabel=""
            yAxisSuffix=""
            showValuesOnTopOfBars
          />
        ) : (
          <Text style={styles.noDataText}>No hay datos disponibles</Text>
        )}
      </View>
    );
  };

  const renderDocumentosPagarChart = (screenWidth: number) => {
    const proveedoresPrincipales = documentosPagar
      .sort((a, b) => b.monto - a.monto)
      .slice(0, 8);

    const chartData = {
      labels: proveedoresPrincipales.map(p => (p.proveedor?.substring(0, 8) || 'N/A') + '...'),
      datasets: [{
        data: proveedoresPrincipales.map(p => p.monto || 0),
      }],
    };

    const chartConfig = {
      backgroundColor: '#ffffff',
      backgroundGradientFrom: '#ffffff',
      backgroundGradientTo: '#ffffff',
      decimalPlaces: 0,
      color: (opacity = 1) => `rgba(220, 53, 69, ${opacity})`,
      labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
      style: { borderRadius: 16 },
      propsForLabels: { fontSize: 10, rotation: 45 },
    };

    return (
      <View>
        <Text style={styles.chartTitle}>Cuentas por Pagar</Text>
        {chartData.datasets[0]?.data.length > 0 ? (
          <BarChart
            data={chartData}
            width={screenWidth - 40}
            height={350}
            chartConfig={chartConfig}
            style={styles.chart}
            yAxisLabel=""
            yAxisSuffix=""
            showValuesOnTopOfBars
          />
        ) : (
          <Text style={styles.noDataText}>No hay datos disponibles</Text>
        )}
      </View>
    );
  };

  const renderVentasMedioPagoChart = (screenWidth: number) => {
    const chartData = {
      labels: ventasMedioPago.map(v => v.medio_pago?.substring(0, 10) || 'N/A'),
      datasets: [{
        data: ventasMedioPago.map(v => v.monto || 0),
      }],
    };

    const chartConfig = {
      backgroundColor: '#ffffff',
      backgroundGradientFrom: '#ffffff',
      backgroundGradientTo: '#ffffff',
      decimalPlaces: 0,
      color: (opacity = 1) => `rgba(40, 167, 69, ${opacity})`,
      labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
      style: { borderRadius: 16 },
      propsForLabels: { fontSize: 10, rotation: 45 },
    };

    return (
      <View>
        <Text style={styles.chartTitle}>Ventas por Medio de Pago</Text>
        {chartData.datasets[0]?.data.length > 0 ? (
          <BarChart
            data={chartData}
            width={screenWidth - 40}
            height={350}
            chartConfig={chartConfig}
            style={styles.chart}
            yAxisLabel=""
            yAxisSuffix=""
            showValuesOnTopOfBars
          />
        ) : (
          <Text style={styles.noDataText}>No hay datos disponibles</Text>
        )}
      </View>
    );
  };

  const renderResumenAnualVentasChart = (screenWidth: number) => {
    const datosPorSucursal = resumenAnualVentas?.reduce((acc, venta) => {
      if (!acc[venta.sucursal || 'Todas']) {
        acc[venta.sucursal || 'Todas'] = [];
      }
      acc[venta.sucursal || 'Todas'].push(venta);
      return acc;
    }, {} as Record<string, ResumenAnualVentas[]>) || {};

    const sucursalesParaMostrar = sucursalSeleccionada === 'todas' ? Object.keys(datosPorSucursal) : [sucursalSeleccionada];

    const chartData = {
      labels: Array.from({length: 12}, (_, i) => (i + 1).toString()),
      datasets: sucursalesParaMostrar.map(suc => ({
        data: Array.from({length: 12}, (_, i) => {
          const mesData = datosPorSucursal[suc]?.find(v => v.anio === new Date().getFullYear() && (i + 1) === 1); // Simplified
          return mesData?.ventas || 0;
        }),
      })),
    };

    const chartConfig = {
      backgroundColor: '#ffffff',
      backgroundGradientFrom: '#ffffff',
      backgroundGradientTo: '#ffffff',
      decimalPlaces: 0,
      color: (opacity = 1) => `rgba(23, 162, 184, ${opacity})`,
      labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
      style: { borderRadius: 16 },
      propsForLabels: { fontSize: 10 },
    };

    return (
      <View>
        <Text style={styles.chartTitle}>Resumen Anual de Ventas</Text>
        {chartData.datasets[0]?.data.length > 0 ? (
          <LineChart
            data={chartData}
            width={screenWidth - 40}
            height={350}
            chartConfig={chartConfig}
            style={styles.chart}
          />
        ) : (
          <Text style={styles.noDataText}>No hay datos disponibles</Text>
        )}
      </View>
    );
  };

  const renderClientesMorososChart = (screenWidth: number) => {
    const clientesPrincipales = clientesMorosos
      .sort((a, b) => b.deuda - a.deuda)
      .slice(0, 8);

    const chartData = {
      labels: clientesPrincipales.map(c => (c.cliente?.substring(0, 8) || 'N/A') + '...'),
      datasets: [{
        data: clientesPrincipales.map(c => c.deuda || 0),
      }],
    };

    const chartConfig = {
      backgroundColor: '#ffffff',
      backgroundGradientFrom: '#ffffff',
      backgroundGradientTo: '#ffffff',
      decimalPlaces: 0,
      color: (opacity = 1) => `rgba(255, 193, 7, ${opacity})`,
      labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
      style: { borderRadius: 16 },
      propsForLabels: { fontSize: 10, rotation: 45 },
    };

    return (
      <View>
        <Text style={styles.chartTitle}>Clientes Morosos</Text>
        {chartData.datasets[0]?.data.length > 0 ? (
          <BarChart
            data={chartData}
            width={screenWidth - 40}
            height={350}
            chartConfig={chartConfig}
            style={styles.chart}
            yAxisLabel=""
            yAxisSuffix=""
            showValuesOnTopOfBars
          />
        ) : (
          <Text style={styles.noDataText}>No hay datos disponibles</Text>
        )}
      </View>
    );
  };

  const renderRentabilidadProductosChart = (screenWidth: number) => {
    const productosRentables = rentabilidadProductos
      .sort((a, b) => b.rentabilidad - a.rentabilidad)
      .slice(0, 10);

    const chartData = {
      labels: productosRentables.map(p => (p.producto?.substring(0, 10) || 'N/A') + '...'),
      datasets: [{
        data: productosRentables.map(p => p.rentabilidad || 0),
      }],
    };

    const chartConfig = {
      backgroundColor: '#ffffff',
      backgroundGradientFrom: '#ffffff',
      backgroundGradientTo: '#ffffff',
      decimalPlaces: 2,
      color: (opacity = 1) => `rgba(255, 193, 7, ${opacity})`,
      labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
      style: { borderRadius: 16 },
      propsForLabels: { fontSize: 10, rotation: 45 },
    };

    return (
      <View>
        <Text style={styles.chartTitle}>Rentabilidad de Productos</Text>
        {chartData.datasets[0]?.data.length > 0 ? (
          <BarChart
            data={chartData}
            width={screenWidth - 40}
            height={350}
            chartConfig={chartConfig}
            style={styles.chart}
            yAxisLabel=""
            yAxisSuffix=""
            showValuesOnTopOfBars
          />
        ) : (
          <Text style={styles.noDataText}>No hay datos disponibles</Text>
        )}
      </View>
    );
  };

  const renderProyeccionVentasMesChart = (screenWidth: number) => {
    const chartData = {
      labels: proyeccionVentasMes.map(p => (p.dia || 0).toString()),
      datasets: [{
        data: proyeccionVentasMes.map(p => p.proyeccion || 0),
      }],
    };

    const chartConfig = {
      backgroundColor: '#ffffff',
      backgroundGradientFrom: '#ffffff',
      backgroundGradientTo: '#ffffff',
      decimalPlaces: 0,
      color: (opacity = 1) => `rgba(108, 117, 125, ${opacity})`,
      labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
      style: { borderRadius: 16 },
      propsForLabels: { fontSize: 10 },
    };

    return (
      <View>
        <Text style={styles.chartTitle}>Proyección de Ventas del Mes</Text>
        {chartData.datasets[0]?.data.length > 0 ? (
          <LineChart
            data={chartData}
            width={screenWidth - 40}
            height={350}
            chartConfig={chartConfig}
            style={styles.chart}
          />
        ) : (
          <Text style={styles.noDataText}>No hay datos disponibles</Text>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <Text>Cargando...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Dashboard</Text>

      {/* Selector de tipo de gráfico */}
      <View style={styles.filterContainer}>
        <Text style={styles.filterLabel}>Tipo de Gráfico:</Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={chartType}
            onValueChange={(itemValue: ChartType) => setChartType(itemValue)}
            style={styles.picker}
          >
            <Picker.Item label="Clientes por Hora" value="ventas_horarias" />
            <Picker.Item label="Resumen Mensual de Ventas" value="ventas_mensuales" />
            <Picker.Item label="Inventario Valorizado" value="stock_sucursal" />
            <Picker.Item label="Ranking de Productos por Rotación" value="rotacion_productos" />
            <Picker.Item label="Cuentas por Cobrar" value="documentos_cobrar" />
            <Picker.Item label="Cuentas por Pagar" value="documentos_pagar" />
            <Picker.Item label="Ventas por Medio de Pago" value="ventas_medio_pago" />
            <Picker.Item label="Resumen Anual de Ventas" value="resumen_anual_ventas" />
            <Picker.Item label="Clientes Morosos" value="clientes_morosos" />
            <Picker.Item label="Rentabilidad de Productos" value="rentabilidad_productos" />
            <Picker.Item label="Proyección de Ventas del Mes" value="proyeccion_ventas_mes" />
          </Picker>
        </View>
      </View>

      {/* Filtro por sucursal */}
      <View style={styles.filterContainer}>
        <Text style={styles.filterLabel}>Filtrar por Sucursal:</Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={sucursalSeleccionada}
            onValueChange={(itemValue) => setSucursalSeleccionada(itemValue)}
            style={styles.picker}
          >
            <Picker.Item label="Todas las sucursales" value="todas" />
            {sucursales.map((sucursal) => (
              <Picker.Item
                key={sucursal.ID}
                label={sucursal.NOMBRE}
                value={sucursal.ID.toString()}
              />
            ))}
          </Picker>
        </View>
      </View>

      {/* Renderizar gráfico según el tipo seleccionado */}
      {renderChart()}

      {/* Modal de detalle */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Detalle</Text>
            {detalleSeleccionado && (
              <View>
                <Text style={styles.modalText}>{JSON.stringify(detalleSeleccionado, null, 2)}</Text>
              </View>
            )}
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setModalVisible(false)}
            >
              <Text style={styles.closeButtonText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#ffffff',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
  },
  filterContainer: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    marginBottom: 20,
  },
  filterLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
  },
  picker: {
    height: 50,
  },
  chartTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 20,
    marginBottom: 10,
  },
  chart: {
    borderRadius: 16,
    marginBottom: 20,
  },
  noDataText: {
    textAlign: 'center',
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
    fontStyle: 'italic',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 10,
    width: '80%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  modalText: {
    fontSize: 16,
    marginBottom: 10,
  },
  closeButton: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 15,
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',  },
});