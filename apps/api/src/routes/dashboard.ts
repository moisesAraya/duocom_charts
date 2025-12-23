import { Router } from 'express';
import {
  fetchAnnualSales,
  filterByBranch,
  summarizeByPaymentMethod,
  summarizeByYear,
} from '../services/annualSales';

const router = Router();

const parseYears = (value: unknown): number => {
  const parsed = Number.parseInt(typeof value === 'string' ? value : '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 3;
};

router.get('/dashboard/resumen-anual-ventas', async (req, res, next) => {
  try {
    const years = parseYears(req.query.years ?? req.query.pCantAños);
    const branch = req.query.sucursal ? String(req.query.sucursal) : undefined;

    const sales = await fetchAnnualSales(years);
    const filtered = filterByBranch(sales, branch);
    const summary = summarizeByYear(filtered);

    res.json({ success: true, data: summary });
  } catch (error) {
    next(error);
  }
});

router.get('/dashboard/ventas-medio-pago', async (req, res, next) => {
  try {
    const years = parseYears(req.query.years ?? req.query.pCantAños);
    const branch = req.query.sucursal ? String(req.query.sucursal) : undefined;

    const sales = await fetchAnnualSales(years);
    const filtered = filterByBranch(sales, branch);
    const summary = summarizeByPaymentMethod(filtered);

    res.json({ success: true, data: summary });
  } catch (error) {
    next(error);
  }
});

export default router;
