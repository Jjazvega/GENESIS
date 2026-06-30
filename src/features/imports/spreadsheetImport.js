import { strFromU8, unzipSync } from 'fflate';

const ALLOWED_EXTENSIONS = new Set(['csv', 'xlsx', 'xls']);

export function getSpreadsheetExtension(fileName = '') {
  return String(fileName).split('.').pop()?.toLowerCase() || '';
}

export function validateSpreadsheetFile(file) {
  if (!file) throw new Error('Selecciona un archivo para importar.');
  const extension = getSpreadsheetExtension(file.name);
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new Error('Formato no soportado. Usa CSV o Excel (.xlsx, .xls).');
  }
  return extension;
}

function parseDelimited(text, delimiter = ',') {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (quoted && next === '"') {
        value += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      row.push(value.trim());
      value = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(value.trim());
      if (row.some(cell => cell !== '')) rows.push(row);
      row = [];
      value = '';
    } else {
      value += char;
    }
  }

  row.push(value.trim());
  if (row.some(cell => cell !== '')) rows.push(row);
  return rows;
}

function rowsToObjects(rows) {
  if (rows.length < 2) return [];
  const headers = rows[0].map(header => String(header || '').trim().toLowerCase().replace(/\s+/g, ' '));
  return rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ''])));
}

function parseXml(text, mimeType = 'application/xml') {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, mimeType);
  const parseError = doc.querySelector('parsererror');
  if (parseError) throw new Error('No se pudo leer la hoja de cálculo. Revisa el formato e intenta de nuevo.');
  return doc;
}

function parseXmlSpreadsheet(text) {
  const doc = parseXml(text);
  const tableRows = Array.from(doc.getElementsByTagName('Row'));
  const rows = tableRows.map(row => Array.from(row.getElementsByTagName('Cell')).map((cell) => {
    const data = cell.getElementsByTagName('Data')[0];
    return data?.textContent?.trim() || '';
  })).filter(row => row.some(Boolean));
  return rowsToObjects(rows);
}

function parseHtmlTable(text) {
  const doc = parseXml(text, 'text/html');
  const tableRows = Array.from(doc.querySelectorAll('table tr'));
  const rows = tableRows.map(row => Array.from(row.querySelectorAll('th,td')).map(cell => cell.textContent.trim())).filter(row => row.some(Boolean));
  return rowsToObjects(rows);
}

function getCellColumnIndex(reference = '') {
  const letters = String(reference).replace(/\d/g, '').toUpperCase();
  let index = 0;
  for (const letter of letters) {
    index = index * 26 + (letter.charCodeAt(0) - 64);
  }
  return Math.max(index - 1, 0);
}

function readZipText(files, path) {
  const content = files[path];
  return content ? strFromU8(content) : '';
}

function getWorkbookSheetPath(files) {
  const workbookXml = readZipText(files, 'xl/workbook.xml');
  const relsXml = readZipText(files, 'xl/_rels/workbook.xml.rels');
  if (!workbookXml || !relsXml) throw new Error('El archivo XLSX no contiene un libro válido.');

  const workbook = parseXml(workbookXml);
  const rels = parseXml(relsXml);
  const firstSheet = workbook.getElementsByTagName('sheet')[0];
  const relId = firstSheet?.getAttribute('r:id') || firstSheet?.getAttribute('id');
  if (!relId) return 'xl/worksheets/sheet1.xml';

  const relationship = Array.from(rels.getElementsByTagName('Relationship')).find(rel => rel.getAttribute('Id') === relId);
  const target = relationship?.getAttribute('Target') || 'worksheets/sheet1.xml';
  return target.startsWith('xl/') ? target : `xl/${target.replace(/^\//, '')}`;
}

function parseSharedStrings(files) {
  const sharedStringsXml = readZipText(files, 'xl/sharedStrings.xml');
  if (!sharedStringsXml) return [];
  const doc = parseXml(sharedStringsXml);
  return Array.from(doc.getElementsByTagName('si')).map((item) => Array.from(item.getElementsByTagName('t')).map(node => node.textContent || '').join(''));
}

function parseXlsxBuffer(buffer) {
  const files = unzipSync(new Uint8Array(buffer));
  const sharedStrings = parseSharedStrings(files);
  const sheetPath = getWorkbookSheetPath(files);
  const worksheetXml = readZipText(files, sheetPath);
  if (!worksheetXml) throw new Error('El archivo XLSX no contiene una hoja válida.');

  const worksheet = parseXml(worksheetXml);
  const rows = Array.from(worksheet.getElementsByTagName('row')).map((row) => {
    const values = [];
    Array.from(row.getElementsByTagName('c')).forEach((cell) => {
      const ref = cell.getAttribute('r') || '';
      const type = cell.getAttribute('t');
      const valueNode = cell.getElementsByTagName('v')[0];
      const inlineNode = cell.getElementsByTagName('t')[0];
      let value = valueNode?.textContent || inlineNode?.textContent || '';
      if (type === 's') value = sharedStrings[Number(value)] || '';
      values[getCellColumnIndex(ref)] = value;
    });
    return values.map(value => String(value ?? '').trim());
  }).filter(row => row.some(Boolean));

  return rowsToObjects(rows);
}

export async function parseSpreadsheetFile(file) {
  const extension = validateSpreadsheetFile(file);

  if (extension === 'xlsx') {
    return parseXlsxBuffer(await file.arrayBuffer());
  }

  const text = await file.text();
  const trimmed = text.trimStart();

  if (extension === 'csv') {
    return rowsToObjects(parseDelimited(text, text.includes('\t') && !text.includes(',') ? '\t' : ','));
  }

  if (trimmed.startsWith('<')) {
    if (/Workbook|Worksheet|ss:Workbook/i.test(trimmed)) return parseXmlSpreadsheet(text);
    if (/<table[\s>]/i.test(trimmed)) return parseHtmlTable(text);
  }

  throw new Error('Este archivo .xls binario no se puede leer directamente. Guárdalo como .xlsx o CSV e intenta de nuevo. No se subió a documentos.');
}

export function validateRequiredColumns(rows, requiredColumns) {
  if (!rows.length) return ['El archivo no contiene filas de datos.'];
  const columns = new Set(Object.keys(rows[0] || {}));
  return requiredColumns
    .filter(column => !columns.has(column))
    .map(column => `Falta la columna requerida: ${column}`);
}

export async function createImportLog({ firebase, companyId, type, file, validCount, errorCount, status, errors = [] }) {
  const payload = {
    companyId,
    type,
    fileName: file?.name || '',
    fileSize: file?.size || 0,
    validCount,
    errorCount,
    status,
    errors: errors.slice(0, 100),
    importedAt: new Date().toISOString(),
  };

  if (firebase.entities.ImportLog?.create) {
    return firebase.entities.ImportLog.create(payload);
  }
  return null;
}
