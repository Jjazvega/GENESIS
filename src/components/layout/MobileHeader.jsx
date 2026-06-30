import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useCompany } from '@/lib/companyContext';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import {
  Menu, Brain, LayoutDashboard, FileText,
  Building2, BarChart3, ChevronLeft
} from 'lucide-react';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/companies', label: 'Empresas', icon: Building2 },
  { path: '/documents', label: 'Documentos', icon: FileText },
  { path: '/finance', label: 'Finanzas', icon: BarChart3 },
  { path: '/ai', label: 'IA', icon: Brain },
];

export default function MobileHeader() {
  const location = useLocation();
  const navigate = useNavigate();
  const { activeCompany } = useCompany();
  const [open, setOpen] = useState(false);

  const isHome = location.pathname === '/' || location.pathname === '/dashboard';

  return (
    <div className="md:hidden fixed top-0 left-0 right-0 z-50 flex flex-col border-b" style={{
      background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)',
      borderColor: 'rgba(197,160,89,0.3)',
      paddingTop: 'env(safe-area-inset-top)',
    }}>
      {/* Header bar */}
      <div className="h-14 flex items-center justify-between px-3 shrink-0">
      <div className="flex items-center gap-3">
        {!isHome ? (
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg transition-all"
            style={{background: 'rgba(197,160,89,0.1)', border: '1px solid rgba(197,160,89,0.25)'}}
          >
            <ChevronLeft className="w-4 h-4" style={{color: '#c5a059'}} />
            <span className="text-xs font-medium" style={{color: '#c5a059'}}>Atrás</span>
          </button>
        ) : (
          <>
            <img 
              src="/assets/logo-emblem.png" 
              alt="GEMAILLA IA" 
              className="w-10 h-10 shrink-0"
              style={{objectFit: 'contain'}}
            />
            <div>
              <span className="font-display font-bold tracking-wider block" style={{
                fontSize: '1.1rem',
                background: 'linear-gradient(135deg, #f0d080 0%, #c5a059 50%, #e8c97a 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text'
              }}>GEMAILLA AI</span>
              <p className="text-[0.65rem] tracking-widest uppercase" style={{color: 'rgba(197,160,89,0.7)'}}>Asesoría Empresarial</p>
            </div>
          </>
        )}
      </div>
      </div>

      {/* Modules Grid - Always Visible */}
      <div className="px-2 pb-2 border-t" style={{borderColor: 'rgba(197,160,89,0.15)'}}>
        <div className="grid grid-cols-4 gap-1.5">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link 
                key={item.path} 
                to={item.path}
                className="flex flex-col items-center justify-center p-1.5 rounded-lg transition-all"
                style={isActive ? {
                  background: 'rgba(197,160,89,0.2)',
                  border: '1px solid rgba(197,160,89,0.4)',
                  boxShadow: '0 0 12px rgba(197,160,89,0.2)'
                } : {
                  background: 'rgba(197,160,89,0.06)',
                  border: '1px solid rgba(197,160,89,0.12)'
                }}
              >
                <item.icon className="w-4 h-4" style={{color: isActive ? '#c5a059' : 'rgba(197,160,89,0.7)'}} />
                <span className="text-[0.5rem] text-center font-medium leading-tight mt-0.5" style={{color: isActive ? '#c5a059' : 'rgba(200,190,170,0.6)'}}>
                  {item.label.length > 12 ? item.label.substring(0, 12) + '...' : item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="text-foreground" style={{
            background: 'rgba(197,160,89,0.1)',
            border: '1px solid rgba(197,160,89,0.3)'
          }}>
            <Menu className="w-5 h-5" style={{color: '#c5a059'}} />
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="w-72 p-0 border-l" style={{
          background: 'linear-gradient(180deg, #0a0a0a 0%, #0f0f0f 100%)',
          borderColor: 'rgba(197,160,89,0.3)'
        }}>
          <div className="p-5 border-b" style={{
            borderColor: 'rgba(197,160,89,0.2)',
            background: 'linear-gradient(135deg, rgba(197,160,89,0.1) 0%, transparent 100%)'
          }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{
                background: 'radial-gradient(circle at 35% 35%, rgba(232,201,122,0.3), rgba(197,160,89,0.15))',
                border: '1px solid rgba(197,160,89,0.4)'
              }}>
                <Brain className="w-5 h-5" style={{color: '#f0d080'}} />
              </div>
              <div>
                <p className="font-display font-bold tracking-wider" style={{color: '#c5a059', fontSize: '1rem'}}>GEMAILLA AI</p>
                <p className="text-[0.6rem] tracking-widest uppercase" style={{color: 'rgba(197,160,89,0.6)'}}>Panel de Control</p>
              </div>
            </div>
            {activeCompany && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{background: 'rgba(197,160,89,0.08)', border: '1px solid rgba(197,160,89,0.15)'}}>
                <Building2 className="w-3.5 h-3.5" style={{color: '#c5a059'}} />
                <p className="text-xs truncate font-medium" style={{color: '#e8d5a3'}}>{activeCompany.name}</p>
              </div>
            )}
          </div>
          <nav className="p-3 space-y-1">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link 
                  key={item.path} 
                  to={item.path} 
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 group"
                  style={isActive ? {
                    background: 'linear-gradient(135deg, rgba(197,160,89,0.2) 0%, rgba(197,160,89,0.05) 100%)',
                    color: '#c5a059',
                    border: '1px solid rgba(197,160,89,0.3)',
                    boxShadow: '0 4px 12px rgba(197,160,89,0.15)'
                  } : {
                    color: 'rgba(200,190,170,0.5)',
                    border: '1px solid transparent'
                  }}
                >
                  <div className={`p-1.5 rounded-lg transition-all ${isActive ? '' : 'group-hover:bg-white/5'}`} style={isActive ? {background: 'rgba(197,160,89,0.15)'} : {}}>
                    <item.icon className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-medium tracking-wide flex-1">{item.label}</span>
                  {isActive && (
                    <div className="w-1.5 h-1.5 rounded-full" style={{background: '#c5a059', boxShadow: '0 0 8px rgba(197,160,89,0.6)'}} />
                  )}
                </Link>
              );
            })}
          </nav>
          <div className="absolute bottom-0 left-0 right-0 p-4 border-t" style={{borderColor: 'rgba(197,160,89,0.15)', background: 'linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.3) 100%)'}}>
            <p className="text-[0.6rem] text-center" style={{color: 'rgba(197,160,89,0.4)'}}>© 2024 GEMAILLA AI • Todos los derechos reservados</p>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}