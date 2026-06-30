import React, { useMemo } from 'react';
import { useCompany } from '@/lib/companyContext';
import { useAuth } from '@/lib/AuthContext';
import { useCompanyAiConversations, useCompanyTransactions } from '@/lib/companyEntityQueries';
import PageHeader from '@/components/shared/PageHeader';
import EmptyState from '@/components/shared/EmptyState';
import LoadingState from '@/components/shared/LoadingState';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Building2 } from 'lucide-react';
import { format, subMonths, startOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import FinancialStatements from '@/features/finance/components/FinancialStatements';
import RiskManagement from '@/features/finance/components/RiskManagement';
import BudgetPlanner from '@/features/finance/components/BudgetPlanner';
import ReportDownloader from '@/features/finance/components/ReportDownloader';

export default function FinancialHub() {
  const { activeCompany, memberships, loading: companyLoading } = useCompany();
  const { user } = useAuth();

  const { data: transactions = [] } = useCompanyTransactions(activeCompany);
  const { data: aiConversations = [] } = useCompanyAiConversations(activeCompany, { limit: 200 });

  const monthlyData = useMemo(() => {
    const buckets = Array.from({ length: 12 }, (_, index) => {
      const monthStart = startOfMonth(subMonths(new Date(), 11 - index));
      const monthStr = format(monthStart, 'yyyy-MM');

      return {
        month: format(monthStart, 'MMM yy', { locale: es }),
        monthStr,
        ingresos: 0,
        gastos: 0,
      };
    });

    const bucketByMonth = new Map(buckets.map((bucket) => [bucket.monthStr, bucket]));

    transactions.forEach((transaction) => {
      if (!transaction.date) return;

      const date = new Date(transaction.date);
      if (Number.isNaN(date.getTime())) return;

      const monthStr = format(date, 'yyyy-MM');
      const bucket = bucketByMonth.get(monthStr);
      if (!bucket) return;

      const amount = Number(transaction.amount) || 0;
      if (transaction.type === 'ingreso') {
        bucket.ingresos += amount;
      } else if (transaction.type === 'gasto') {
        bucket.gastos += amount;
      }
    });

    return buckets;
  }, [transactions]);

  if (companyLoading) return <LoadingState />;

  if (!activeCompany) {
    return (
      <EmptyState
        icon={Building2}
        title="Selecciona una empresa"
        description="Necesitas una empresa activa para acceder al Hub Financiero."
      />
    );
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Hub Financiero"
        description="Estados financieros, gestión de riesgos y planificación de presupuestos en tiempo real."
        actions={<ReportDownloader transactions={transactions} company={activeCompany} />}
      />

      <Tabs defaultValue="statements" className="space-y-6">
        <TabsList className="bg-card border border-border p-1 rounded-xl flex-wrap h-auto gap-1">
          <TabsTrigger value="statements" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-sm">
            📊 Estados Financieros
          </TabsTrigger>
          <TabsTrigger value="risks" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-sm">
            🛡️ Gestión de Riesgos
          </TabsTrigger>
          <TabsTrigger value="budget" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-sm">
            💰 Presupuesto & Flujo
          </TabsTrigger>
        </TabsList>

        <TabsContent value="statements">
          <FinancialStatements transactions={transactions} company={activeCompany} />
        </TabsContent>

        <TabsContent value="risks">
          <RiskManagement transactions={transactions} monthlyData={monthlyData} company={activeCompany} memberships={memberships} currentUser={user} aiConversations={aiConversations} />
        </TabsContent>

        <TabsContent value="budget">
          <BudgetPlanner transactions={transactions} monthlyData={monthlyData} />
        </TabsContent>
      </Tabs>
    </div>
  );
}