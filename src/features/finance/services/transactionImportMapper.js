import {
  TRANSACTION_IMPORT_COLUMN_ALIASES,
  TRANSACTION_IMPORT_REQUIRED_COLUMNS,
} from '../constants/transactionImportColumns.js';

const TYPE_ALIASES = Object.freeze({
  ingreso: 'ingreso',
  ingresos: 'ingreso',
  income: 'ingreso',
  revenue: 'ingreso',
  entrada: 'ingreso',
  gasto: 'gasto',
  gastos: 'gasto',
  expense: 'gasto',
  expenses: 'gasto',
  egreso: 'gasto',
  salida: 'gasto',
});

function normalizeKey(value = '') {
  return String(value)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s_-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/^_+|_+$/g, '');
}

function getAliasedValue(record, canonicalColumn) {
  const entries = Object.entries(record || {}).map(([key, value]) => [normalizeKey(key), value]);
  const aliases = TRANSACTION_IMPORT_COLUMN_ALIASES[canonicalColumn] || [canonicalColumn];
  const normalizedAliases = aliases.map(normalizeKey);
  const match = entries.find(([key]) => normalizedAliases.includes(key));
  return match ? String(match[1] ?? '').trim() : '';
}

function parseAmount(value) {
  const rawValue = String(value ?? '').trim();
  if (!rawValue) return Number.NaN;

  const normalized = rawValue
    .replace(/[^\d,.-]/g, '')
    .replace(/,(?=\d{3}(\D|$))/g, '')
    .replace(',', '.');

  return Number.parseFloat(normalized);
}

function normalizeDate(value) {
  const rawValue = String(value ?? '').trim();
  if (!rawValue) return '';

  const isoMatch = rawValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return rawValue;

  const slashMatch = rawValue.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }

  const parsedDate = new Date(rawValue);
  if (!Number.isNaN(parsedDate.getTime())) return parsedDate.toISOString().slice(0, 10);

  return '';
}

function normalizeType(value) {
  return TYPE_ALIASES[normalizeKey(value)] || '';
}

export function getTransactionImportColumnErrors(record) {
  const presentColumns = new Set(Object.keys(record || {}).map(normalizeKey));

  return TRANSACTION_IMPORT_REQUIRED_COLUMNS
    .filter((column) => {
      const aliases = TRANSACTION_IMPORT_COLUMN_ALIASES[column] || [column];
      return aliases.every((alias) => !presentColumns.has(normalizeKey(alias)));
    })
    .map((column) => `Falta la columna requerida: ${column}`);
}

export function mapTransactionImportRecord({ record, rowNumber, companyId, userId, importId }) {
  const errors = getTransactionImportColumnErrors(record);
  const type = normalizeType(getAliasedValue(record, 'type'));
  const amount = parseAmount(getAliasedValue(record, 'amount'));
  const date = normalizeDate(getAliasedValue(record, 'date'));
  const category = getAliasedValue(record, 'category');
  const description = getAliasedValue(record, 'description');

  if (!companyId) errors.push('No hay empresa activa para importar esta fila.');
  if (!type) errors.push('Tipo inválido. Usa ingreso o gasto.');
  if (!Number.isFinite(amount) || amount <= 0) errors.push('Monto inválido. Debe ser mayor que cero.');
  if (!date) errors.push('Fecha inválida. Usa una fecha reconocible.');
  if (!category) errors.push('Categoría requerida.');

  const transaction = {
    companyId,
    type,
    amount: Number.isFinite(amount) ? amount : 0,
    date,
    category,
    description,
    source: 'spreadsheet_import',
    importId,
    status: 'active',
  };

  if (userId) transaction.createdBy = userId;

  return {
    rowNumber,
    ok: errors.length === 0,
    errors,
    record,
    transaction,
  };
}
