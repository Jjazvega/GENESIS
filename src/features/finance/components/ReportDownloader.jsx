import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

export default function ReportDownloader({ transactions, company }) {
  const [loading, setLoading] = useState(false);

  const downloadPDF = async () => {
    try {
      setLoading(true);
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF();

      // Header
      doc.setFontSize(20);
      doc.setTextColor(197, 160, 89);
      doc.text('GEMAILLA AI', 15, 20);

      doc.setFontSize(14);
      doc.setTextColor(232, 213, 163);
      doc.text('Reporte de Gastos y Transacciones', 15, 30);

      // Company info
      doc.setFontSize(10);
      doc.setTextColor(169, 169, 169);
      doc.text(`Empresa: ${company.name}`, 15, 42);
      doc.text(`Fecha de generación: ${new Date().toLocaleDateString('es-MX')}`, 15, 48);

      // Summary
      const income = transactions.filter(t => t.type === 'ingreso').reduce((s, t) => s + (t.amount || 0), 0);
      const expenses = transactions.filter(t => t.type === 'gasto').reduce((s, t) => s + (t.amount || 0), 0);
      const balance = income - expenses;

      doc.setFontSize(12);
      doc.setTextColor(232, 213, 163);
      doc.text('RESUMEN FINANCIERO', 15, 60);

      doc.setFontSize(10);
      doc.setTextColor(200, 200, 200);
      doc.text(`Total Ingresos: $${income.toLocaleString('es-MX', { maximumFractionDigits: 2 })}`, 15, 70);
      doc.text(`Total Gastos: $${expenses.toLocaleString('es-MX', { maximumFractionDigits: 2 })}`, 15, 76);
      if (balance >= 0) {
        doc.setTextColor(76, 175, 80);
      } else {
        doc.setTextColor(244, 67, 54);
      }
      doc.text(`Balance: $${balance.toLocaleString('es-MX', { maximumFractionDigits: 2 })}`, 15, 82);

      // Transactions table
      doc.setFontSize(11);
      doc.setTextColor(232, 213, 163);
      doc.text('TRANSACCIONES DETALLADAS', 15, 95);

      const tableData = transactions.map(t => [
        t.date || '',
        t.type === 'ingreso' ? 'Ingreso' : 'Gasto',
        t.category || '',
        t.description || '',
        `$${(t.amount || 0).toLocaleString('es-MX', { maximumFractionDigits: 2 })}`,
      ]);

      doc.autoTable({
        head: [['Fecha', 'Tipo', 'Categoría', 'Descripción', 'Monto']],
        body: tableData,
        startY: 100,
        headStyles: { fillColor: [197, 160, 89], textColor: [10, 10, 10], fontSize: 9 },
        bodyStyles: { textColor: [200, 200, 200], fontSize: 8 },
        alternateRowStyles: { fillColor: [15, 15, 15] },
        margin: { left: 15, right: 15 },
      });

      // Footer
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        doc.text(`Página ${i} de ${pageCount}`, doc.internal.pageSize.getWidth() / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' });
      }

      doc.save(`Reporte_${company.name}_${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success('PDF descargado exitosamente');
    } catch (error) {
      toast.error('Error al descargar PDF');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const downloadExcel = async () => {
    try {
      setLoading(true);

      // Build CSV
      const headers = ['Fecha', 'Tipo', 'Categoría', 'Descripción', 'Monto'];
      const rows = transactions.map(t => [
        t.date || '',
        t.type === 'ingreso' ? 'Ingreso' : 'Gasto',
        t.category || '',
        t.description || '',
        t.amount || 0,
      ]);

      // Summary section
      const income = transactions.filter(t => t.type === 'ingreso').reduce((s, t) => s + (t.amount || 0), 0);
      const expenses = transactions.filter(t => t.type === 'gasto').reduce((s, t) => s + (t.amount || 0), 0);
      const balance = income - expenses;

      const csv = [
        `GEMAILLA AI - Reporte de Gastos y Transacciones`,
        `Empresa: ${company.name}`,
        `Fecha: ${new Date().toLocaleDateString('es-MX')}`,
        '',
        'RESUMEN FINANCIERO',
        `Total Ingresos,${income}`,
        `Total Gastos,${expenses}`,
        `Balance,${balance}`,
        '',
        headers.join(','),
        ...rows.map(r => r.join(',')),
      ].join('\n');

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `Reporte_${company.name}_${new Date().toISOString().slice(0, 10)}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success('Excel descargado exitosamente');
    } catch (error) {
      toast.error('Error al descargar Excel');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={loading || !transactions.length}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {loading ? 'Descargando...' : 'Descargar Reporte'}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={downloadPDF} disabled={loading}>
          📄 Descargar como PDF
        </DropdownMenuItem>
        <DropdownMenuItem onClick={downloadExcel} disabled={loading}>
          📊 Descargar como Excel
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}