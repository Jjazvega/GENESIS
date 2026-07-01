function parseAmount(value) {
  const source = String(value || '').trim().replace(/[$\s]/g, '');
  if (!source) return 0;
  const normalized = source.includes(',') && source.includes('.')
    ? (source.lastIndexOf(',') > source.lastIndexOf('.') ? source.replace(/\./g, '').replace(',', '.') : source.replace(/,/g, ''))
    : source.replace(',', '.');
  return Number(normalized);
}

function normalizeEmail(value = '') {
  const email = String(value || '').trim().toLowerCase();
  if (!email) return '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`email inválido (${value})`);
  return email;
}

function normalizeRfc(value = '') {
  return String(value || '').trim().toUpperCase().replace(/\s/g, '');
}

export function prepareClients(rows, { companyId } = {}) {
  if (!companyId) throw new Error('Selecciona una empresa antes de importar clientes.');
  const items = [];
  const errors = [];

  rows.forEach((row, index) => {
    try {
      const name = String(row.name || '').trim();
      if (!name) throw new Error('name es obligatorio');
      const totalRevenue = parseAmount(row.total_revenue);
      if (!Number.isFinite(totalRevenue) || totalRevenue < 0) throw new Error(`total_revenue inválido (${row.total_revenue || 'vacío'})`);

      items.push({
        companyId,
        name: name.slice(0, 200),
        email: normalizeEmail(row.email),
        phone: String(row.phone || '').trim().slice(0, 50),
        rfc: normalizeRfc(row.rfc),
        segment: String(row.segment || 'potencial').trim().slice(0, 80) || 'potencial',
        industry: String(row.industry || '').trim().slice(0, 120),
        address: String(row.address || '').trim().slice(0, 500),
        assignedTo: String(row.assignedto || row.assigned_to || '').trim().slice(0, 120),
        total_revenue: Number(totalRevenue.toFixed(2)),
        notes: String(row.notes || '').trim().slice(0, 2000),
        status: 'activo',
      });
    } catch (error) {
      errors.push(`Fila ${index + 2}: ${error.message}`);
    }
  });

  return { items, errors };
}
