import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const SOURCE_PATH = new URL('../../src/features/documents/services/analyzeDocumentFlow.js', import.meta.url);

describe('analyzeDocumentFlow fail-fast validation', () => {
  it('validates document ownership and company context before marking the document as processing', async () => {
    const source = await readFile(SOURCE_PATH, 'utf8');

    const functionStart = source.indexOf('export async function analyzeDocumentFlow');
    const validationCall = source.indexOf('validateDocumentReadyForAi({ doc, company });', functionStart);
    const processingUpdate = source.indexOf('status: DOCUMENT_STATUSES.PROCESSING', functionStart);

    assert.notEqual(functionStart, -1, 'analyzeDocumentFlow export must exist');
    assert.notEqual(validationCall, -1, 'analyzeDocumentFlow must validate the document before side effects');
    assert.notEqual(processingUpdate, -1, 'analyzeDocumentFlow must mark valid documents as processing');
    assert.ok(
      validationCall < processingUpdate,
      'company and document validation must happen before updating the document to processing',
    );
  });
});
