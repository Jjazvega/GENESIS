function parseAmount(value) {
  const source = String(value || '').trim().replace(/[$\s]/g, '');
  if (!source) return 0;
  const normalized = source.includes(',') && source.includes('.')
    ? (source.lastIndexOf(',') > source.lastIndexOf('.') ? source.replace(/\./g, '').replace(',', '.') : source.replace(/,/g, ''))
    : source.replace(',', '.');
  return Number(normalized);
}

function normalizeArray(value) {
  const source = String(value || '').trim();
  if (!source) return [];
  if (source.startsWith('[')) {
    const parsed = JSON.parse(source);
    if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string')) {
      throw new Error('team y tags deben ser arreglos JSON de texto');
    }
    return parsed.map((item) => item.trim()).filter(Boolean);
  }
  return source.split(/[;,|]/).map((item) => item.trim()).filter(Boolean);
}

function normalizeOptionalDate(value, fieldName) {
  const source = String(value || '').trim();
  if (!source) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(source)) throw new Error(`${fieldName} debe usar el formato AAAA-MM-DD`);
  return source;
}

export function prepareProjects(rows, { companyId } = {}) {
  if (!companyId) throw new Error('Selecciona una empresa antes de importar proyectos.');
  const items = [];
  const errors = [];

  rows.forEach((row, index) => {
    try {
      const name = String(row.name || '').trim();
      if (!name) throw new Error('name es obligatorio');
      const budget = parseAmount(row.budget);
      if (!Number.isFinite(budget) || budget < 0) throw new Error(`budget inválido (${row.budget || 'vacío'})`);

      items.push({
        companyId,
        name: name.slice(0, 200),
        description: String(row.description || '').trim().slice(0, 2000),
        status: String(row.status || 'planificado').trim().slice(0, 50) || 'planificado',
        priority: String(row.priority || 'media').trim().slice(0, 50) || 'media',
        owner: String(row.owner || '').trim().slice(0, 120),
        startDate: normalizeOptionalDate(row.startdate || row.start_date, 'startDate'),
        endDate: normalizeOptionalDate(row.enddate || row.end_date, 'endDate'),
        budget: Number(budget.toFixed(2)),
        team: normalizeArray(row.team),
        tags: normalizeArray(row.tags),
        progress: 0,
        spent: 0,
      });
    } catch (error) {
      errors.push(`Fila ${index + 2}: ${error.message}`);
    }
  });

  return { items, errors };
}
