/**
 * Paleta alineada con los selectores de sucursal: el índice en la lista
 * `sucursales` (orden de /api/sucursales) define el color.
 */

export const BRANCH_SERIES_RGB = [
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

export function branchRgbByListIndex(index: number): string {
  const n = BRANCH_SERIES_RGB.length;
  const i = ((index % n) + n) % n;
  return BRANCH_SERIES_RGB[i];
}

/** Cuando el nombre no está en la lista (p. ej. typo en datos). */
export function branchRgbHashFallback(label: string): string {
  if (!label.trim()) return BRANCH_SERIES_RGB[0];
  let hash = 0;
  for (let i = 0; i < label.length; i += 1) {
    hash = (hash * 31 + label.charCodeAt(i)) % 997;
  }
  return BRANCH_SERIES_RGB[hash % BRANCH_SERIES_RGB.length];
}

export type BranchLike = { id: string; nombre: string };

/**
 * Mismo criterio que el swatch del selector: posición en `sucursales` (orden alfabético por nombre).
 */
export function branchRgbForSucursalName(
  sucursales: BranchLike[],
  rowSucursalLabel: string,
): string {
  const t = rowSucursalLabel.trim().toLowerCase();
  const i = sucursales.findIndex((s) => s.nombre.trim().toLowerCase() === t);
  if (i >= 0) return branchRgbByListIndex(i);
  return branchRgbHashFallback(rowSucursalLabel);
}
