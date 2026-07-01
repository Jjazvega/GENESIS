import React, { useMemo, useRef, useState } from 'react';
import { Upload, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { getSpreadsheetAcceptAttribute, readSpreadsheetFile } from '@/lib/importers/spreadsheetImport';
import { mapTransactionImportRecord } from '@/features/finance/services/transactionImportMapper';
import { createTransactionsFromImport, summarizeImportRows } from '@/features/finance/services/transactionImport';

function createCorrelationId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `finance_import_${Date.now()}`;
}

export default function TransactionImporter({ activeCompany, user, onImported }) {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const summary = useMemo(() => summarizeImportRows(rows), [rows]);
  const previewRows = rows.slice(0, 5);

  const handleFileChange = async (event) => {
    const selectedFile = event.target.files?.[0];
    setFile(selectedFile || null);
    setRows([]);
    setResult(null);
    setError('');

    if (!selectedFile) return;

    setLoading(true);
    try {
      const records = await readSpreadsheetFile(selectedFile);
      const mappedRows = records.map((record, index) => mapTransactionImportRecord({
        record,
        rowNumber: index + 2,
        companyId: activeCompany?.id,
        userId: user?.uid,
      }));
      setRows(mappedRows);
    } catch (readError) {
      setError(readError.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!file || rows.length === 0) return;

    setSaving(true);
    setError('');
    setResult(null);

    try {
      const correlationId = createCorrelationId();
      const importResult = await createTransactionsFromImport({
        companyId: activeCompany.id,
        transactions: rows,
        correlationId,
        fileName: file.name,
      });
      setResult(importResult);
      onImported?.(importResult);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="mb-6">
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Upload className="h-5 w-5 text-primary" />
              Importar transacciones
            </CardTitle>
            <CardDescription>
              Sube CSV o Excel, valida filas y guarda transacciones financieras con trazabilidad de importación.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="file"
              accept={getSpreadsheetAcceptAttribute()}
              onChange={handleFileChange}
              className="hidden"
            />
            <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} disabled={loading || saving} className="gap-2 border-border">
              <Upload className="h-4 w-4" />
              Importar CSV o Excel
            </Button>
            <Button type="button" onClick={handleSave} disabled={!summary.validRows.length || loading || saving}>
              {saving ? 'Guardando...' : 'Guardar transacciones'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && <p className="text-sm text-muted-foreground">Leyendo archivo y validando columnas...</p>}

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>No se pudo completar la importación</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {rows.length > 0 && (
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Filas leídas</p>
                <p className="text-2xl font-semibold">{summary.totalRows}</p>
              </div>
              <div className="rounded-lg border border-emerald-500/30 p-3">
                <p className="text-xs text-muted-foreground">Listas para importar</p>
                <p className="text-2xl font-semibold text-emerald-400">{summary.importedRows}</p>
              </div>
              <div className="rounded-lg border border-amber-500/30 p-3">
                <p className="text-xs text-muted-foreground">Con errores</p>
                <p className="text-2xl font-semibold text-amber-400">{summary.rejectedRows}</p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-muted/40 text-left text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Fila</th>
                    <th className="px-3 py-2">Tipo</th>
                    <th className="px-3 py-2">Monto</th>
                    <th className="px-3 py-2">Fecha</th>
                    <th className="px-3 py-2">Categoría</th>
                    <th className="px-3 py-2">Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row) => (
                    <tr key={row.rowNumber} className="border-t border-border">
                      <td className="px-3 py-2">{row.rowNumber}</td>
                      <td className="px-3 py-2">{row.transaction.type || '—'}</td>
                      <td className="px-3 py-2">{row.transaction.amount || '—'}</td>
                      <td className="px-3 py-2">{row.transaction.date || '—'}</td>
                      <td className="px-3 py-2">{row.transaction.category || '—'}</td>
                      <td className="px-3 py-2">
                        {row.ok ? 'Lista' : row.errors.join('; ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {result && (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>Importación finalizada</AlertTitle>
            <AlertDescription>
              {result.importedRows} transacciones guardadas y {result.rejectedRows} filas rechazadas. Import ID: {result.importId}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
