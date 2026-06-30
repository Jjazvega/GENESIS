export function normalizeObjectFilters(filters, collectionName) {
  const normalizedFilters = Object.entries(filters)
    .filter(([, filterValue]) => filterValue !== undefined && filterValue !== null && filterValue !== 'all');

  if (normalizedFilters.length === 0) {
    throw new Error(`Filtro vacío rechazado para ${collectionName}; define criterios explícitos antes de consultar.`);
  }

  const unsupportedArrayFilter = normalizedFilters.find(([, filterValue]) => Array.isArray(filterValue));
  if (unsupportedArrayFilter) {
    throw new Error(`Filtro array no soportado en ${collectionName}.${unsupportedArrayFilter[0]}; auditar índices y límites antes de usar IN/chunking.`);
  }

  return normalizedFilters;
}
