import { unzipSync } from 'fflate';

const DEFAULT_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_ROWS = 1000;
const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function getFileExtension(fileName = '') {
  const value = String(fileName || '').trim().toLowerCase();
  const dotIndex = value.lastIndexOf('.');
  return dotIndex >= 0 ? value.slice(dotIndex + 1) : '';
}

function decodeXml(value = '') {
  return String(value)
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_match, entity) => {
      const codePoint = String(entity).toLowerCase().startsWith('x')
        ? Number.parseInt(String(entity).slice(1), 16)
        : Number.parseInt(entity, 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : '';
    })
    .replace(/&amp;/gi, '&');
}

function decodeUtf8(bytes) {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

function normalizeHeader(value = '') {
  return decodeXml(String(value))
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s_-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/^_+|_+$/g, '');
}

function detectDelimiter(text) {
  const sample = String(text).split(/\r?\n/, 5).join('\n');
  const candidates = [',', ';', '\t'];
  return candidates
    .map((delimiter) => ({ delimiter, count: sample.split(delimiter).length - 1 }))
    .sort((left, right) => right.count - left.count)[0].delimiter;
}

export function parseDelimitedText(text, delimiter = detectDelimiter(text)) {
  const source = String(text || '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];

    if (quoted) {
      if (character === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
      continue;
    }

    if (character === delimiter) {
      row.push(cell.trim());
      cell = '';
      continue;
    }

    if (character === '\n' || character === '\r') {
      if (character === '\r' && next === '\n') index += 1;
      row.push(cell.trim());
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += character;
  }

  row.push(cell.trim());
  if (row.some((value) => value !== '')) rows.push(row);

  if (quoted) {
    throw new Error('El archivo CSV tiene comillas sin cerrar. Corrige el archivo e inténtalo de nuevo.');
  }

  return rows;
}

function getXmlAttribute(tag = '', attributeName) {
  const escapedName = String(attributeName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(tag).match(new RegExp(`\\b${escapedName}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return match ? decodeXml(match[1]) : '';
}

function getTextFromXmlFragment(fragment = '') {
  return Array.from(String(fragment).matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/gi))
    .map((match) => decodeXml(match[1]))
    .join('');
}

function parseSharedStrings(xml = '') {
  return Array.from(String(xml).matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/gi))
    .map((match) => getTextFromXmlFragment(match[1]));
}

function columnIndexFromCellReference(cellReference = '') {
  const letters = String(cellReference).match(/[A-Z]+/i)?.[0]?.toUpperCase() || '';
  if (!letters) return -1;

  return letters.split('').reduce((value, character) => (value * 26) + character.charCodeAt(0) - 64, 0) - 1;
}

function getCellValue(cellTag, cellBody, sharedStrings, dateStyles) {
  const type = getXmlAttribute(cellTag, 't');
  const styleId = Number.parseInt(getXmlAttribute(cellTag, 's'), 10);

  if (type === 'inlineStr') return getTextFromXmlFragment(cellBody);

  const rawValue = String(cellBody).match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/i)?.[1] ?? '';
  if (type === 's') return sharedStrings[Number.parseInt(rawValue, 10)] || '';
  if (type === 'b') return rawValue === '1' ? 'true' : 'false';
  if (type === 'str') return decodeXml(rawValue);

  const value = decodeXml(rawValue);
  if (Number.isFinite(styleId) && dateStyles.has(styleId) && /^-?\d+(\.\d+)?$/.test(value)) {
    const excelSerial = Number(value);
    const epoch = Date.UTC(1899, 11, 30);
    const date = new Date(epoch + Math.round(excelSerial * 86400000));
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }

  return value;
}

function getDateStyleIndexes(stylesXml = '') {
  const customNumberFormats = new Map(
    Array.from(String(stylesXml).matchAll(/<numFmt\b[^>]*>/gi)).map((match) => {
      const tag = match[0];
      return [Number.parseInt(getXmlAttribute(tag, 'numFmtId'), 10), getXmlAttribute(tag, 'formatCode')];
    }),
  );
  const dateNumberFormatIds = new Set([14, 15, 16, 17, 22, 27, 30, 36, 45, 46, 47, 50, 57, 58]);
  const cellXfs = String(stylesXml).match(/<cellXfs(?:\s[^>]*)?>([\s\S]*?)<\/cellXfs>/i)?.[1] || '';
  const dateStyles = new Set();

  Array.from(cellXfs.matchAll(/<xf\b[^>]*\/?>(?:<\/xf>)?/gi)).forEach((match, index) => {
    const numFmtId = Number.parseInt(getXmlAttribute(match[0], 'numFmtId'), 10);
    const customFormat = customNumberFormats.get(numFmtId) || '';
    const hasDateFormat = dateNumberFormatIds.has(numFmtId) || /[dmyhs]/i.test(customFormat.replace(/\[[^\]]+\]/g, ''));
    if (hasDateFormat) dateStyles.add(index);
  });

  return dateStyles;
}

function getFirstWorksheetPath(entries) {
  const workbookXml = entries['xl/workbook.xml'] ? decodeUtf8(entries['xl/workbook.xml']) : '';
  const relationshipsXml = entries['xl/_rels/workbook.xml.rels'] ? decodeUtf8(entries['xl/_rels/workbook.xml.rels']) : '';
  const firstSheetTag = workbookXml.match(/<sheet\b[^>]*>/i)?.[0] || '';
  const relationshipId = getXmlAttribute(firstSheetTag, 'r:id') || getXmlAttribute(firstSheetTag, 'id');

  if (relationshipId && relationshipsXml) {
    const relationshipTag = Array.from(relationshipsXml.matchAll(/<Relationship\b[^>]*>/gi))
      .map((match) => match[0])
      .find((tag) => getXmlAttribute(tag, 'Id') === relationshipId);
    const target = relationshipTag ? getXmlAttribute(relationshipTag, 'Target') : '';
    if (target) {
      const normalized = target.replace(/^\//, '').replace(/^xl\//, '');
      const path = `xl/${normalized}`;
      if (entries[path]) return path;
    }
  }

  return Object.keys(entries)
    .filter((entryName) => /^xl\/worksheets\/[^/]+\.xml$/i.test(entryName))
    .sort()[0] || '';
}

export function parseXlsxArrayBuffer(arrayBuffer) {
  const entries = unzipSync(new Uint8Array(arrayBuffer));
  const worksheetPath = getFirstWorksheetPath(entries);

  if (!worksheetPath || !entries[worksheetPath]) {
    throw new Error('El archivo Excel no contiene una hoja válida para importar.');
  }

  const totalExtractedBytes = Object.values(entries).reduce((total, bytes) => total + bytes.byteLength, 0);
  if (totalExtractedBytes > 20 * 1024 * 1024) {
    throw new Error('El archivo Excel descomprimido es demasiado grande. Usa un archivo de hasta 20MB de contenido.');
  }

  const worksheetXml = decodeUtf8(entries[worksheetPath]);
  const sharedStringsXml = entries['xl/sharedStrings.xml'] ? decodeUtf8(entries['xl/sharedStrings.xml']) : '';
  const stylesXml = entries['xl/styles.xml'] ? decodeUtf8(entries['xl/styles.xml']) : '';
  const sharedStrings = parseSharedStrings(sharedStringsXml);
  const dateStyles = getDateStyleIndexes(stylesXml);
  const matrix = [];

  Array.from(worksheetXml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/gi)).forEach((rowMatch, rowIndex) => {
    const row = [];
    const rowXml = rowMatch[1];

    Array.from(rowXml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gi)).forEach((cellMatch) => {
      const cellTag = cellMatch[1];
      const cellIndex = columnIndexFromCellReference(getXmlAttribute(cellTag, 'r'));
      const targetIndex = cellIndex >= 0 ? cellIndex : row.length;
      row[targetIndex] = getCellValue(cellTag, cellMatch[2], sharedStrings, dateStyles);
    });

    if (row.some((value) => String(value ?? '').trim() !== '')) matrix[rowIndex] = row;
  });

  return matrix.filter(Boolean);
}

export function matrixToRecords(matrix, { maxRows = DEFAULT_MAX_ROWS } = {}) {
  if (!Array.isArray(matrix) || matrix.length < 2) {
    throw new Error('El archivo debe incluir una fila de encabezados y al menos un registro.');
  }

  const headers = matrix[0].map(normalizeHeader);
  if (headers.some((header) => !header)) {
    throw new Error('Los encabezados del archivo no pueden estar vacíos.');
  }

  const duplicatedHeaders = headers.filter((header, index) => headers.indexOf(header) !== index);
  if (duplicatedHeaders.length > 0) {
    throw new Error(`Hay encabezados repetidos: ${Array.from(new Set(duplicatedHeaders)).join(', ')}.`);
  }

  const records = matrix.slice(1)
    .filter((row) => row.some((value) => String(value ?? '').trim() !== ''))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, String(row[index] ?? '').trim()])));

  if (records.length === 0) {
    throw new Error('El archivo no tiene registros para importar.');
  }

  if (records.length > maxRows) {
    throw new Error(`El archivo supera el límite de ${maxRows} registros por importación.`);
  }

  return records;
}

export async function readSpreadsheetFile(file, {
  maxRows = DEFAULT_MAX_ROWS,
  maxFileSizeBytes = DEFAULT_MAX_FILE_SIZE_BYTES,
} = {}) {
  if (!file || typeof file.arrayBuffer !== 'function') {
    throw new Error('Selecciona un archivo CSV o Excel (.xlsx) válido.');
  }

  const extension = getFileExtension(file.name);
  if (!['csv', 'xlsx'].includes(extension)) {
    throw new Error('Formato no soportado. Usa CSV o Excel (.xlsx). Los archivos .xls no son compatibles.');
  }

  const size = Number(file.size || 0);
  if (!Number.isFinite(size) || size <= 0) {
    throw new Error('El archivo está vacío o es inválido.');
  }

  if (size > maxFileSizeBytes) {
    throw new Error(`El archivo supera el límite de ${Math.floor(maxFileSizeBytes / (1024 * 1024))}MB.`);
  }

  const arrayBuffer = await file.arrayBuffer();
  const matrix = extension === 'csv'
    ? parseDelimitedText(decodeUtf8(new Uint8Array(arrayBuffer)))
    : parseXlsxArrayBuffer(arrayBuffer);

  return matrixToRecords(matrix, { maxRows });
}

export function getSpreadsheetAcceptAttribute() {
  return '.csv,.xlsx';
}

export const SPREADSHEET_IMPORT_LIMITS = Object.freeze({
  maxFileSizeBytes: DEFAULT_MAX_FILE_SIZE_BYTES,
  maxRows: DEFAULT_MAX_ROWS,
  xlsxContentType: XLSX_CONTENT_TYPE,
});
