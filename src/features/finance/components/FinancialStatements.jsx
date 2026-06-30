import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Download, Loader2, TrendingUp, TrendingDown } from 'lucide-react';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';

const categoryLabels = {
  ventas: 'Ventas', servicios: 'Servicios', inversiones: 'Inversiones', otros_ingresos: 'Otros Ingresos',
  nómina: 'Nómina', renta: 'Renta', servicios_profesionales: 'Serv. Profesionales', materiales: 'Materiales',
  marketing: 'Marketing', impuestos: 'Impuestos', seguros: 'Seguros', mantenimiento: 'Mantenimiento',
  tecnología: 'Tecnología', transporte: 'Transporte', otros_gastos: 'Otros Gastos',
};

function fmt(n) { return `$${(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`; }

function Row({ label, value, bold, indent, positive, negative, sub }) {
  const color = positive ? 'text-emerald-400' : negative ? 'text-red-400' : 'text-foreground';
  return (
    <div className={`flex items-center justify-between py-2 ${sub ? 'border-b border-border' : ''} ${indent ? 'pl-6' : ''}`}>
      <span className={`text-sm ${bold ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>{label}</span>
      <span className={`text-sm font-mono ${bold ? 'font-bold' : ''} ${color}`}>{fmt(value)}</span>
    </div>
  );
}

export default function FinancialStatements({ transactions, company }) {
  const [period, setPeriod] = useState('current');
  const [reportType, setReportType] = useState('results');
  const [exporting, setExporting] = useState(false);

  const { filteredTx, periodLabel } = useMemo(() => {
    const now = new Date();
    let start, end;
    if (period === 'current') {
      start = format(startOfMonth(now), 'yyyy-MM-dd');
      end = format(endOfMonth(now), 'yyyy-MM-dd');
    } else if (period === 'last') {
      const lm = subMonths(now, 1);
      start = format(startOfMonth(lm), 'yyyy-MM-dd');
      end = format(endOfMonth(lm), 'yyyy-MM-dd');
    } else if (period === 'q1') { start = `${now.getFullYear()}-01-01`; end = `${now.getFullYear()}-03-31`; }
    else if (period === 'q2') { start = `${now.getFullYear()}-04-01`; end = `${now.getFullYear()}-06-30`; }
    else if (period === 'q3') { start = `${now.getFullYear()}-07-01`; end = `${now.getFullYear()}-09-30`; }
    else if (period === 'ytd') { start = `${now.getFullYear()}-01-01`; end = format(now, 'yyyy-MM-dd'); }
    else { start = `${now.getFullYear() - 1}-01-01`; end = `${now.getFullYear() - 1}-12-31`; }

    const filtered = transactions.filter(t => t.date >= start && t.date <= end);
    const labels = {
      current: `${format(now, 'MMMM yyyy', { locale: es })}`,
      last: `${format(subMonths(now, 1), 'MMMM yyyy', { locale: es })}`,
      q1: `Q1 ${now.getFullYear()}`, q2: `Q2 ${now.getFullYear()}`,
      q3: `Q3 ${now.getFullYear()}`, ytd: `Ene–${format(now, 'MMM yyyy', { locale: es })}`,
      year: `${now.getFullYear() - 1}`,
    };
    return { filteredTx: filtered, periodLabel: labels[period] };
  }, [transactions, period]);

  // Estado de Resultados
  const resultsData = useMemo(() => {
    const ingresos = filteredTx.filter(t => t.type === 'ingreso');
    const gastos = filteredTx.filter(t => t.type === 'gasto');
    const totalIngresos = ingresos.reduce((s, t) => s + (t.amount || 0), 0);
    const totalGastos = gastos.reduce((s, t) => s + (t.amount || 0), 0);
    const utilidadBruta = totalIngresos - totalGastos;
    const margen = totalIngresos > 0 ? (utilidadBruta / totalIngresos) * 100 : 0;

    const byCategory = {};
    gastos.forEach(t => { byCategory[t.category] = (byCategory[t.category] || 0) + (t.amount || 0); });
    const incByCategory = {};
    ingresos.forEach(t => { incByCategory[t.category] = (incByCategory[t.category] || 0) + (t.amount || 0); });

    return { totalIngresos, totalGastos, utilidadBruta, margen, byCategory, incByCategory };
  }, [filteredTx]);

  // Balance General (simplificado)
  const balanceData = useMemo(() => {
    const allIngresos = transactions.filter(t => t.type === 'ingreso').reduce((s, t) => s + (t.amount || 0), 0);
    const allGastos = transactions.filter(t => t.type === 'gasto').reduce((s, t) => s + (t.amount || 0), 0);
    const efectivo = allIngresos - allGastos;
    const totalActivos = efectivo > 0 ? efectivo : 0;
    const patrimonio = efectivo;
    return { efectivo, totalActivos, patrimonio };
  }, [transactions]);

  // Flujo de caja
  const cashFlowData = useMemo(() => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const ms = format(startOfMonth(subMonths(new Date(), i)), 'yyyy-MM');
      const ml = format(startOfMonth(subMonths(new Date(), i)), 'MMM yy', { locale: es });
      const inc = filteredTx.filter(t => t.type === 'ingreso' && t.date?.startsWith(ms)).reduce((s, t) => s + (t.amount || 0), 0);
      const exp = filteredTx.filter(t => t.type === 'gasto' && t.date?.startsWith(ms)).reduce((s, t) => s + (t.amount || 0), 0);
      months.push({ month: ml, ingresos: inc, gastos: exp, neto: inc - exp });
    }
    return months;
  }, [filteredTx]);

  const exportPDF = async () => {
    setExporting(true);
    await new Promise(r => setTimeout(r, 800));
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ format: 'a4' });
    doc.setFontSize(18);
    doc.text(`GEMAILLA AI — ${reportType === 'results' ? 'Estado de Resultados' : reportType === 'balance' ? 'Balance General' : 'Flujo de Caja'}`, 20, 20);
    doc.setFontSize(12);
    doc.text(`${company?.name || ''} · ${periodLabel}`, 20, 32);
    doc.setFontSize(10);
    doc.text(`Generado: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 20, 42);

    if (reportType === 'results') {
      let y = 58;
      doc.setFontSize(11); doc.text('INGRESOS', 20, y); y += 8;
      Object.entries(resultsData.incByCategory).forEach(([k, v]) => {
        doc.setFontSize(9); doc.text(categoryLabels[k] || k, 30, y); doc.text(fmt(v), 150, y, { align: 'right' }); y += 7;
      });
      doc.line(20, y, 190, y); y += 6;
      doc.setFontSize(11); doc.text('Total Ingresos', 20, y); doc.text(fmt(resultsData.totalIngresos), 150, y, { align: 'right' }); y += 12;
      doc.text('GASTOS', 20, y); y += 8;
      Object.entries(resultsData.byCategory).forEach(([k, v]) => {
        doc.setFontSize(9); doc.text(categoryLabels[k] || k, 30, y); doc.text(fmt(v), 150, y, { align: 'right' }); y += 7;
      });
      doc.line(20, y, 190, y); y += 6;
      doc.setFontSize(11); doc.text('Total Gastos', 20, y); doc.text(fmt(resultsData.totalGastos), 150, y, { align: 'right' }); y += 12;
      doc.setFontSize(13); doc.text('UTILIDAD NETA', 20, y); doc.text(fmt(resultsData.utilidadBruta), 150, y, { align: 'right' });
    }

    doc.save(`estado_${reportType}_${periodLabel.replace(/\s/g, '_')}.pdf`);
    setExporting(false);
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={reportType} onValueChange={setReportType}>
          <SelectTrigger className="w-52 bg-secondary border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="results">📊 Estado de Resultados</SelectItem>
            <SelectItem value="balance">⚖️ Balance General</SelectItem>
            <SelectItem value="cashflow">💧 Flujo de Caja</SelectItem>
          </SelectContent>
        </Select>

        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-44 bg-secondary border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="current">Mes actual</SelectItem>
            <SelectItem value="last">Mes anterior</SelectItem>
            <SelectItem value="q1">Q1</SelectItem>
            <SelectItem value="q2">Q2</SelectItem>
            <SelectItem value="q3">Q3</SelectItem>
            <SelectItem value="ytd">Año a la fecha</SelectItem>
            <SelectItem value="year">Año anterior</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto">
          <Button onClick={exportPDF} disabled={exporting} variant="outline" className="border-border gap-2">
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Exportar PDF
          </Button>
        </div>
      </div>

      {/* Report */}
      <div id="financial-report" className="bg-card border border-border rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary/20 to-primary/5 px-6 py-5 border-b border-border">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-1">GEMAILLA AI</p>
              <h2 className="text-xl font-display font-bold text-foreground">
                {reportType === 'results' ? 'Estado de Resultados' : reportType === 'balance' ? 'Balance General' : 'Estado de Flujo de Caja'}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">{company?.name} · {periodLabel}</p>
            </div>
            <Badge variant="outline" className="border-primary/30 text-primary text-xs">
              {format(new Date(), 'dd/MM/yyyy')}
            </Badge>
          </div>
        </div>

        <div className="p-6">
          {/* Estado de Resultados */}
          {reportType === 'results' && (
            <div className="space-y-1">
              <div className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">Ingresos</div>
              {Object.entries(resultsData.incByCategory).map(([k, v]) => (
                <Row key={k} label={categoryLabels[k] || k} value={v} indent />
              ))}
              {!Object.keys(resultsData.incByCategory).length && <Row label="Sin ingresos en el período" value={0} indent />}
              <Row label="Total Ingresos" value={resultsData.totalIngresos} bold positive sub />

              <div className="text-xs font-semibold uppercase tracking-widest text-primary mb-3 mt-5">Gastos y Costos</div>
              {Object.entries(resultsData.byCategory).map(([k, v]) => (
                <Row key={k} label={categoryLabels[k] || k} value={v} indent />
              ))}
              {!Object.keys(resultsData.byCategory).length && <Row label="Sin gastos en el período" value={0} indent />}
              <Row label="Total Gastos" value={resultsData.totalGastos} bold negative sub />

              <div className="mt-6 pt-4 border-t-2 border-primary/30">
                <div className="flex items-center justify-between">
                  <span className="text-base font-bold text-foreground">UTILIDAD NETA</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">Margen: {resultsData.margen.toFixed(1)}%</span>
                    <span className={`text-xl font-bold font-mono ${resultsData.utilidadBruta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {fmt(resultsData.utilidadBruta)}
                    </span>
                    {resultsData.utilidadBruta >= 0 ? <TrendingUp className="w-5 h-5 text-emerald-400" /> : <TrendingDown className="w-5 h-5 text-red-400" />}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Balance General */}
          {reportType === 'balance' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <div className="text-xs font-semibold uppercase tracking-widest text-emerald-400 mb-3">Activos</div>
                <Row label="Efectivo y equivalentes" value={balanceData.efectivo > 0 ? balanceData.efectivo : 0} indent positive={balanceData.efectivo > 0} />
                <Row label="Cuentas por cobrar" value={0} indent />
                <Row label="Inventario" value={0} indent />
                <Row label="Total Activos" value={balanceData.totalActivos} bold sub positive />
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-widest text-red-400 mb-3">Pasivos y Patrimonio</div>
                <Row label="Cuentas por pagar" value={balanceData.efectivo < 0 ? Math.abs(balanceData.efectivo) : 0} indent negative={balanceData.efectivo < 0} />
                <Row label="Total Pasivos" value={balanceData.efectivo < 0 ? Math.abs(balanceData.efectivo) : 0} bold sub />
                <div className="mt-4">
                  <div className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">Patrimonio</div>
                  <Row label="Capital / Resultado del ejercicio" value={balanceData.patrimonio} indent positive={balanceData.patrimonio >= 0} negative={balanceData.patrimonio < 0} />
                  <Row label="Total Patrimonio" value={balanceData.patrimonio} bold sub positive={balanceData.patrimonio >= 0} />
                </div>
              </div>
              <div className="md:col-span-2 pt-4 border-t-2 border-primary/30 flex justify-between items-center">
                <span className="font-bold text-foreground">TOTAL PASIVOS + PATRIMONIO</span>
                <span className="font-bold font-mono text-xl text-primary">{fmt(balanceData.totalActivos)}</span>
              </div>
            </div>
          )}

          {/* Flujo de Caja */}
          {reportType === 'cashflow' && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 text-muted-foreground font-medium">Período</th>
                    <th className="text-right py-2 text-emerald-400 font-medium">Entradas</th>
                    <th className="text-right py-2 text-red-400 font-medium">Salidas</th>
                    <th className="text-right py-2 text-foreground font-medium">Flujo Neto</th>
                  </tr>
                </thead>
                <tbody>
                  {cashFlowData.map((m, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-secondary/30">
                      <td className="py-3 text-foreground font-medium">{m.month}</td>
                      <td className="py-3 text-right font-mono text-emerald-400">{fmt(m.ingresos)}</td>
                      <td className="py-3 text-right font-mono text-red-400">{fmt(m.gastos)}</td>
                      <td className={`py-3 text-right font-mono font-bold ${m.neto >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {m.neto >= 0 ? '+' : ''}{fmt(m.neto)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-primary/30">
                    <td className="py-3 font-bold text-foreground">TOTAL PERÍODO</td>
                    <td className="py-3 text-right font-bold font-mono text-emerald-400">{fmt(cashFlowData.reduce((s, m) => s + m.ingresos, 0))}</td>
                    <td className="py-3 text-right font-bold font-mono text-red-400">{fmt(cashFlowData.reduce((s, m) => s + m.gastos, 0))}</td>
                    <td className={`py-3 text-right font-bold font-mono text-xl ${cashFlowData.reduce((s, m) => s + m.neto, 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {fmt(cashFlowData.reduce((s, m) => s + m.neto, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}