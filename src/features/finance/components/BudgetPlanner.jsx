import React, { useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';

import { askLLM } from '@/modules/ai/aiService';
function fmt(n) { return `$${(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`; }

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-xl p-3 text-xs shadow-xl">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.map((p, i) => <p key={i} style={{ color: p.color }}>{p.name}: {fmt(p.value)}</p>)}
    </div>
  );
}
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import CashFlowVsBudgetChart from './CashFlowVsBudgetChart';
import { Wallet, Plus, Trash2, Loader2, Brain, AlertTriangle, TrendingUp, Target, RefreshCw } from 'lucide-react';
import { format, addMonths } from 'date-fns';
import { es } from 'date-fns/locale';

const CATEGORY_LABELS = {
  ventas: 'Ventas', servicios: 'Servicios', inversiones: 'Inversiones', otros_ingresos: 'Otros Ingresos',
  nómina: 'Nómina', renta: 'Renta', servicios_profesionales: 'Serv. Profesionales', materiales: 'Materiales',
  marketing: 'Marketing', impuestos: 'Impuestos', seguros: 'Seguros', mantenimiento: 'Mantenimiento',
  tecnología: 'Tecnología', transporte: 'Transporte', otros_gastos: 'Otros Gastos',
};

const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS);

export default function BudgetPlanner({ transactions, monthlyData }) {
  // Build budget from average of last 3 months
  const suggestedBudget = useMemo(() => {
    const last3 = monthlyData.slice(-3);
    const avgInc = last3.reduce((s, m) => s + m.ingresos, 0) / (last3.length || 1);
    const avgExp = last3.reduce((s, m) => s + m.gastos, 0) / (last3.length || 1);

    // by category
    const catExp = {};
    transactions.filter(t => t.type === 'gasto').forEach(t => {
      catExp[t.category] = (catExp[t.category] || 0) + (t.amount || 0);
    });
    const months = monthlyData.length || 1;
    const catAvg = Object.fromEntries(Object.entries(catExp).map(([k, v]) => [k, Math.round(v / months)]));
    return { avgInc: Math.round(avgInc), avgExp: Math.round(avgExp), catAvg };
  }, [transactions, monthlyData]);

  const [items, setItems] = useState(() =>
    Object.entries(suggestedBudget.catAvg)
      .filter(([, v]) => v > 0)
      .slice(0, 8)
      .map(([cat, amt]) => ({ id: crypto.randomUUID(), type: 'gasto', category: cat, label: CATEGORY_LABELS[cat] || cat, budgeted: amt }))
      .concat([{ id: crypto.randomUUID(), type: 'ingreso', category: 'ventas', label: 'Ventas', budgeted: suggestedBudget.avgInc }])
  );

  const [newItem, setNewItem] = useState({ type: 'gasto', category: 'nómina', budgeted: '' });
  const [aiLoading, setAiLoading] = useState(false);
  const [aiInsight, setAiInsight] = useState(null);
  const [horizon, setHorizon] = useState('3');

  const totalIngresosBudget = items.filter(i => i.type === 'ingreso').reduce((s, i) => s + (i.budgeted || 0), 0);
  const totalGastosBudget = items.filter(i => i.type === 'gasto').reduce((s, i) => s + (i.budgeted || 0), 0);
  const balanceBudget = totalIngresosBudget - totalGastosBudget;

  // Actual from current month
  const currentMonthStr = format(new Date(), 'yyyy-MM');
  const actualIngresos = transactions.filter(t => t.type === 'ingreso' && t.date?.startsWith(currentMonthStr)).reduce((s, t) => s + (t.amount || 0), 0);
  const actualGastos = transactions.filter(t => t.type === 'gasto' && t.date?.startsWith(currentMonthStr)).reduce((s, t) => s + (t.amount || 0), 0);

  // Projection chart
  const projectionData = useMemo(() => {
    const data = [];
    const h = parseInt(horizon);
    for (let i = 0; i < h; i++) {
      const m = addMonths(new Date(), i);
      const label = format(m, 'MMM yy', { locale: es });
      // Add small growth/variance
      const factor = 1 + (Math.random() * 0.06 - 0.03);
      data.push({
        month: label,
        ingresos_ppto: Math.round(totalIngresosBudget * factor),
        gastos_ppto: Math.round(totalGastosBudget * factor),
        flujo_neto: Math.round(balanceBudget * factor),
      });
    }
    return data;
  }, [totalIngresosBudget, totalGastosBudget, balanceBudget, horizon]);

  const addItem = () => {
    if (!newItem.budgeted || parseFloat(newItem.budgeted) <= 0) return;
    setItems(prev => [...prev, {
      id: crypto.randomUUID(),
      type: newItem.type,
      category: newItem.category,
      label: CATEGORY_LABELS[newItem.category] || newItem.category,
      budgeted: parseFloat(newItem.budgeted),
    }]);
    setNewItem({ type: 'gasto', category: 'nómina', budgeted: '' });
  };

  const removeItem = (id) => setItems(prev => prev.filter(i => i.id !== id));

  const updateBudget = (id, val) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, budgeted: parseFloat(val) || 0 } : i));
  };

  const getAIInsight = async () => {
    setAiLoading(true);
    setAiInsight(null);
    const data = await askLLM({
      companyId: company.id,
      prompt: `Eres un CFO experto en finanzas para PyMEs mexicanas. Analiza este presupuesto mensual:

PRESUPUESTO PLANIFICADO:
- Total Ingresos: $${totalIngresosBudget.toLocaleString()} MXN
- Total Gastos: $${totalGastosBudget.toLocaleString()} MXN
- Flujo Neto: $${balanceBudget.toLocaleString()} MXN
- Partidas: ${items.map(i => `${i.label}(${i.type}): $${i.budgeted.toLocaleString()}`).join(', ')}

DATOS HISTÓRICOS (últimos 3 meses promedio):
- Promedio ingresos: $${suggestedBudget.avgInc.toLocaleString()} MXN
- Promedio gastos: $${suggestedBudget.avgExp.toLocaleString()} MXN

SITUACIÓN ACTUAL (mes en curso):
- Ingresos reales: $${actualIngresos.toLocaleString()} MXN
- Gastos reales: $${actualGastos.toLocaleString()} MXN

Da un análisis conciso (máximo 5 puntos) con:
1. Evaluación del presupuesto vs. histórico
2. Alertas de liquidez o riesgos
3. Partidas que parecen sub o sobre estimadas
4. Recomendaciones de optimización
5. Una proyección de si el flujo de caja es sostenible

Formato: respuesta en viñetas concisas, en español, tono profesional de CFO.`,
    });
    setAiInsight(data);
    setAiLoading(false);
  };

  const incomeItems = items.filter(i => i.type === 'ingreso');
  const expenseItems = items.filter(i => i.type === 'gasto');

  return (
    <div className="space-y-6">
      {/* Summary KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Ingresos Presupuestados', value: totalIngresosBudget, color: 'text-emerald-400', icon: TrendingUp },
          { label: 'Gastos Presupuestados', value: totalGastosBudget, color: 'text-red-400', icon: Wallet },
          { label: 'Flujo Neto Estimado', value: balanceBudget, color: balanceBudget >= 0 ? 'text-emerald-400' : 'text-red-400', icon: Target },
        ].map(({ label, value, color, icon: Icon }) => (
          <div key={label} className="bg-card border border-border rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Icon className={`w-4 h-4 ${color}`} />
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
            <p className={`text-2xl font-bold font-mono ${color}`}>{fmt(value)}</p>
            {value < 0 && <Badge className="mt-1 bg-red-500/10 text-red-400 border-red-500/20 text-xs">⚠️ Déficit</Badge>}
          </div>
        ))}
      </div>

      {/* Current month tracking */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <p className="text-sm font-semibold text-foreground mb-4">Seguimiento mes actual vs. presupuesto</p>
        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Ingresos reales</span>
              <span>{fmt(actualIngresos)} / {fmt(totalIngresosBudget)}</span>
            </div>
            <Progress value={Math.min((actualIngresos / (totalIngresosBudget || 1)) * 100, 100)} className="h-2" />
            {actualIngresos < totalIngresosBudget * 0.5 && (
              <p className="text-xs text-yellow-400 mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Por debajo del 50% del presupuesto</p>
            )}
          </div>
          <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Gastos reales</span>
              <span>{fmt(actualGastos)} / {fmt(totalGastosBudget)}</span>
            </div>
            <Progress value={Math.min((actualGastos / (totalGastosBudget || 1)) * 100, 100)} className="h-2" />
            {actualGastos > totalGastosBudget * 0.9 && (
              <p className="text-xs text-red-400 mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Cerca del límite presupuestal</p>
            )}
          </div>
        </div>
      </div>

      {/* Cash Flow vs Budget Chart */}
      <CashFlowVsBudgetChart transactions={transactions} budgetItems={items} />

      {/* Budget items */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Ingresos */}
        <div>
          <p className="text-sm font-semibold text-emerald-400 mb-3">📈 Ingresos Presupuestados</p>
          <div className="space-y-2">
            {incomeItems.map(item => (
              <div key={item.id} className="flex items-center gap-2 p-2.5 bg-secondary/40 rounded-xl">
                <span className="flex-1 text-sm text-foreground truncate">{item.label}</span>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                  <Input
                    type="number"
                    value={item.budgeted}
                    onChange={e => updateBudget(item.id, e.target.value)}
                    className="w-32 pl-6 h-8 text-xs bg-secondary border-border"
                  />
                </div>
                <Button size="icon" variant="ghost" onClick={() => removeItem(item.id)} className="h-7 w-7 text-muted-foreground hover:text-destructive">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        {/* Gastos */}
        <div>
          <p className="text-sm font-semibold text-red-400 mb-3">💸 Gastos Presupuestados</p>
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {expenseItems.map(item => (
              <div key={item.id} className="flex items-center gap-2 p-2.5 bg-secondary/40 rounded-xl">
                <span className="flex-1 text-sm text-foreground truncate">{item.label}</span>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                  <Input
                    type="number"
                    value={item.budgeted}
                    onChange={e => updateBudget(item.id, e.target.value)}
                    className="w-32 pl-6 h-8 text-xs bg-secondary border-border"
                  />
                </div>
                <Button size="icon" variant="ghost" onClick={() => removeItem(item.id)} className="h-7 w-7 text-muted-foreground hover:text-destructive">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Add item */}
      <div className="flex flex-wrap items-end gap-3 p-4 bg-secondary/30 rounded-2xl border border-border">
        <div>
          <Label className="text-xs text-muted-foreground">Tipo</Label>
          <Select value={newItem.type} onValueChange={v => setNewItem(p => ({ ...p, type: v }))}>
            <SelectTrigger className="w-28 h-9 bg-secondary border-border text-sm mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ingreso">Ingreso</SelectItem>
              <SelectItem value="gasto">Gasto</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Categoría</Label>
          <Select value={newItem.category} onValueChange={v => setNewItem(p => ({ ...p, category: v }))}>
            <SelectTrigger className="w-44 h-9 bg-secondary border-border text-sm mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ALL_CATEGORIES.map(c => <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Monto mensual</Label>
          <Input
            type="number"
            value={newItem.budgeted}
            onChange={e => setNewItem(p => ({ ...p, budgeted: e.target.value }))}
            placeholder="0.00"
            className="w-36 h-9 bg-secondary border-border text-sm mt-1"
          />
        </div>
        <Button onClick={addItem} size="sm" className="bg-primary text-primary-foreground gap-1.5 h-9">
          <Plus className="w-4 h-4" /> Agregar
        </Button>
      </div>

      {/* Projection chart */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold text-foreground">Proyección de Flujo de Caja</p>
          <Select value={horizon} onValueChange={setHorizon}>
            <SelectTrigger className="w-36 h-8 bg-secondary border-border text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3">3 meses</SelectItem>
              <SelectItem value="6">6 meses</SelectItem>
              <SelectItem value="12">12 meses</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={projectionData}>
            <defs>
              <linearGradient id="gi" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="ge" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 14%)" />
            <XAxis dataKey="month" tick={{ fill: 'hsl(0 0% 50%)', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: 'hsl(0 0% 50%)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={0} stroke="hsl(0 0% 30%)" strokeDasharray="4 4" />
            <Area type="monotone" dataKey="ingresos_ppto" name="Ingresos" stroke="#10b981" fill="url(#gi)" strokeWidth={2} />
            <Area type="monotone" dataKey="gastos_ppto" name="Gastos" stroke="#ef4444" fill="url(#ge)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* AI Insight */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Brain className="w-4 h-4 text-primary" /> Análisis IA del Presupuesto
          </p>
          <Button size="sm" variant="outline" onClick={getAIInsight} disabled={aiLoading} className="gap-2 border-border">
            {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {aiLoading ? 'Analizando...' : aiInsight ? 'Re-analizar' : 'Analizar'}
          </Button>
        </div>
        {!aiInsight && !aiLoading && (
          <p className="text-sm text-muted-foreground">Haz clic en "Analizar" para que la IA evalúe tu presupuesto, detecte riesgos de liquidez y dé recomendaciones de optimización.</p>
        )}
        {aiLoading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin text-primary" /> Consultando al CFO virtual...</div>}
        {aiInsight && (
          <div className="prose prose-sm prose-invert max-w-none text-sm text-muted-foreground leading-relaxed">
            <ReactMarkdown>{aiInsight}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );

}
