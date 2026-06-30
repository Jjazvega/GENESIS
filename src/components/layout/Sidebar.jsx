import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useCompany } from '@/lib/companyContext';
import {
  LayoutDashboard, FileText, Brain,
  Building2, BarChart3, LogOut,
  ChevronLeft, ChevronRight, ChevronDown
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from
'@/components/ui/dropdown-menu';
import { firebase } from '@/api/firebaseClient';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/companies', label: 'Empresas', icon: Building2 },
  { path: '/documents', label: 'Documentos', icon: FileText },
  { path: '/finance', label: 'Finanzas', icon: BarChart3 },
  { path: '/ai', label: 'IA Asistente', icon: Brain },
];


export default function Sidebar({ collapsed, setCollapsed }) {
  const location = useLocation();
  const { companies, activeCompany, switchCompany } = useCompany();

  return (
    <aside className={`fixed left-0 top-0 h-full z-40 flex flex-col border-r bg-[#080808] transition-all duration-300 ${collapsed ? 'w-16' : 'w-64'}`} style={{ borderColor: 'rgba(197,160,89,0.18)' }}>
      {/* Logo */}
      <div className="flex items-center justify-center py-8 px-4 border-b" style={{ borderColor: 'rgba(197,160,89,0.15)', background: 'transparent' }}>
         {!collapsed ?
        <div className="flex flex-col items-center gap-3">
          {/* Logo */}
          <img src="/assets/logo-emblem.png" alt="GEMAILLA IA" className="w-24 h-24" style={{ background: 'transparent', objectFit: 'contain' }} />
          <div className="text-center">
          <p className="font-display tracking-[0.12em] uppercase" style={{ color: '#fef3c7', fontSize: '0.85rem', letterSpacing: '0.1em', fontWeight: '600', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>La Evolución de</p>
          <p className="font-display tracking-[0.12em] uppercase" style={{ color: '#fef3c7', fontSize: '0.85rem', letterSpacing: '0.1em', fontWeight: '600', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>la Asesoría Empresaria</p>
              <span className="font-display tracking-[0.08em] leading-tight mt-2" style={{
              fontSize: '1.5rem',
              color: '#c5a059',
              fontWeight: '700',
              letterSpacing: '0.08em'
            }}>GEMAILLA IA</span>
            </div>
          </div> :

        <img src="/assets/logo-emblem.png" alt="GEMAILLA IA" className="w-16 h-16" style={{ background: 'transparent' }} />
        }
      </div>

      {/* Company Selector */}
      {!collapsed && activeCompany &&
      <div className="px-3 py-3 border-b" style={{ borderColor: 'rgba(197,160,89,0.12)' }}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label={`Empresa activa: ${activeCompany.name}`}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-sm hover:bg-white/5"
                style={{ background: 'rgba(197,160,89,0.06)', border: '1px solid rgba(197,160,89,0.2)' }}
              >
                <Building2 className="w-4 h-4 shrink-0" style={{ color: '#c5a059' }} />
                <div className="flex-1 text-left min-w-0">
                  <p className="truncate text-xs font-semibold" style={{ color: '#e8d5a3' }}>{activeCompany.name}</p>
                </div>
                <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {companies.map((c) =>
            <DropdownMenuItem key={c.id} onClick={() => switchCompany(c)}>
                  <Building2 className="w-4 h-4 mr-2" />
                  {c.name}
                </DropdownMenuItem>
            )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      }

      {/* Navigation */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-all duration-200 group font-semibold bg-[#000000] ${collapsed ? 'justify-center' : ''}`}
              style={isActive ? {
                background: 'rgba(197,160,89,0.12)',
                border: '1px solid rgba(197,160,89,0.25)',
                color: '#c5a059'
              } : {
                color: 'rgba(200,190,170,0.55)',
                border: '1px solid transparent'
              }}
              title={collapsed ? item.label : undefined}
              onMouseEnter={(e) => {if (!isActive) {e.currentTarget.style.background = 'rgba(197,160,89,0.06)';e.currentTarget.style.color = '#e8d5a3';}}}
              onMouseLeave={(e) => {if (!isActive) {e.currentTarget.style.background = 'transparent';e.currentTarget.style.color = 'rgba(200,190,170,0.55)';}}}>
              
              <item.icon className="w-4 h-4 shrink-0" style={isActive ? { color: '#c5a059' } : {}} />
              {!collapsed && <span className="tracking-wide font-black text-lg">{item.label}</span>}
            </Link>);

        })}
      </nav>

      {/* Collapse Toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-24 w-6 h-6 rounded-full flex items-center justify-center transition-all"
        style={{ background: '#111', border: '1px solid rgba(197,160,89,0.35)', color: '#c5a059' }}>
        
        {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
      </button>

      {/* User section */}
      <div className="p-3 border-t" style={{ borderColor: 'rgba(197,160,89,0.15)' }}>
        <div className={`flex items-center gap-3 ${collapsed ? 'justify-center' : ''}`}>
          <img
            src="/assets/logo-emblem.png"
            alt="GEMAILLA IA"
            className="w-10 h-10 shrink-0"
            style={{ objectFit: 'contain' }} />
          

          {!collapsed &&
          <button
            onClick={() => firebase.auth.logout()}
            aria-label="Cerrar sesión"
            className="p-1.5 rounded-md transition-colors text-muted-foreground hover:text-foreground hover:bg-white/5"
            title="Cerrar sesión">
            
              <LogOut className="w-4 h-4" />
            </button>
          }
        </div>
      </div>
    </aside>);

}