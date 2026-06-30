export const DOCUMENT_TYPES = Object.freeze({
  INVOICE: 'factura',
  CREDIT_NOTE: 'nota_credito',
  RECEIPT: 'recibo',
  CONTRACT: 'contrato',
  BANK_STATEMENT: 'estado_cuenta',
  TAX_RETURN: 'declaración',
  PAYROLL: 'nómina',
  OTHER: 'otro',
});

export const DOCUMENT_TYPE_OPTIONS = Object.values(DOCUMENT_TYPES);
