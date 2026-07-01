import { TRANSACTION_IMPORT_ACCEPTED_FILE_TYPES } from '../constants/transactionImportColumns.js';

function getFileType(fileName = '') {
  return String(fileName).split('.').pop()?.toLowerCase() || '';
}

function createImportId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `import_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

async function getDefaultRepositories() {
  const { createRepository } = await import('@/infrastructure/firebase/firestore');
  return {
    transactions: createRepository('transactions'),
    importLogs: createRepository('importLogs'),
  };
}

export function summarizeImportRows(rows = []) {
  const validRows = rows.filter((row) => row.ok);
  const invalidRows = rows.filter((row) => !row.ok);

  return {
    totalRows: rows.length,
    importedRows: validRows.length,
    rejectedRows: invalidRows.length,
    validRows,
    invalidRows,
  };
}

export async function createTransactionsFromImport({
  companyId,
  transactions,
  correlationId,
  fileName = '',
  repositories,
}) {
  const rows = Array.isArray(transactions) ? transactions : [];
  const fileType = getFileType(fileName);
  const importId = createImportId();
  const resolvedRepositories = repositories || await getDefaultRepositories();
  const summary = summarizeImportRows(rows);
  const invalidFileType = fileName && !TRANSACTION_IMPORT_ACCEPTED_FILE_TYPES.includes(fileType);

  if (!companyId) {
    throw new Error('No hay empresa activa para guardar la importación financiera.');
  }

  const importLogBase = {
    companyId,
    importId,
    fileName,
    fileType: invalidFileType ? '' : fileType,
    totalRows: summary.totalRows,
    importedRows: summary.importedRows,
    rejectedRows: summary.rejectedRows,
    correlationId,
  };

  if (invalidFileType) {
    await resolvedRepositories.importLogs.create({
      ...importLogBase,
      status: 'error',
      errors: [`Formato no soportado: ${fileType}`],
    });
    throw new Error('Formato no soportado. Usa CSV o Excel (.xlsx).');
  }

  try {
    const payload = summary.validRows.map((row) => ({
      ...row.transaction,
      companyId,
      importId,
      source: 'spreadsheet_import',
      status: 'active',
    }));

    const createdTransactions = payload.length > 0
      ? await resolvedRepositories.transactions.bulkCreate(payload)
      : [];

    const importLog = await resolvedRepositories.importLogs.create({
      ...importLogBase,
      status: summary.rejectedRows > 0 ? 'completed_with_errors' : 'completed',
      errors: summary.invalidRows.map((row) => ({
        rowNumber: row.rowNumber,
        errors: row.errors,
      })),
    });

    return {
      ...summary,
      importId,
      importLog,
      transactions: createdTransactions,
    };
  } catch (error) {
    await resolvedRepositories.importLogs.create({
      ...importLogBase,
      importedRows: 0,
      rejectedRows: summary.totalRows,
      status: 'error',
      errors: [{ message: error.message }],
    });
    throw error;
  }
}
