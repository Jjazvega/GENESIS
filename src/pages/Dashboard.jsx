import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Bell,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Download,
  HelpCircle,
  Menu,
  Search,
  ShieldAlert,
  Target,
  TriangleAlert,
  UsersRound,
  Zap,
} from 'lucide-react';
import LoadingState from '@/components/shared/LoadingState';
import { useCompanyData } from '@/hooks/useCompanyData';
import { useCompany } from '@/lib/companyContext';

const GOLD = '#f6c84a';
const PANEL = {
  background: 'linear-gradient(145deg, rgba(15,15,15,.985), rgba(4,4,4,.99))',
  border: '1px solid rgba(246,200,74,.28)',
  boxShadow: '0 14px 32px rgba(0,0,0,.50), inset 0 1px 0 rgba(255,255,255,.025)',
};
const BACKGROUND = {
  backgroundColor: '#050505',
  backgroundImage: `
    radial-gradient(circle at 50% -8%, rgba(246,200,74,.13), transparent 34%),
    linear-gradient(45deg, rgba(255,255,255,.018) 25%, transparent 25%),
    linear-gradient(-45deg, rgba(255,255,255,.018) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, rgba(255,255,255,.018) 75%),
    linear-gradient(-45deg, transparent 75%, rgba(255,255,255,.018) 75%)
  `,
  backgroundSize: 'auto, 24px 24px, 24px 24px, 24px 24px, 24px 24px',
  backgroundPosition: '0 0, 0 0, 0 12px, 12px -12px, -12px 0',
};

function money(value) {
  return `$${Math.round(Math.max(0, value || 0)).toLocaleString()}`;
}

function getTotals(transactions = [], documents = []) {
  const income = transactions
    .filter((transaction) => transaction.type === 'ingreso')
    .reduce((sum, transaction) => sum + (Number(transaction.amount) || 0), 0);
  const expenses = transactions
    .filter((transaction) => transaction.type === 'gasto')
    .reduce((sum, transaction) => sum + (Number(transaction.amount) || 0), 0);
  const pending = transactions.filter((transaction) => transaction.status === 'pending').length;
  const alerts = documents.filter((document) => document.status === 'failed' || document.status === 'error').length;
  const analysed = documents.filter((document) => document.analysisStatus === 'completed' || document.status === 'analyzed').length;
  const health = Math.max(0, Math.min(100, 100 - alerts * 10 - pending * 3));
  return { income, expenses, pending, alerts, analysed, health };
}

function TopButton({ children, icon: Icon }) {
  return (
    <button
      type="button"
      className="flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-white/5"
      style={{ borderColor: 'rgba(246,200,74,.34)', background: 'rgba(4,4,4,.72)', color: 'rgba(255,255,255,.90)' }}
    >
      <Icon className="h-4 w-4" style={{ color: GOLD }} />
      {children}
    </button>
  );
}

function MetricCard({ eyebrow, title, value, accent, icon: Icon, footer }) {
  return (
    <section className="min-h-[250px] rounded-2xl p-6" style={PANEL}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase" style={{ color: GOLD }}>{eyebrow}</p>
          <p className="mt-2 text-base" style={{ color: 'rgba(255,255,255,.90)' }}>{title}</p>
        </div>
        <div className="rounded-full border p-4" style={{ borderColor: `${accent}66`, background: `${accent}12`, boxShadow: `0 0 18px ${accent}20` }}>
          <Icon className="h-7 w-7" style={{ color: accent }} />
        </div>
      </div>
      <p className="mt-10 text-5xl font-bold" style={{ color: accent, fontFamily: 'Georgia, serif' }}>{value}</p>
      <div className="mt-4 text-sm" style={{ color: 'rgba(255,255,255,.85)' }}>{footer}</div>
    </section>
  );
}

const ACTIONS = [
  { text: 'Revisar flujo de efectivo proyectado', priority: 'Alta', area: 'Finanzas' },
  { text: 'Aprobar 2 cotizaciones pendientes', priority: 'Media', area: 'Ventas' },
  { text: 'Revisar inventario bajo stock', priority: 'Media', area: 'Operaciones' },
  { text: 'Responder 5 consultas de clientes', priority: 'Baja', area: 'CRM' },
  { text: 'Validar reportes semanales', priority: 'Baja', area: 'Auditoría' },
];

function PriorityTag({ children }) {
  const color = children === 'Alta' ? '#ef4444' : children === 'Media' ? '#f59e0b' : '#22c55e';
  return <span className="rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: `${color}22`, color }}>{children}</span>;
}

function ImpactBars({ income, expenses }) {
  const maximum = Math.max(income, expenses, 1);
  const bars = [
    { label: 'Oportunidades', value: income * 0.3, color: '#39a852' },
    { label: 'Ingresos Proyectados', value: income, color: GOLD },
    { label: 'Costos', value: expenses, color: '#ef2b22' },
    { label: 'Riesgos', value: expenses * 0.55, color: '#f59e0b' },
  ];
  return (
    <div className="mt-5 grid grid-cols-4 items-end gap-5 border-b pt-3" style={{ height: 210, borderColor: 'rgba(246,200,74,.34)' }}>
      {bars.map((bar) => (
        <div key={bar.label} className="flex h-full flex-col items-center justify-end gap-3">
          <div className="w-full max-w-[82px] rounded-t-md border" style={{ height: `${Math.max(16, (bar.value / maximum) * 130)}px`, background: `linear-gradient(180deg, ${bar.color}, ${bar.color}99)`, borderColor: `${bar.color}cc`, boxShadow: `0 0 16px ${bar.color}33` }} />
          <span className="pb-2 text-center text-xs" style={{ color: 'rgba(255,255,255,.72)' }}>{bar.label}</span>
        </div>
      ))}
    </div>
  );
}

function DashboardHeader() {
  return (
    <header className="border-b px-6 py-4 md:px-8" style={{ borderColor: 'rgba(246,200,74,.18)', background: 'rgba(3,3,3,.72)', backdropFilter: 'blur(12px)' }}>
      <div className="flex items-center justify-between gap-5">
        <div className="flex min-w-0 flex-1 items-center gap-5">
          <Menu className="h-6 w-6 shrink-0" style={{ color: GOLD }} />
          <label className="relative hidden w-full max-w-xl sm:block">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2" style={{ color: GOLD }} />
            <input
              aria-label="Buscar"
              placeholder="Buscar empresas, documentos, métricas..."
              className="w-full rounded-xl border py-3 pl-12 pr-4 text-sm outline-none"
              style={{ background: 'rgba(0,0,0,.72)', borderColor: 'rgba(246,200,74,.30)', color: 'rgba(255,255,255,.90)' }}
            />
          </label>
        </div>
        <div className="flex items-center gap-5">
          <div className="hidden items-center gap-2 text-sm font-semibold lg:flex" style={{ color: 'rgba(255,255,255,.90)' }}>
            <Bell className="h-5 w-5" style={{ color: GOLD }} />
            <span>Notificaciones</span>
            <span className="flex h-6 w-6 items-center justify-center rounded-full text-xs" style={{ background: GOLD, color: '#050505' }}>3</span>
          </div>
          <div className="hidden items-center gap-2 text-sm font-semibold md:flex" style={{ color: 'rgba(255,255,255,.90)' }}>
            <HelpCircle className="h-5 w-5" style={{ color: GOLD }} />
            <span>Ayuda</span>
          </div>
          <div className="flex items-center gap-3 border-l pl-5" style={{ borderColor: 'rgba(246,200,74,.22)' }}>
            <div className="h-10 w-10 rounded-full" style={{ background: 'radial-gradient(circle at 35% 30%, #f3d878, #9c7218)', border: '1px solid rgba(246,200,74,.7)' }} />
            <div className="hidden xl:block">
              <p className="text-sm font-bold text-white">Demo Admin</p>
              <p className="text-xs" style={{ color: 'rgba(246,200,74,.75)' }}>Administrador</p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

export default function Dashboard() {
  const { activeCompany, loading: companyLoading, companies = [] } = useCompany();
  const { transactions = [], documents = [] } = useCompanyData(activeCompany?.id, { queryNames: ['transactions', 'documents'] });
  const totals = useMemo(() => getTotals(transactions, documents), [transactions, documents]);
  const net = totals.income - totals.expenses;

  if (companyLoading) return <LoadingState variant="screen" style={{ background: '#050505' }} />;

  return (
    <div className="min-h-screen" style={BACKGROUND}>
      <DashboardHeader />
      <main className="px-5 py-7 md:px-8">
        <section className="flex flex-col justify-between gap-5 xl:flex-row xl:items-center">
          <div>
            <h1 className="text-4xl font-bold" style={{ color: GOLD, fontFamily: 'Georgia, serif', textShadow: '0 0 22px rgba(246,200,74,.14)' }}>Dashboard Ejecutivo</h1>
            <p className="mt-2 text-base" style={{ color: 'rgba(255,255,255,.88)' }}>Resumen estratégico de la situación actual de tu empresa</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <TopButton icon={TriangleAlert}>Filtros</TopButton>
            <TopButton icon={CalendarDays}>Periodo actual</TopButton>
            <TopButton icon={Download}>Exportar</TopButton>
          </div>
        </section>

        <section className="mt-7 grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-4">
          <MetricCard eyebrow="¿Cómo está mi empresa?" title="Salud General" value={`${totals.health}/100`} accent="#39b54a" icon={CheckCircle2} footer={<><strong style={{ color: '#39b54a' }}>Salud: Buena</strong><span className="ml-2">↑ periodo anterior</span></>} />
          <MetricCard eyebrow="¿Qué requiere atención inmediata?" title="Alertas Críticas" value={totals.alerts} accent="#ef2b22" icon={ShieldAlert} footer={<span style={{ color: totals.alerts ? '#ff6b63' : '#b7c4b7' }}>{totals.alerts ? `${totals.alerts} sin resolver` : 'Sin alertas pendientes'}</span>} />
          <MetricCard eyebrow="¿Qué riesgos existen?" title="Riesgo Global" value={totals.alerts > 2 ? 'Alto' : totals.alerts ? 'Medio' : 'Bajo'} accent="#f6c84a" icon={AlertTriangle} footer={<span>{totals.alerts} riesgos identificados</span>} />
          <MetricCard eyebrow="¿Qué oportunidades tengo?" title="Oportunidades" value={totals.analysed} accent="#2f9cff" icon={Target} footer={<strong style={{ color: '#39b54a' }}>{money(totals.income * 0.15)} potencial</strong>} />
        </section>

        <section className="mt-5 grid grid-cols-1 gap-5 2xl:grid-cols-[1.03fr_1.15fr]">
          <section className="rounded-2xl p-6" style={PANEL}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-bold" style={{ color: GOLD }}><Zap className="h-5 w-5" />¿Qué acciones debo realizar hoy?</h2>
                <p className="mt-2 flex items-center gap-2 text-sm" style={{ color: 'rgba(255,255,255,.82)' }}><UsersRound className="h-4 w-4" style={{ color: GOLD }} />Acciones Prioritarias</p>
              </div>
              <button type="button" className="rounded-xl border px-4 py-2 text-sm font-semibold" style={{ borderColor: 'rgba(246,200,74,.34)', color: GOLD }}>Ver todas</button>
            </div>
            <div className="mt-6 space-y-4">
              {ACTIONS.map((action) => (
                <div key={action.text} className="grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-3">
                  <span className="h-5 w-5 rounded border" style={{ borderColor: 'rgba(246,200,74,.45)' }} />
                  <div className="flex min-w-0 flex-wrap items-center gap-3">
                    <span className="min-w-[220px] flex-1 text-sm" style={{ color: 'rgba(255,255,255,.90)' }}>{action.text}</span>
                    <PriorityTag>{action.priority}</PriorityTag>
                    <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs" style={{ color: 'rgba(255,255,255,.90)' }}>{action.area}</span>
                  </div>
                  <span className="text-sm font-semibold text-red-500">Vence hoy</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl p-6" style={PANEL}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-bold" style={{ color: GOLD }}><CircleDollarSign className="h-5 w-5" />¿Cuál es el impacto económico?</h2>
                <p className="mt-2 text-sm" style={{ color: 'rgba(255,255,255,.82)' }}>Impacto Estimado</p>
              </div>
              <Link to="/finance" className="rounded-xl border px-4 py-2 text-sm font-semibold" style={{ borderColor: 'rgba(246,200,74,.34)', color: GOLD }}>Ver análisis completo</Link>
            </div>
            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
              <div><p className="text-sm" style={{ color: 'rgba(255,255,255,.85)' }}>Impacto Positivo</p><p className="mt-2 text-3xl font-bold" style={{ color: '#39b54a' }}>{money(totals.income)}</p></div>
              <div><p className="text-sm" style={{ color: 'rgba(255,255,255,.85)' }}>Impacto Negativo</p><p className="mt-2 text-3xl font-bold" style={{ color: '#ef2b22' }}>-{money(totals.expenses)}</p></div>
              <div className="rounded-2xl border p-4 text-center" style={{ borderColor: 'rgba(246,200,74,.75)', boxShadow: '0 0 16px rgba(246,200,74,.08)' }}><p className="text-sm text-white">Impacto Neto</p><p className="mt-2 text-3xl font-bold" style={{ color: GOLD }}>{net < 0 ? '-' : ''}{money(Math.abs(net))}</p></div>
            </div>
            <ImpactBars income={totals.income} expenses={totals.expenses} />
          </section>
        </section>

        <section className="mt-5 rounded-2xl p-6" style={PANEL}>
          <div className="flex items-center justify-between gap-4">
            <div><h2 className="text-lg font-bold" style={{ color: GOLD }}>Empresas activas</h2><p className="mt-1 text-sm" style={{ color: 'rgba(255,255,255,.70)' }}>Vista general de las empresas registradas</p></div>
            <Link to="/companies" className="text-sm font-semibold" style={{ color: GOLD }}>Ver todas</Link>
          </div>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead><tr style={{ borderBottom: '1px solid rgba(246,200,74,.30)', color: GOLD }}><th className="py-3">EMPRESA</th><th>SECTOR</th><th>ESTADO</th><th>DOCUMENTOS</th><th>ÚLTIMO ANÁLISIS</th></tr></thead>
              <tbody>{companies.slice(0, 4).map((company) => <tr key={company.id} style={{ borderBottom: '1px solid rgba(246,200,74,.12)', color: 'rgba(255,255,255,.88)' }}><td className="py-4 font-semibold">{company.name}</td><td>{company.industry || '-'}</td><td><span className="rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: 'rgba(57,181,74,.18)', color: '#39b54a' }}>Activa</span></td><td>{documents.filter((document) => document.companyId === company.id).length}</td><td>Hoy</td></tr>)}</tbody>
            </table>
          </div>
        </section>
      </main>
      <footer className="flex items-center justify-center border-t px-6 py-4 text-sm" style={{ borderColor: 'rgba(246,200,74,.18)', color: 'rgba(246,200,74,.78)' }}>© {new Date().getFullYear()} GEMAILLA IA. La evolución de la asesoría empresarial.</footer>
    </div>
  );
}
