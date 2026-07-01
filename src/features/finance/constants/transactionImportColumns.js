export const TRANSACTION_IMPORT_REQUIRED_COLUMNS = Object.freeze(['type', 'amount', 'date', 'category']);

export const TRANSACTION_IMPORT_OPTIONAL_COLUMNS = Object.freeze(['description']);

export const TRANSACTION_IMPORT_COLUMN_ALIASES = Object.freeze({
  type: ['type', 'tipo', 'movimiento', 'transaction_type'],
  amount: ['amount', 'monto', 'importe', 'valor', 'total'],
  date: ['date', 'fecha', 'transaction_date', 'fecha_transaccion'],
  category: ['category', 'categoria', 'categoría', 'rubro'],
  description: ['description', 'descripcion', 'descripción', 'concepto', 'detalle', 'nota'],
});

export const TRANSACTION_IMPORT_ACCEPTED_FILE_TYPES = Object.freeze(['csv', 'xlsx']);
