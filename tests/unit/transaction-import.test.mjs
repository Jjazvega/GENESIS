import assert from 'node:assert/strict';
import test from 'node:test';
import { mapTransactionImportRecord, getTransactionImportColumnErrors } from '../../src/features/finance/services/transactionImportMapper.js';
import { createTransactionsFromImport } from '../../src/features/finance/services/transactionImport.js';

test('mapTransactionImportRecord valida columnas y convierte una fila a Transaction', () => {
  const mapped = mapTransactionImportRecord({
    record: {
      Tipo: 'Ingreso',
      Monto: '$1,250.50',
      Fecha: '2026-06-30',
      Categoria: 'Ventas',
      Descripcion: 'Factura 100',
    },
    rowNumber: 2,
    companyId: 'company-1',
    userId: 'user-1',
  });

  assert.equal(mapped.ok, true);
  assert.deepEqual(mapped.errors, []);
  assert.deepEqual(mapped.transaction, {
    companyId: 'company-1',
    type: 'ingreso',
    amount: 1250.5,
    date: '2026-06-30',
    category: 'Ventas',
    description: 'Factura 100',
    source: 'spreadsheet_import',
    importId: undefined,
    status: 'active',
    createdBy: 'user-1',
  });
});

test('mapTransactionImportRecord reporta errores por fila sin tocar Documentos', () => {
  const missingColumns = getTransactionImportColumnErrors({ tipo: 'gasto', monto: '10' });
  assert.deepEqual(missingColumns, [
    'Falta la columna requerida: date',
    'Falta la columna requerida: category',
  ]);

  const mapped = mapTransactionImportRecord({
    record: { tipo: 'otro', monto: '-10', fecha: 'no-fecha', categoria: '' },
    rowNumber: 3,
    companyId: 'company-1',
  });

  assert.equal(mapped.ok, false);
  assert.match(mapped.errors.join(' '), /Tipo inválido/);
  assert.match(mapped.errors.join(' '), /Monto inválido/);
  assert.match(mapped.errors.join(' '), /Fecha inválida/);
  assert.match(mapped.errors.join(' '), /Categoría requerida/);
});

test('createTransactionsFromImport guarda transacciones válidas y crea importLogs', async () => {
  const createdTransactions = [];
  const createdLogs = [];
  const repositories = {
    transactions: {
      bulkCreate: async (items) => {
        createdTransactions.push(...items);
        return items.map((item, index) => ({ id: `tx-${index + 1}`, ...item }));
      },
    },
    importLogs: {
      create: async (payload) => {
        createdLogs.push(payload);
        return { id: `log-${createdLogs.length}`, ...payload };
      },
    },
  };

  const rows = [
    mapTransactionImportRecord({
      record: { tipo: 'gasto', monto: '99.95', fecha: '01/06/2026', categoria: 'Operación' },
      rowNumber: 2,
      companyId: 'company-1',
      userId: 'user-1',
    }),
    mapTransactionImportRecord({
      record: { tipo: 'gasto', monto: '', fecha: '01/06/2026', categoria: 'Operación' },
      rowNumber: 3,
      companyId: 'company-1',
    }),
  ];

  const result = await createTransactionsFromImport({
    companyId: 'company-1',
    transactions: rows,
    correlationId: 'corr-1',
    fileName: 'movimientos.csv',
    repositories,
  });

  assert.equal(result.importedRows, 1);
  assert.equal(result.rejectedRows, 1);
  assert.equal(createdTransactions.length, 1);
  assert.equal(createdTransactions[0].companyId, 'company-1');
  assert.equal(createdTransactions[0].source, 'spreadsheet_import');
  assert.equal(createdTransactions[0].status, 'active');
  assert.ok(createdTransactions[0].importId);

  assert.equal(createdLogs.length, 1);
  assert.equal(createdLogs[0].companyId, 'company-1');
  assert.equal(createdLogs[0].fileName, 'movimientos.csv');
  assert.equal(createdLogs[0].fileType, 'csv');
  assert.equal(createdLogs[0].totalRows, 2);
  assert.equal(createdLogs[0].importedRows, 1);
  assert.equal(createdLogs[0].rejectedRows, 1);
  assert.equal(createdLogs[0].correlationId, 'corr-1');
  assert.equal(createdLogs[0].status, 'completed_with_errors');
  assert.deepEqual(createdLogs[0].errors[0].rowNumber, 3);
});
