const CATEGORY_MAP = {
  ventas: 'ventas',
  servicios: 'servicios',
  inversiones: 'inversiones',
  otros_ingresos: 'otros_ingresos',
  nomina: 'nómina',
  renta: 'renta',
  servicios_profesionales: 'servicios_profesionales',
  materiales: 'materiales',
  marketing: 'marketing',
  impuestos: 'impuestos',
  seguros: 'seguros',
  mantenimiento: 'mantenimiento',
  tecnologia: 'tecnología',
  transporte: 'transporte',
  otros_gastos: 'otros_gastos',
};

const PAYMENT_MAP = {
  efectivo: 'efectivo',
  transferencia: 'transferencia',
  tarjeta_credito: 'tarjeta_credito',
  tarjeta_debito: 'tarjeta_debito',
  cheque: 'cheque',
};

function compact(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s-]+/g, '_');
}

export function parseCurrencyAmount(value) {
  const compactValue = String(value || '').trim().replace(/[$\s]/g, '');
  if (!compactValue) return Number.NaN;

  const normalized = compactValue.includes(',') && compactValue.includes('.')
    ? (compactValue.lastIndexOf(',') > compactValue.lastIndexOf('.')
      ? compactValue.replace(/\./g, '').replace(',', '.')
      : compactValue.replace(/,/g, ''))
    : compactValue.includes(',') && /^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(compactValue)
      ? compactValue.replace(/,/g, '')
      : compactValue.replace(',', '.');

  return Number(normalized);
}

export function normalizeTransactionDate(value, fallback = new Date()) {
  const source = String(value || '').trim();
  if (!source) return fallback.toISOString().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(source)) return source;

  const dayFirst = source.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dayFirst) {
    const [, day, month, year] = dayFirst;
    const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    if (parsed.getUTCFullYear() === Number(year) && parsed.getUTCMonth() === Number(month) - 1 && parsed.getUTCDate() === Number(day)) {
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
  }

  throw new Error(`Fecha inválida (${source}). Usa AAAA-MM-DD o DD/MM/AAAA.`);
}

function normalizeType(value) {
  const normalized = compact(value);
  if (['ingreso', 'ingresos', 'venta', 'ventas'].includes(normalized)) return 'ingreso';
  if (['gasto', 'gastos', 'egreso', 'egresos'].includes(normalized)) return 'gasto';
  throw new Error('tipo debe ser ingreso o gasto');
}

export function prepareTransactions(rows, { companyId, now = new Date() } = {}) {
  if (!companyId) throw new Error('Selecciona una empresa antes de importar transacciones.');
  const items = [];
  const errors = [];

  rows.forEach((row, index) => {
    try {
      const type = normalizeType(row.tipo);
      const amount = parseCurrencyAmount(row.monto);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error(`monto inválido (${row.monto || 'vacío'})`);

      const description = String(row.descripcion || '').trim();
      if (!description) throw new Error('descripcion es obligatoria');

      const rawCategory = compact(row.categoria);
      const rawPaymentMethod = compact(row.metodo_pago);
      items.push({
        companyId,
        type,
        amount: Number(amount.toFixed(2)),
        description: description.slice(0, 500),
        date: normalizeTransactionDate(row.fecha, now),
        category: CATEGORY_MAP[rawCategory] || (type === 'ingreso' ? 'ventas' : 'otros_gastos'),
        paymentMethod: PAYMENT_MAP[rawPaymentMethod] || 'transferencia',
        status: 'confirmed',
      });
    } catch (error) {
      errors.push(`Fila ${index + 2}: ${error.message}`);
    }
  });

  return { items, errors };
}
