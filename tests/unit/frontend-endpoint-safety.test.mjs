import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const aiClientSource = await readFile(new URL('../../src/api/aiClient.js', import.meta.url), 'utf8');

describe('aiClient: endpoint safety', () => {
  it('centraliza la validación same-origin de endpoints internos antes de enviar Authorization', () => {
    assert.match(aiClientSource, /function getSafeInternalEndpoint\(/);
    assert.match(aiClientSource, /url\.origin !== window\.location\.origin/);
    assert.match(aiClientSource, /url\.username \|\| url\.password/);
    assert.match(aiClientSource, /!url\.pathname\.startsWith\('\/api\/'\)/);
    assert.doesNotMatch(aiClientSource, /const endpoint = import\.meta\.env\.VITE_LLM_ENDPOINT \|\| '\/api\/ai';/);
  });

  it('reutiliza la validación para funciones compatibles y evita interpolar nombres sin codificar', () => {
    assert.match(aiClientSource, /function getSafeFunctionsEndpoint\(\)/);
    assert.match(aiClientSource, /const defaultEndpoint = '\/api\/functions';/);
    assert.match(aiClientSource, /getSafeInternalEndpoint\(defaultEndpoint, '\/api\/functions', 'funciones'\)/);
    assert.match(aiClientSource, /const endpoint = getSafeFunctionsEndpoint\(\);/);
    assert.match(aiClientSource, /const defaultEndpoint = '\/api\/ai';/);
    assert.match(aiClientSource, /getSafeInternalEndpoint\(defaultEndpoint, '\/api\/ai', 'ia'\)/);
    assert.match(aiClientSource, /const safeFunctionName = encodeURIComponent\(parsed\.data\.name\);/);
    assert.match(aiClientSource, /fetch\(`.*safeFunctionName.*`/);
  });

  it('valida inputs con Zod antes de invocar IA', () => {
    assert.match(aiClientSource, /InvokeLLMSchema/);
    assert.match(aiClientSource, /z\.object/);
    assert.match(aiClientSource, /CompanyIdSchema/);
    assert.match(aiClientSource, /safeParse/);
    assert.match(aiClientSource, /MAX_PROMPT_LENGTH = 12000/);
    assert.match(aiClientSource, /MAX_REQUESTED_DOCUMENTS = 25/);
    assert.match(aiClientSource, /CompanyIdSchema/);
    assert.match(aiClientSource, /DocumentIdArraySchema/);
    assert.match(aiClientSource, /shapeInvokeLlmPayload/);
  });
});
