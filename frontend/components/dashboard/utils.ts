export const formatDateInput = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const formatDateDisplay = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${day}-${month}-${year}`;
};

export const parseDateInput = (value: string): Date | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const candidate = new Date(`${trimmed}T00:00:00`);
  return Number.isNaN(candidate.getTime()) ? null : candidate;
};

export const formatCurrency = (value: number): string =>
  new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(value);

export const formatNumberExact = (value: number): string =>
  new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(value);

export const formatCompact = (value: number): string => {
  if (!Number.isFinite(value)) {
    return '0';
  }
  if (Math.abs(value) >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(1)}B`;
  }
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(0)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return value.toFixed(0);
};

export const addDays = (date: Date, days: number): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

export const startOfMonth = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), 1);

export const endOfMonth = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth() + 1, 0);

export const startOfWeek = (date: Date): Date => {
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(date, diff);
};

export const sparsifyLabels = (labels: string[], maxLabels: number): string[] => {
  if (labels.length <= maxLabels) return labels;
  const step = Math.ceil(labels.length / maxLabels);
  return labels.map((label, index) => (index % step === 0 ? label : ''));
};
