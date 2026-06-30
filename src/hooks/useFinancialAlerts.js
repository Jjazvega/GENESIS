import { useMemo } from 'react';

const EXPENSE_RATIO_WARNING = 80;   // gastos > 80% de ingresos
const EXPENSE_RATIO_CRITICAL = 95;  // gastos > 95% de ingresos
const ANOMALY_SPIKE_THRESHOLD = 2.0; // gasto mensual > 2x la media histórica
const INCOME_DROP_THRESHOLD = 0.6;  // ingresos recientes < 60% de la media histórica
const MIN_MONTHS_FOR_ANOMALY = 3;   // necesitamos al menos 3 meses para detectar anomalías

const sumByType = (transactions, type) => transactions
  .filter(t => t.type === type)
  .reduce((sum, transaction) => sum + (transaction.amount || 0), 0);

const formatMoney = value => `$${Math.abs(value).toLocaleString('es-MX')}`;

const getFinancialSummary = transactions => {
  const ingresos = sumByType(transactions, 'ingreso');
  const gastos = sumByType(transactions, 'gasto');

  return {
    ingresos,
    gastos,
    balance: ingresos - gastos,
  };
};

const buildExpenseRatioAlert = (ingresos, gastos) => {
  if (ingresos <= 0) return null;

  const ratio = (gastos / ingresos) * 100;
  const baseAlert = {
    category: 'threshold',
    message: `Los gastos representan el ${ratio.toFixed(1)}% de los ingresos totales.`,
    value: `${ratio.toFixed(1)}%`,
  };

  if (ratio >= EXPENSE_RATIO_CRITICAL) {
    return {
      ...baseAlert,
      id: 'ratio-critical',
      level: 'critical',
      title: 'Umbral crítico de gastos',
      detail: 'El margen operativo es prácticamente nulo. Se recomienda acción inmediata.',
    };
  }

  if (ratio >= EXPENSE_RATIO_WARNING) {
    return {
      ...baseAlert,
      id: 'ratio-warning',
      level: 'warning',
      title: 'Alerta de ratio de gastos',
      detail: `Umbral de advertencia: ${EXPENSE_RATIO_WARNING}%. El margen está en zona de riesgo.`,
    };
  }

  return null;
};

const buildNegativeBalanceAlert = balance => {
  if (balance >= 0) return null;

  return {
    id: 'negative-balance',
    level: 'critical',
    category: 'balance',
    title: 'Balance neto negativo',
    message: `Déficit acumulado de ${formatMoney(balance)} MXN.`,
    detail: 'Los gastos totales superan los ingresos. Revisa la estructura de costos.',
    value: `-${formatMoney(balance)}`,
  };
};

const averageWithoutLatest = values => values
  .slice(0, -1)
  .reduce((sum, value) => sum + value, 0) / (values.length - 1);

const buildExpenseSpikeAlert = (monthlyData, lastMonth) => {
  const avgGastos = averageWithoutLatest(monthlyData.map(month => month.gastos));

  if (avgGastos <= 0 || lastMonth.gastos <= avgGastos * ANOMALY_SPIKE_THRESHOLD) {
    return null;
  }

  const increase = (lastMonth.gastos / avgGastos - 1) * 100;

  return {
    id: 'anomaly-spike',
    level: 'warning',
    category: 'anomaly',
    title: 'Anomalía detectada: pico de gastos',
    message: `Gastos en ${lastMonth.month} son ${increase.toFixed(0)}% superiores a la media histórica.`,
    detail: `Media mensual: $${Math.round(avgGastos).toLocaleString('es-MX')}. Gasto reciente: $${lastMonth.gastos.toLocaleString('es-MX')}.`,
    value: `+${increase.toFixed(0)}%`,
  };
};

const buildIncomeDropAlert = (monthlyData, lastMonth) => {
  const avgIngresos = averageWithoutLatest(monthlyData.map(month => month.ingresos));

  if (avgIngresos <= 0 || lastMonth.ingresos >= avgIngresos * INCOME_DROP_THRESHOLD) {
    return null;
  }

  const drop = (1 - lastMonth.ingresos / avgIngresos) * 100;

  return {
    id: 'anomaly-income-drop',
    level: 'warning',
    category: 'anomaly',
    title: 'Anomalía detectada: caída de ingresos',
    message: `Ingresos en ${lastMonth.month} cayeron un ${drop.toFixed(0)}% respecto a la media.`,
    detail: `Media mensual: $${Math.round(avgIngresos).toLocaleString('es-MX')}. Ingresos recientes: $${lastMonth.ingresos.toLocaleString('es-MX')}.`,
    value: `-${drop.toFixed(0)}%`,
  };
};

const buildMonthlyAnomalyAlerts = monthlyData => {
  if (monthlyData.length < MIN_MONTHS_FOR_ANOMALY) return [];

  const lastMonth = monthlyData[monthlyData.length - 1];

  return [
    buildExpenseSpikeAlert(monthlyData, lastMonth),
    buildIncomeDropAlert(monthlyData, lastMonth),
  ].filter(Boolean);
};

const buildNegativePredictionAlert = prediction => {
  const negMonths = prediction.predictions.filter(month => month.ingresos_pred - month.gastos_pred < 0);
  if (!negMonths.length) return null;

  return {
    id: 'prediction-negative',
    level: negMonths.length >= 2 ? 'critical' : 'warning',
    category: 'prediction',
    title: 'Proyección con saldo negativo',
    message: `${negMonths.length} de los próximos 3 meses proyectan déficit.`,
    detail: `Meses en riesgo: ${negMonths.map(month => month.month).join(', ')}.`,
    value: `${negMonths.length}/3 meses`,
  };
};

const buildPredictionTrendAlert = prediction => {
  if (prediction.trend !== 'negativa') return null;

  return {
    id: 'prediction-trend',
    level: 'info',
    category: 'prediction',
    title: 'Tendencia financiera negativa',
    message: 'La IA detecta una tendencia decreciente en el flujo de caja.',
    detail: prediction.trend_note || 'Considera revisar tus proyecciones de ingresos.',
    value: '↓ Negativa',
  };
};

const buildPredictionAlerts = prediction => {
  if (!prediction?.predictions?.length) return [];

  return [
    buildNegativePredictionAlert(prediction),
    buildPredictionTrendAlert(prediction),
  ].filter(Boolean);
};

const sumExpensesByCategory = transactions => transactions
  .filter(transaction => transaction.type === 'gasto')
  .reduce((categories, transaction) => ({
    ...categories,
    [transaction.category]: (categories[transaction.category] || 0) + (transaction.amount || 0),
  }), {});

const buildExpenseConcentrationAlert = (transactions, gastos) => {
  if (gastos <= 0) return null;

  const [topCategory, topValue] = Object
    .entries(sumExpensesByCategory(transactions))
    .sort((a, b) => b[1] - a[1])[0] || [];

  if (!topCategory || topValue / gastos <= 0.6) return null;

  const ratio = (topValue / gastos) * 100;

  return {
    id: 'concentration-risk',
    level: 'info',
    category: 'risk',
    title: 'Concentración de gastos',
    message: `La categoría "${topCategory.replace(/_/g, ' ')}" representa el ${ratio.toFixed(0)}% del gasto total.`,
    detail: 'Alta concentración en una sola categoría puede ser un riesgo operativo.',
    value: `${ratio.toFixed(0)}%`,
  };
};

const buildFinancialAlerts = (transactions, monthlyData, prediction) => {
  if (!transactions.length) return [];

  const { ingresos, gastos, balance } = getFinancialSummary(transactions);

  return [
    buildExpenseRatioAlert(ingresos, gastos),
    buildNegativeBalanceAlert(balance),
    ...buildMonthlyAnomalyAlerts(monthlyData),
    ...buildPredictionAlerts(prediction),
    buildExpenseConcentrationAlert(transactions, gastos),
  ].filter(Boolean);
};

export function useFinancialAlerts(transactions = [], monthlyData = [], prediction = null) {
  const alerts = useMemo(
    () => buildFinancialAlerts(transactions, monthlyData, prediction),
    [transactions, monthlyData, prediction],
  );

  const criticalCount = alerts.filter(alert => alert.level === 'critical').length;
  const warningCount = alerts.filter(alert => alert.level === 'warning').length;

  return { alerts, criticalCount, warningCount };
}
