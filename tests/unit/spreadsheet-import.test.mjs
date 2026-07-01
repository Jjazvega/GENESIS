import assert from 'node:assert/strict';
import test from 'node:test';
import { strToU8, zipSync } from 'fflate';
import {
  matrixToRecords,
  parseDelimitedText,
  readSpreadsheetFile,
} from '../../src/lib/importers/spreadsheetImport.js';
import { prepareTransactions } from '../../src/features/erp/services/transactionImport.js';
import { prepareClients } from '../../src/features/crm/services/clientImport.js';
import { prepareProjects } from '../../src/features/operations/services/projectImport.js';

function asFile(name, bytes) {
  const owned = Uint8Array.from(bytes);
  return {
    name,
    size: owned.byteLength,
    arrayBuffer: async () => owned.buffer.slice(owned.byteOffset, owned.byteOffset + owned.byteLength),
  };
}

function makeXlsx(rows) {
  const sharedStrings = rows.flat();
  const sharedXml = `<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${sharedStrings.length}" uniqueCount="${sharedStrings.length}">${sharedStrings.map((value) => `<si><t>${String(value).replace(/&/g, '&amp;')}</t></si>`).join('')}</sst>`;
  let cursor = 0;
  const sheetRows = rows.map((row, rowIndex) => {
    const cells = row.map((_value, columnIndex) => {
      const column = String.fromCharCode(65 + columnIndex);
      const cell = `<c r="${column}${rowIndex + 1}" t="s"><v>${cursor}</v></c>`;
      cursor += 1;
      return cell;
    }).join('');
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join('');

  return zipSync({
    '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),
    'xl/workbook.xml': strToU8('<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Datos" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'),
    'xl/sharedStrings.xml': strToU8(sharedXml),
    'xl/worksheets/sheet1.xml': strToU8(`<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`),
  });
}

test('parseDelimitedText respeta campos entre comillas y coma interna', () => {
  const matrix = parseDelimitedText('nombre,notas\n"Acme, S.A.","Cliente, prioritario"\n');
  assert.deepEqual(matrix, [['nombre', 'notas'], ['Acme, S.A.', 'Cliente, prioritario']]);
});

test('matrixToRecords normaliza encabezados y bloquea duplicados', () => {
  const records = matrixToRecords([[' Total Revenue ', 'RFC'], ['1000', 'XAXX010101000']]);
  assert.deepEqual(records, [{ total_revenue: '1000', rfc: 'XAXX010101000' }]);
  assert.throws(() => matrixToRecords([['RFC', 'rfc'], ['a', 'b']]), /repetidos/i);
});

test('readSpreadsheetFile lee CSV y XLSX sin enviar el archivo a la IA', async () => {
  const csv = asFile('clientes.csv', strToU8('name,email\nEmpresa Uno,uno@example.com\n'));
  const csvRows = await readSpreadsheetFile(csv);
  assert.deepEqual(csvRows, [{ name: 'Empresa Uno', email: 'uno@example.com' }]);

  const xlsx = asFile('clientes.xlsx', makeXlsx([
    ['name', 'email'],
    ['Empresa Dos', 'dos@example.com'],
  ]));
  const xlsxRows = await readSpreadsheetFile(xlsx);
  assert.deepEqual(xlsxRows, [{ name: 'Empresa Dos', email: 'dos@example.com' }]);
});

test('prepareTransactions normaliza monto, fecha y categoría', () => {
  const result = prepareTransactions([
    { tipo: 'gasto', monto: '1.234,50', descripcion: 'Renta, oficina', fecha: '05/06/2026', categoria: 'renta', metodo_pago: 'transferencia' },
  ], { companyId: 'empresa-1', now: new Date('2026-01-01T00:00:00.000Z') });

  assert.equal(result.errors.length, 0);
  assert.deepEqual(result.items[0], {
    companyId: 'empresa-1',
    type: 'gasto',
    amount: 1234.5,
    description: 'Renta, oficina',
    date: '2026-06-05',
    category: 'renta',
    paymentMethod: 'transferencia',
    status: 'confirmed',
  });
});

test('prepareClients y prepareProjects detienen registros inválidos', () => {
  const clients = prepareClients([
    { name: 'Cliente Uno', email: 'uno@example.com', total_revenue: '5000' },
    { name: '', email: 'malo' },
  ], { companyId: 'empresa-1' });
  assert.equal(clients.items.length, 1);
  assert.equal(clients.errors.length, 1);

  const projects = prepareProjects([
    { name: 'Proyecto Uno', budget: '1000', startdate: '2026-06-01', enddate: '2026-06-30', team: '["Ana","Luis"]', tags: 'web,ventas' },
  ], { companyId: 'empresa-1' });
  assert.equal(projects.errors.length, 0);
  assert.deepEqual(projects.items[0].team, ['Ana', 'Luis']);
  assert.deepEqual(projects.items[0].tags, ['web', 'ventas']);
});
