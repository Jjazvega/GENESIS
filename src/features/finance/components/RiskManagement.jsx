import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShieldAlert, Loader2, Brain, AlertTriangle, CheckCircle2, TrendingDown, Scale, RefreshCw, Lock, CalendarDays, CalendarRange, CalendarCheck, Zap } from 'lucide-react';

import { askLLM } from '@/modules/ai/aiService';
const RISK_COLORS = {
  alto: { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400', badge: 'bg-red-500/20 text-red-400 border-red-500/30' },
  medio: { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', text: 'text-yellow-400', badge: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  bajo: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400', badge: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
};

const RISK_ICONS = { alto: AlertTriangle, medio: TrendingDown, bajo: CheckCircle2 };

const BUDGET_LIMITS = {
  daily: { label: 'Presupuesto diario', icon: CalendarDays, days: 1 },
  weekly: { label: 'Presupuesto semanal', icon: CalendarRange, days: 7 },
  monthly: { label: 'Presupuesto mensual', icon: CalendarCheck, days: 30 },
};

const DEFAULT_BUDGET_LIMITS = { daily: 5000, weekly: 25000, monthly: 100000 };
const DEFAULT_EMPLOYEE_QUOTA = { dailyLimitUsd: 2, monthlyLimitUsd: 25, role: 'employee' };
const USD_TO_MXN_REFERENCE_RATE = 17;
const ABUSE_RULES = { maxPromptsPerTenMinutes: 50, repeatedPromptThreshold: 5, laborStartHour: 8, laborEndHour: 19, spikeThresholdPercent: 300, highCostApprovalUsd: 0.25 };
const RISK_SCORE_LABELS = [
  { min: 61, label: 'bloqueo temporal', className: 'text-red-400 bg-red-500/20 border-red-500/30' },
  { min: 31, label: 'advertencia', className: 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30' },
  { min: 0, label: 'normal', className: 'text-emerald-400 bg-emerald-500/20 border-emerald-500/30' },
];

function fmtCurrency(value) {
  return `$${(value || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN`;
}

function getEventDate(event) {
  const rawDate = event?.createdAt || event?.updatedAt || event?.date;
  if (!rawDate) return null;
  const date = new Date(rawDate);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getTransactionDate(transaction) {
  if (!transaction?.date) return null;
  const date = new Date(`${transaction.date}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getStartOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function normalizePrompt(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function getRiskLabel(score) {
  return RISK_SCORE_LABELS.find(item => score >= item.min) || RISK_SCORE_LABELS.at(-1);
}

function estimateAiCostUsd(conversation) {
  if (Number.isFinite(Number(conversation?.estimatedCost))) return Number(conversation.estimatedCost);
  if (Number.isFinite(Number(conversation?.estimatedCostUsd))) return Number(conversation.estimatedCostUsd);
  if (Number.isFinite(Number(conversation?.costUsd))) return Number(conversation.costUsd);
  const promptLength = String(conversation?.query || conversation?.prompt || '').length;
  const responseLength = String(conversation?.response || '').length;
  return ((promptLength + responseLength) / 1000) * 0.01;
}

function amountToUsd(transaction) {
  const amount = Number(transaction?.amount) || 0;
  return transaction?.currency === 'USD' ? amount : amount / USD_TO_MXN_REFERENCE_RATE;
}

function getWindowStart(period) {
  const start = getStartOfToday();
  if (period === 'weekly') {
    const day = start.getDay();
    const diff = day === 0 ? 6 : day - 1;
    start.setDate(start.getDate() - diff);
  }
  if (period === 'monthly') {
    start.setDate(1);
  }
  return start;
}

export default function RiskManagement({ transactions, monthlyData, company, memberships = [], currentUser = null, aiConversations = [] }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [budgetLimits, setBudgetLimits] = useState(DEFAULT_BUDGET_LIMITS);

  const budgetControls = useMemo(() => {
    const expenses = transactions.filter(t => t.type === 'gasto');

    return Object.entries(BUDGET_LIMITS).map(([period, config]) => {
      const windowStart = getWindowStart(period);
      const spent = expenses.reduce((sum, transaction) => {
        const transactionDate = getTransactionDate(transaction);
        if (!transactionDate || transactionDate < windowStart) return sum;
        return sum + (transaction.amount || 0);
      }, 0);
      const limit = Number(budgetLimits[period]) || 0;
      const usage = limit > 0 ? (spent / limit) * 100 : 0;
      const isCutOff = limit > 0 && spent >= limit;
      const isWarning = !isCutOff && limit > 0 && usage >= 85;
      const remaining = Math.max(limit - spent, 0);

      return { period, ...config, spent, limit, usage, isCutOff, isWarning, remaining };
    });
  }, [budgetLimits, transactions]);

  const employeeQuotaControls = useMemo(() => {
    const roster = memberships.length > 0
      ? memberships
      : currentUser
        ? [{
          userUid: currentUser.uid || currentUser.id,
          userEmail: currentUser.email,
          userName: currentUser.fullName || currentUser.email,
          role: DEFAULT_EMPLOYEE_QUOTA.role,
        }]
        : [];

    return roster.map((member) => {
      const userUid = member.userUid || member.uid || member.id;
      const quota = {
        dailyLimitUsd: Number(member.dailyLimitUsd ?? DEFAULT_EMPLOYEE_QUOTA.dailyLimitUsd),
        monthlyLimitUsd: Number(member.monthlyLimitUsd ?? DEFAULT_EMPLOYEE_QUOTA.monthlyLimitUsd),
        role: member.role || DEFAULT_EMPLOYEE_QUOTA.role,
      };
      const dailyStart = getWindowStart('daily');
      const monthlyStart = getWindowStart('monthly');
      const memberExpenses = transactions.filter((transaction) => transaction.type === 'gasto' && transaction.createdBy === userUid);
      const spentTodayUsd = memberExpenses.reduce((sum, transaction) => {
        const transactionDate = getTransactionDate(transaction);
        if (!transactionDate || transactionDate < dailyStart) return sum;
        return sum + amountToUsd(transaction);
      }, 0);
      const spentMonthUsd = memberExpenses.reduce((sum, transaction) => {
        const transactionDate = getTransactionDate(transaction);
        if (!transactionDate || transactionDate < monthlyStart) return sum;
        return sum + amountToUsd(transaction);
      }, 0);
      const dailyUsage = quota.dailyLimitUsd > 0 ? (spentTodayUsd / quota.dailyLimitUsd) * 100 : 0;
      const monthlyUsage = quota.monthlyLimitUsd > 0 ? (spentMonthUsd / quota.monthlyLimitUsd) * 100 : 0;

      return {
        userUid,
        name: member.userName || member.fullName || member.userEmail || member.email || 'Usuario sin nombre',
        email: member.userEmail || member.email || '',
        quota,
        spentTodayUsd,
        spentMonthUsd,
        dailyUsage,
        monthlyUsage,
        isDailyCutOff: quota.dailyLimitUsd > 0 && spentTodayUsd >= quota.dailyLimitUsd,
        isMonthlyCutOff: quota.monthlyLimitUsd > 0 && spentMonthUsd >= quota.monthlyLimitUsd,
      };
    });
  }, [currentUser, memberships, transactions]);

  const aiFraudControls = useMemo(() => {
    const now = new Date();
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
    const todayStart = getWindowStart('daily');
    const monthStart = getWindowStart('monthly');
    const daysElapsed = Math.max(now.getDate(), 1);
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const conversations = aiConversations
      .map((conversation) => ({
        ...conversation,
        eventDate: getEventDate(conversation),
        estimatedCostUsd: estimateAiCostUsd(conversation),
        userKey: conversation.createdBy || conversation.userUid || conversation.userEmail || 'sin_usuario',
        department: conversation.department || conversation.area || 'Sin departamento',
        model: conversation.model || conversation.modelName || 'modelo no especificado',
      }))
      .filter(conversation => conversation.eventDate);

    const recentPrompts = conversations.filter(conversation => conversation.eventDate >= tenMinutesAgo);
    const promptCounts = recentPrompts.reduce((acc, conversation) => {
      const key = conversation.userKey;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const repeatedPrompts = conversations.reduce((acc, conversation) => {
      const key = normalizePrompt(conversation.query || conversation.prompt);
      if (!key) return acc;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const offHoursEvents = conversations.filter((conversation) => {
      const hour = conversation.eventDate.getHours();
      return hour < ABUSE_RULES.laborStartHour || hour >= ABUSE_RULES.laborEndHour;
    });
    const monthEvents = conversations.filter(conversation => conversation.eventDate >= monthStart);
    const todayEvents = conversations.filter(conversation => conversation.eventDate >= todayStart);
    const todayCost = todayEvents.reduce((sum, conversation) => sum + conversation.estimatedCostUsd, 0);
    const monthCost = monthEvents.reduce((sum, conversation) => sum + conversation.estimatedCostUsd, 0);
    const historicalDailyAverage = Math.max((monthCost - todayCost) / Math.max(daysElapsed - 1, 1), 0.01);
    const spikePercent = (todayCost / historicalDailyAverage) * 100;
    const pendingApprovals = conversations.filter(conversation => conversation.estimatedCostUsd > ABUSE_RULES.highCostApprovalUsd).map(conversation => ({
      ...conversation,
      approvalStatus: conversation.status === 'approved' ? 'approved' : 'pendingApproval',
    }));

    const excessiveRequests = Object.values(promptCounts).some(count => count > ABUSE_RULES.maxPromptsPerTenMinutes) ? 30 : 0;
    const repeatedPromptScore = Object.values(repeatedPrompts).some(count => count >= ABUSE_RULES.repeatedPromptThreshold) ? 25 : 0;
    const offHoursUsage = offHoursEvents.length > 0 ? 20 : 0;
    const budgetSpike = spikePercent > ABUSE_RULES.spikeThresholdPercent ? 25 : 0;
    const riskScore = Math.min(excessiveRequests + repeatedPromptScore + offHoursUsage + budgetSpike, 100);

    const sumBy = (key) => Object.entries(monthEvents.reduce((acc, conversation) => {
      const value = conversation[key] || 'No especificado';
      acc[value] = (acc[value] || 0) + conversation.estimatedCostUsd;
      return acc;
    }, {})).sort((a, b) => b[1] - a[1]).slice(0, 5);

    return {
      alerts: [
        { label: 'Más de 50 prompts en 10 minutos', active: excessiveRequests > 0, detail: `${Math.max(0, ...Object.values(promptCounts))} prompts máximos por usuario` },
        { label: 'Prompts repetidos masivamente', active: repeatedPromptScore > 0, detail: `${Math.max(0, ...Object.values(repeatedPrompts))} repeticiones máximas` },
        { label: 'Consumo fuera del horario laboral', active: offHoursUsage > 0, detail: `${offHoursEvents.length} eventos fuera de ${ABUSE_RULES.laborStartHour}:00-${ABUSE_RULES.laborEndHour}:00` },
        { label: 'Incremento >300% vs promedio histórico', active: budgetSpike > 0, detail: `${Math.round(spikePercent)}% del promedio diario` },
      ],
      riskScore,
      riskLabel: getRiskLabel(riskScore),
      pendingApprovals,
      dashboard: {
        todayCost,
        monthCost,
        topUsers: sumBy('userKey'),
        topDepartments: sumBy('department'),
        costByModel: sumBy('model'),
        projectedMonthEnd: (monthCost / daysElapsed) * daysInMonth,
      },
    };
  }, [aiConversations]);

  const activeCutoffs = budgetControls.filter(control => control.isCutOff);
  const activeEmployeeCutoffs = employeeQuotaControls.filter(control => control.isDailyCutOff || control.isMonthlyCutOff);
  const blockedTransactions = activeCutoffs.length > 0 || activeEmployeeCutoffs.length > 0 || aiFraudControls.riskScore > 60;

  const updateBudgetLimit = (period, value) => {
    setBudgetLimits(prev => ({ ...prev, [period]: Math.max(Number(value) || 0, 0) }));
  };

  const analyzeRisks = async () => {
    setLoading(true);
    setResult(null);

    const totalIngresos = transactions.filter(t => t.type === 'ingreso').reduce((s, t) => s + (t.amount || 0), 0);
    const totalGastos = transactions.filter(t => t.type === 'gasto').reduce((s, t) => s + (t.amount || 0), 0);
    const balance = totalIngresos - totalGastos;
    const margen = totalIngresos > 0 ? ((balance / totalIngresos) * 100).toFixed(1) : 0;

    const catGastos = {};
    transactions.filter(t => t.type === 'gasto').forEach(t => {
      catGastos[t.category] = (catGastos[t.category] || 0) + (t.amount || 0);
    });

    const lastMonths = monthlyData.slice(-3);
    const trendIngresos = lastMonths.length >= 2
      ? ((lastMonths[lastMonths.length - 1].ingresos - lastMonths[0].ingresos) / (lastMonths[0].ingresos || 1) * 100).toFixed(1)
      : 0;

    const prompt = `Eres un experto en gestión de riesgos financieros y cumplimiento normativo para empresas mexicanas (SAT, IMSS, INFONAVIT, Ley General de Sociedades Mercantiles).

Analiza los siguientes datos financieros de la empresa "${company?.name}" y genera un análisis completo de riesgos:

DATOS FINANCIEROS:
- Ingresos totales: $${totalIngresos.toLocaleString()} MXN
- Gastos totales: $${totalGastos.toLocaleString()} MXN  
- Balance neto: $${balance.toLocaleString()} MXN
- Margen operativo: ${margen}%
- Tendencia ingresos últimos 3 meses: ${trendIngresos}%
- Top categorías de gasto: ${Object.entries(catGastos).sort((a,b) => b[1]-a[1]).slice(0,5).map(([k,v]) => `${k}: $${v.toLocaleString()}`).join(', ')}
- Meses con flujo negativo: ${monthlyData.filter(m => m.ingresos - m.gastos < 0).length} de ${monthlyData.length}

Responde ÚNICAMENTE con un JSON con esta estructura exacta:
{
  "resumen_ejecutivo": "párrafo de 2-3 oraciones con el estado general de riesgo",
  "nivel_riesgo_global": "alto|medio|bajo",
  "riesgos": [
    {
      "categoria": "Liquidez|Fiscal|Cumplimiento|Operacional|Concentración|Tendencia",
      "titulo": "...",
      "descripcion": "...",
      "nivel": "alto|medio|bajo",
      "impacto": "...",
      "mitigacion": "acción concreta recomendada"
    }
  ],
  "acciones_inmediatas": ["acción 1", "acción 2", "acción 3"],
  "cumplimiento_normativo": {
    "sat": "observación sobre obligaciones SAT",
    "imss": "observación sobre obligaciones IMSS/INFONAVIT",
    "general": "observación general de cumplimiento"
  }
}`;

    const data = await askLLM({
      companyId: company?.id,
      prompt,
      response_json_schema: {
        type: 'object',
        properties: {
          resumen_ejecutivo: { type: 'string' },
          nivel_riesgo_global: { type: 'string' },
          riesgos: { type: 'array', items: { type: 'object' } },
          acciones_inmediatas: { type: 'array', items: { type: 'string' } },
          cumplimiento_normativo: { type: 'object' },
        }
      }
    });
    setResult(data);
    setLoading(false);
  };

  const globalColors = result ? RISK_COLORS[result.nivel_riesgo_global] || RISK_COLORS.medio : null;

  return (
    <div className="space-y-6">
      {/* Real-time budget controls */}
      <div className="bg-card border border-border rounded-2xl p-5 space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ShieldAlert className="w-5 h-5 text-primary" />
              <h3 className="text-base font-semibold text-foreground">Módulo de Protección Financiera Anti-Fraude</h3>
            </div>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Controla presupuesto diario, semanal y mensual en tiempo real. Si el gasto supera cualquier límite, el módulo activa un corte automático preventivo para bloquear nuevas erogaciones no autorizadas.
            </p>
          </div>
          <Badge className={`${blockedTransactions ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'} border w-fit`}>
            {blockedTransactions ? <Lock className="w-3 h-3 mr-1" /> : <Zap className="w-3 h-3 mr-1" />}
            {blockedTransactions ? 'Corte automático activo' : 'Operación habilitada'}
          </Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {budgetControls.map((control) => {
            const Icon = control.icon;
            return (
              <div
                key={control.period}
                className={`rounded-xl border p-4 ${control.isCutOff ? 'bg-red-500/10 border-red-500/30' : control.isWarning ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-secondary/30 border-border'}`}
              >
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${control.isCutOff ? 'text-red-400' : control.isWarning ? 'text-yellow-400' : 'text-primary'}`} />
                    <span className="text-sm font-semibold text-foreground">{control.label}</span>
                  </div>
                  <Badge className={`${control.isCutOff ? 'bg-red-500/20 text-red-400 border-red-500/30' : control.isWarning ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'} border text-xs`}>
                    {Math.round(control.usage)}%
                  </Badge>
                </div>

                <label className="text-xs text-muted-foreground" htmlFor={`limit-${control.period}`}>Límite máximo</label>
                <div className="relative mt-1 mb-3">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                  <input
                    id={`limit-${control.period}`}
                    type="number"
                    min="0"
                    value={control.limit}
                    onChange={(event) => updateBudgetLimit(control.period, event.target.value)}
                    className="w-full rounded-lg border border-border bg-background py-2 pl-7 pr-3 text-sm text-foreground outline-none focus:border-primary"
                  />
                </div>

                <div className="h-2 rounded-full bg-background overflow-hidden mb-3">
                  <div
                    className={`h-full rounded-full ${control.isCutOff ? 'bg-red-500' : control.isWarning ? 'bg-yellow-500' : 'bg-primary'}`}
                    style={{ width: `${Math.min(control.usage, 100)}%` }}
                  />
                </div>

                <div className="space-y-1 text-xs text-muted-foreground">
                  <p>Gastado en ventana actual: <span className="font-mono text-foreground">{fmtCurrency(control.spent)}</span></p>
                  <p>Disponible antes del corte: <span className="font-mono text-foreground">{fmtCurrency(control.remaining)}</span></p>
                  {control.isCutOff && (
                    <p className="flex items-center gap-1 text-red-400 font-medium"><Lock className="w-3 h-3" /> Nuevos gastos deben pausarse o aprobarse manualmente.</p>
                  )}
                  {control.isWarning && (
                    <p className="flex items-center gap-1 text-yellow-400 font-medium"><AlertTriangle className="w-3 h-3" /> Umbral preventivo: revisa pagos antes de continuar.</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="border-t border-border pt-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
            <div>
              <p className="text-sm font-semibold text-foreground">Nivel 2 — Cuotas por empleado</p>
              <p className="text-xs text-muted-foreground">Cada usuario opera con cuota individual en USD: <code className="text-primary">{JSON.stringify(DEFAULT_EMPLOYEE_QUOTA)}</code></p>
            </div>
            <Badge className="bg-secondary text-muted-foreground border-border border w-fit">Referencia: 1 USD ≈ {USD_TO_MXN_REFERENCE_RATE} MXN</Badge>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {employeeQuotaControls.map((employee) => {
              const isCutOff = employee.isDailyCutOff || employee.isMonthlyCutOff;
              return (
                <div key={employee.userUid || employee.email} className={`rounded-xl border p-4 ${isCutOff ? 'bg-red-500/10 border-red-500/30' : 'bg-secondary/30 border-border'}`}>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{employee.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{employee.email || employee.userUid}</p>
                    </div>
                    <Badge className={`${isCutOff ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'} border text-xs`}>
                      {employee.quota.role}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>Diario</span>
                        <span>${employee.spentTodayUsd.toFixed(2)} / ${employee.quota.dailyLimitUsd.toFixed(2)} USD</span>
                      </div>
                      <div className="h-2 rounded-full bg-background overflow-hidden">
                        <div className={`h-full rounded-full ${employee.isDailyCutOff ? 'bg-red-500' : employee.dailyUsage >= 85 ? 'bg-yellow-500' : 'bg-primary'}`} style={{ width: `${Math.min(employee.dailyUsage, 100)}%` }} />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>Mensual</span>
                        <span>${employee.spentMonthUsd.toFixed(2)} / ${employee.quota.monthlyLimitUsd.toFixed(2)} USD</span>
                      </div>
                      <div className="h-2 rounded-full bg-background overflow-hidden">
                        <div className={`h-full rounded-full ${employee.isMonthlyCutOff ? 'bg-red-500' : employee.monthlyUsage >= 85 ? 'bg-yellow-500' : 'bg-primary'}`} style={{ width: `${Math.min(employee.monthlyUsage, 100)}%` }} />
                      </div>
                    </div>
                  </div>

                  {isCutOff && (
                    <p className="flex items-center gap-1 text-xs text-red-400 font-medium mt-3"><Lock className="w-3 h-3" /> Corte por cuota individual: requiere autorización de manager/finanzas.</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="border-t border-border pt-5 space-y-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">Nivel 3-6 — Abuso, aprobaciones, dashboard y risk score</p>
              <p className="text-xs text-muted-foreground">Reglas: &gt;50 prompts/10 min, repetición masiva, uso fuera de horario, spike &gt;300%, aprobación si costo &gt; $0.25 USD.</p>
            </div>
            <Badge className={`${aiFraudControls.riskLabel.className} border w-fit`}>Risk score {aiFraudControls.riskScore}/100 — {aiFraudControls.riskLabel.label}</Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {aiFraudControls.alerts.map((alert) => (
              <div key={alert.label} className={`rounded-xl border p-3 ${alert.active ? 'bg-red-500/10 border-red-500/30' : 'bg-secondary/30 border-border'}`}>
                <p className={`text-xs font-semibold ${alert.active ? 'text-red-400' : 'text-emerald-400'}`}>{alert.active ? 'Alerta activa' : 'Normal'}</p>
                <p className="text-sm text-foreground mt-1">{alert.label}</p>
                <p className="text-xs text-muted-foreground mt-1">{alert.detail}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-xl border border-border bg-secondary/30 p-4">
              <p className="text-xs text-muted-foreground">Gasto hoy</p>
              <p className="text-2xl font-bold font-mono text-foreground">${aiFraudControls.dashboard.todayCost.toFixed(2)} USD</p>
            </div>
            <div className="rounded-xl border border-border bg-secondary/30 p-4">
              <p className="text-xs text-muted-foreground">Gasto mes</p>
              <p className="text-2xl font-bold font-mono text-foreground">${aiFraudControls.dashboard.monthCost.toFixed(2)} USD</p>
            </div>
            <div className="rounded-xl border border-border bg-secondary/30 p-4">
              <p className="text-xs text-muted-foreground">Proyección cierre de mes</p>
              <p className="text-2xl font-bold font-mono text-foreground">${aiFraudControls.dashboard.projectedMonthEnd.toFixed(2)} USD</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {[
              ['Top usuarios consumidores', aiFraudControls.dashboard.topUsers],
              ['Top departamentos consumidores', aiFraudControls.dashboard.topDepartments],
              ['Costo por modelo', aiFraudControls.dashboard.costByModel],
            ].map(([title, rows]) => (
              <div key={title} className="rounded-xl border border-border bg-card p-4">
                <p className="text-sm font-semibold text-foreground mb-3">{title}</p>
                <div className="space-y-2">
                  {rows.length === 0 && <p className="text-xs text-muted-foreground">Sin consumo registrado.</p>}
                  {rows.map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-3 text-xs">
                      <span className="text-muted-foreground truncate">{label}</span>
                      <span className="font-mono text-foreground">${value.toFixed(2)} USD</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {aiFraudControls.pendingApprovals.length > 0 && (
            <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4">
              <p className="text-sm font-semibold text-yellow-400 mb-3">Nivel 4 — Pendientes de aprobación por costo alto</p>
              <div className="space-y-2">
                {aiFraudControls.pendingApprovals.slice(0, 5).map((item) => (
                  <div key={item.id || item.correlationId} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between text-xs">
                    <span className="text-muted-foreground truncate">{item.userEmail || item.userKey} — {item.query || 'Solicitud IA'}</span>
                    <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 border w-fit">{item.approvalStatus} · ${item.estimatedCostUsd.toFixed(2)} USD</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* CTA */}
      {!result && !loading && (
        <div className="text-center py-16 border border-dashed border-border rounded-2xl bg-secondary/20">
          <ShieldAlert className="w-12 h-12 text-primary mx-auto mb-4 opacity-70" />
          <h3 className="text-lg font-semibold text-foreground mb-2">Análisis de Riesgos con IA</h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
            La IA analizará tus datos financieros para detectar amenazas de liquidez, riesgos fiscales, cumplimiento normativo (SAT, IMSS) y más.
          </p>
          <Button onClick={analyzeRisks} className="bg-primary text-primary-foreground gap-2">
            <Brain className="w-4 h-4" /> Analizar Riesgos Ahora
          </Button>
        </div>
      )}

      {loading && (
        <div className="text-center py-20">
          <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Analizando riesgos financieros y normativos...</p>
        </div>
      )}

      {result && (
        <div className="space-y-5">
          {/* Refresh */}
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={analyzeRisks} className="gap-2 border-border">
              <RefreshCw className="w-3.5 h-3.5" /> Re-analizar
            </Button>
          </div>

          {/* Nivel global */}
          <div className={`p-5 rounded-2xl border ${globalColors?.bg} ${globalColors?.border}`}>
            <div className="flex items-center gap-3 mb-2">
              <ShieldAlert className={`w-6 h-6 ${globalColors?.text}`} />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nivel de Riesgo Global</p>
                <div className="flex items-center gap-2">
                  <span className={`text-xl font-bold capitalize ${globalColors?.text}`}>{result.nivel_riesgo_global}</span>
                  <Badge className={`${globalColors?.badge} border text-xs`}>{result.riesgos?.length || 0} riesgos identificados</Badge>
                </div>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">{result.resumen_ejecutivo}</p>
          </div>

          {/* Riesgos */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {result.riesgos?.map((r, i) => {
              const colors = RISK_COLORS[r.nivel] || RISK_COLORS.medio;
              const Icon = RISK_ICONS[r.nivel] || AlertTriangle;
              return (
                <div key={i} className={`p-4 rounded-xl border ${colors.bg} ${colors.border}`}>
                  <div className="flex items-start gap-3">
                    <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${colors.text}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-sm font-semibold text-foreground">{r.titulo}</span>
                        <Badge className={`${colors.badge} border text-xs capitalize`}>{r.nivel}</Badge>
                        <span className="text-xs text-muted-foreground">{r.categoria}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mb-2">{r.descripcion}</p>
                      <div className="bg-background/50 rounded-lg p-2.5">
                        <p className="text-xs font-medium text-foreground mb-0.5">Impacto:</p>
                        <p className="text-xs text-muted-foreground">{r.impacto}</p>
                        <p className="text-xs font-medium text-primary mt-2 mb-0.5">Mitigación:</p>
                        <p className="text-xs text-muted-foreground">{r.mitigacion}</p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Acciones inmediatas */}
          {result.acciones_inmediatas?.length > 0 && (
            <div className="p-5 bg-primary/5 border border-primary/20 rounded-2xl">
              <p className="text-sm font-semibold text-primary mb-3 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> Acciones Inmediatas Recomendadas
              </p>
              <ol className="space-y-2">
                {result.acciones_inmediatas.map((a, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                    <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                    {a}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Cumplimiento normativo */}
          {result.cumplimiento_normativo && (
            <div className="p-5 bg-card border border-border rounded-2xl">
              <p className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Scale className="w-4 h-4 text-primary" /> Cumplimiento Normativo
              </p>
              <div className="space-y-3">
                {Object.entries(result.cumplimiento_normativo).map(([k, v]) => (
                  <div key={k}>
                    <span className="text-xs font-semibold uppercase tracking-wide text-primary">{k.toUpperCase()}</span>
                    <p className="text-sm text-muted-foreground mt-0.5">{v}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
