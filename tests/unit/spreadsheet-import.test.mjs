import assert from 'node:assert/strict';
import test from 'node:test';
import { strToU8, zipSync } from 'fflate';
import {
  matrixToRecords,
  parseDelimitedText,
  readSpreadsheetFile,
} from '../../src/lib/importers/spreadsheetImport.js';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

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

test('no conserva importadores retirados fuera del alcance Core', () => {
  for (const dir of ['src/features/crm', 'src/features/erp', 'src/features/operations']) {
    assert.equal(existsSync(resolve(dir)), false, `${dir} debe permanecer fuera del Core`);
  }
});

test('parseDelimitedText cubre delimitadores alternos, BOM, CRLF, comillas escapadas y filas vacías', () => {
  const matrix = parseDelimitedText('\uFEFFnombre;nota;activo\r\n"Empresa Uno";"Dijo ""hola""";true\r\n\r\nEmpresa Dos;sin comillas;false\r\n');
  assert.deepEqual(matrix, [
    ['nombre', 'nota', 'activo'],
    ['Empresa Uno', 'Dijo "hola"', 'true'],
    ['Empresa Dos', 'sin comillas', 'false'],
  ]);
});

test('parseDelimitedText falla temprano con comillas sin cerrar', () => {
  assert.throws(
    () => parseDelimitedText('nombre,nota\nEmpresa,"valor sin cerrar'),
    /comillas sin cerrar/i,
  );
});

test('matrixToRecords rechaza encabezados vacíos, archivos sin registros y límites excedidos', () => {
  assert.throws(() => matrixToRecords([['Nombre', '   '], ['Empresa', 'valor']]), /encabezados.*vacíos/i);
  assert.throws(() => matrixToRecords([['Nombre'], ['   ']]), /no tiene registros/i);
  assert.throws(() => matrixToRecords([['Nombre'], ['Uno'], ['Dos']], { maxRows: 1 }), /límite de 1 registros/i);
});

test('readSpreadsheetFile rechaza entradas inválidas, extensiones inseguras, archivos vacíos y tamaño excesivo', async () => {
  await assert.rejects(() => readSpreadsheetFile(null), /archivo CSV o Excel/i);
  await assert.rejects(() => readSpreadsheetFile(asFile('clientes.xls', [1, 2, 3])), /Formato no soportado/i);
  await assert.rejects(() => readSpreadsheetFile({ name: 'clientes.csv', size: 0, arrayBuffer: async () => new ArrayBuffer(0) }), /vacío o es inválido/i);
  await assert.rejects(() => readSpreadsheetFile(asFile('clientes.csv', strToU8('name\nEmpresa\n')), { maxFileSizeBytes: 1 }), /supera el límite/i);
});
