import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useCompany } from '@/lib/companyContext';
import {
  LayoutDashboard,
  FileText,
  Brain,
  Building2,
  BarChart3,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  BriefcaseBusiness,
  Handshake,
  TrendingUp,
  UsersRound,
  Settings,
  ShieldCheck,
  ChartNoAxesCombined,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { firebase } from '@/api/repoClient';

const GOLD = '#f6c84a';

const activeRoutes = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/companies', label: 'Empresas', icon: Building2 },
  { path: '/documents', label: 'Documentos', icon: FileText },
  { path: '/finance', label: 'Finanzas', icon: BarChart3 },
  { path: '/ai', label: 'GEMAILLA IA', icon: Brain },
];

const visualItems = [
  { label: 'CRM', icon: Handshake },
  { label: 'Ventas', icon: TrendingUp },
  { label: 'Recursos Humanos', icon: UsersRound },
  { label: 'Operaciones', icon: Settings },
  { label: 'Auditoría', icon: ShieldCheck },
  { label: 'Reportes', icon: ChartNoAxesCombined },
];

function MenuLink({ item, isActive, collapsed }) {
  return (
    <Link
      to={item.path}
      title={collapsed ? item.label : undefined}
      className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-all duration-200 ${collapsed ? 'justify-center px-0' : ''}`}
      style={isActive ? {
        color: GOLD,
        background: 'linear-gradient(90deg, rgba(246,200,74,.19), rgba(246,200,74,.06))',
        border: '1px solid rgba(246,200,74,.70)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,.07), 0 0 15px rgba(246,200,74,.07)',
      } : {
        color: 'rgba(255,255,255,.87)',
        border: '1px solid transparent',
      }}
      onMouseEnter={(event) => {
        if (!isActive) event.currentTarget.style.background = 'rgba(246,200,74,.08)';
      }}
      onMouseLeave={(event) => {
        if (!isActive) event.currentTarget.style.background = 'transparent';
      }}
    >
      <item.icon className="h-5 w-5 shrink-0" style={{ color: isActive ? GOLD : 'rgba(246,200,74,.95)' }} />
      {!collapsed && <span>{item.label}</span>}
    </Link>
  );
}

export default function Sidebar({ collapsed, setCollapsed }) {
  const location = useLocation();
  const { companies = [], activeCompany, switchCompany } = useCompany();

  return (
    <aside
      className={`fixed left-0 top-0 z-40 flex h-full flex-col border-r transition-all duration-300 ${collapsed ? 'w-20' : 'w-[310px]'}`}
      style={{
        background: 'linear-gradient(180deg, rgba(9,9,9,.995) 0%, rgba(2,2,2,.995) 100%)',
        borderColor: 'rgba(246,200,74,.38)',
        boxShadow: '16px 0 36px rgba(0,0,0,.48)',
      }}
    >
      <div
        className="border-b px-3 py-5"
        style={{
          borderColor: 'rgba(246,200,74,.20)',
          backgroundImage: 'radial-gradient(circle at 50% 22%, rgba(246,200,74,.18), transparent 45%)',
        }}
      >
        {!collapsed ? (
          <img
            src="/assets/logo-full.png"
            alt="GEMAILLA IA"
            className="mx-auto h-auto w-[255px]"
            style={{ filter: 'drop-shadow(0 0 16px rgba(246,200,74,.30))' }}
          />
        ) : (
          <img
            src="/assets/logo-full.png"
            alt="GEMAILLA IA"
            className="mx-auto h-14 w-14 object-contain"
            style={{ filter: 'drop-shadow(0 0 10px rgba(246,200,74,.28))' }}
          />
        )}
      </div>

      {!collapsed && activeCompany && (
        <div className="border-b px-4 py-3" style={{ borderColor: 'rgba(246,200,74,.15)' }}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`Empresa activa: ${activeCompany.name}`}
                className="flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition-colors hover:bg-white/5"
                style={{ background: 'rgba(246,200,74,.055)', borderColor: 'rgba(246,200,74,.22)' }}
              >
                <Building2 className="h-4 w-4 shrink-0" style={{ color: GOLD }} />
                <span className="min-w-0 flex-1 truncate text-left text-xs font-semibold" style={{ color: 'rgba(255,255,255,.86)' }}>
                  {activeCompany.name}
                </span>
                <ChevronDown className="h-4 w-4 shrink-0" style={{ color: GOLD }} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              {companies.map((company) => (
                <DropdownMenuItem key={company.id} onClick={() => switchCompany(company)}>
                  <Building2 className="mr-2 h-4 w-4" />
                  {company.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {activeRoutes.slice(0, 1).map((item) => (
          <MenuLink key={item.path} item={item} collapsed={collapsed} isActive={location.pathname === item.path} />
        ))}
        {!collapsed && <div className="mx-2 my-1 h-px" style={{ background: 'rgba(246,200,74,.12)' }} />}
        {visualItems.slice(0, 4).map((item) => (
          <div
            key={item.label}
            className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold ${collapsed ? 'justify-center px-0' : ''}`}
            style={{ color: 'rgba(255,255,255,.87)' }}
            title={collapsed ? item.label : undefined}
          >
            <item.icon className="h-5 w-5 shrink-0" style={{ color: 'rgba(246,200,74,.95)' }} />
            {!collapsed && <span>{item.label}</span>}
          </div>
        ))}
        {activeRoutes.slice(2, 4).map((item) => (
          <MenuLink key={item.path} item={item} collapsed={collapsed} isActive={location.pathname === item.path} />
        ))}
        {visualItems.slice(4).map((item) => (
          <div
            key={item.label}
            className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold ${collapsed ? 'justify-center px-0' : ''}`}
            style={{ color: 'rgba(255,255,255,.87)' }}
            title={collapsed ? item.label : undefined}
          >
            <item.icon className="h-5 w-5 shrink-0" style={{ color: 'rgba(246,200,74,.95)' }} />
            {!collapsed && <span>{item.label}</span>}
          </div>
        ))}
        {activeRoutes.slice(4).map((item) => (
          <MenuLink key={item.path} item={item} collapsed={collapsed} isActive={location.pathname === item.path} />
        ))}
      </nav>

      {!collapsed && (
        <div className="mx-4 mb-4 rounded-2xl border p-4" style={{ background: 'rgba(246,200,74,.045)', borderColor: 'rgba(246,200,74,.26)' }}>
          <div className="flex items-center gap-3">
            <div className="rounded-xl p-2" style={{ background: 'rgba(246,200,74,.12)', color: GOLD }}>
              <BriefcaseBusiness className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold" style={{ color: GOLD }}>GEMAILLA IA</p>
              <p className="text-xs" style={{ color: 'rgba(246,200,74,.72)' }}>Asesoría Inteligente</p>
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-1/2 flex h-7 w-7 items-center justify-center rounded-full"
        style={{ background: '#111', border: '1px solid rgba(246,200,74,.55)', color: GOLD }}
        aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'}
      >
        {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </button>

      <div className="border-t p-3" style={{ borderColor: 'rgba(246,200,74,.18)' }}>
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'}`}>
          {!collapsed && (
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full" style={{ background: 'radial-gradient(circle at 35% 30%, #f3d878, #9c7218)' }} />
              <span className="text-xs" style={{ color: 'rgba(255,255,255,.72)' }}>Administrador</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => firebase.auth.logout()}
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
            className="rounded-lg p-2 transition-colors hover:bg-white/5"
            style={{ color: 'rgba(255,255,255,.72)' }}
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
