// Datos de demostración para modo sin backend

export const DEMO_MODE = true; // Cambiar a false para conectar al backend real

interface MockDataRow {
  fecha: string;
  sucursal: string;
  total: number;
}

interface MockAnualRow {
  mes: number;
  sucursal: string;
  total: number;
}

// Generar datos de ejemplo para gráficos
const generateMockData = (): MockDataRow[] => {
  const today = new Date();
  const data: MockDataRow[] = [];
  
  for (let i = 14; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    data.push({
      fecha: date.toISOString().split('T')[0],
      sucursal: 'Casa Matriz',
      total: Math.floor(Math.random() * 5000000) + 1000000,
    });
  }
  
  return data;
};

const generateMockAnualData = (): MockAnualRow[] => {
  const data: MockAnualRow[] = [];
  const sucursales = ['Casa Matriz', 'Sucursal 1', 'Sucursal 2'];
  
  for (let mes = 1; mes <= 12; mes++) {
    sucursales.forEach(sucursal => {
      data.push({
        mes,
        sucursal,
        total: Math.floor(Math.random() * 50000000) + 10000000,
      });
    });
  }
  
  return data;
};

export const mockApiResponses: Record<string, any> = {
  '/api/dashboard/resumen-mensual-ventas': {
    success: true,
    data: generateMockData(),
  },
  '/api/dashboard/resumen-anual-ventas': {
    success: true,
    data: generateMockAnualData(),
  },
  '/api/dashboard/ventas-por-minuto': {
    success: true,
    data: Array.from({ length: 24 }, (_, i) => ({
      hora: i,
      total: Math.floor(Math.random() * 2000000) + 100000,
    })),
  },
  '/api/dashboard/ventas-diarias-brutas': {
    success: true,
    data: generateMockData(),
  },
  '/api/dashboard/ventas-diarias-netas': {
    success: true,
    data: generateMockData(),
  },
  '/api/dashboard/top-clientes': {
    success: true,
    data: Array.from({ length: 10 }, (_, i) => ({
      cliente: `Cliente ${i + 1}`,
      total: Math.floor(Math.random() * 10000000) + 500000,
    })),
  },
  '/api/dashboard/top-productos': {
    success: true,
    data: Array.from({ length: 10 }, (_, i) => ({
      producto: `Producto ${i + 1}`,
      cantidad: Math.floor(Math.random() * 1000) + 50,
      total: Math.floor(Math.random() * 5000000) + 100000,
    })),
  },
  '/api/dashboard/inventario-bajo-stock': {
    success: true,
    data: Array.from({ length: 5 }, (_, i) => ({
      codigo: `PROD${100 + i}`,
      descripcion: `Producto de ejemplo ${i + 1}`,
      stock: Math.floor(Math.random() * 10),
      stockMinimo: 20,
      precio: Math.floor(Math.random() * 50000) + 10000,
    })),
  },
  '/api/dashboard/inventario-valorizado': {
    success: true,
    data: {
      total: 150000000,
      items: 1250,
    },
  },
  '/api/sucursales': {
    success: true,
    data: [
      { id: 1, nombre: 'Casa Matriz' },
      { id: 2, nombre: 'Sucursal 1' },
      { id: 3, nombre: 'Sucursal 2' },
    ],
  },
};

export const getMockResponse = (url: string): any => {
  // Buscar coincidencia parcial de URL
  const mockKey = Object.keys(mockApiResponses).find(key => url.includes(key));
  if (mockKey) {
    return mockApiResponses[mockKey];
  }
  
  // Respuesta por defecto
  return {
    success: true,
    data: [],
  };
};
