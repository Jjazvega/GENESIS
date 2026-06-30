import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Building2, FileText, Brain } from 'lucide-react';

const items = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/companies', label: 'Empresas', icon: Building2 },
  { path: '/documents', label: 'Documentos', icon: FileText },
  { path: '/ai', label: 'IA', icon: Brain },
];

export default function BottomNav() {
  const location = useLocation();

  return (
    <div
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t"
      style={{
        background: 'linear-gradient(180deg, #0d0d0d 0%, #080808 100%)',
        borderColor: 'rgba(197,160,89,0.25)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        height: 'calc(56px + env(safe-area-inset-bottom))',
      }}
    >
      {items.map(({ path, label, icon: Icon }) => {
        const isActive = location.pathname === path;
        return (
          <Link
            key={path}
            to={path}
            className="flex flex-col items-center justify-center flex-1 h-full gap-1 transition-all"
          >
            <div
              className="p-1.5 rounded-lg transition-all"
              style={isActive ? {
                background: 'rgba(197,160,89,0.2)',
                boxShadow: '0 0 10px rgba(197,160,89,0.25)',
              } : {}}
            >
              <Icon
                className="w-5 h-5"
                style={{ color: isActive ? '#f0d080' : 'rgba(197,160,89,0.5)' }}
              />
            </div>
            <span
              className="text-[0.6rem] font-medium"
              style={{ color: isActive ? '#f0d080' : 'rgba(197,160,89,0.45)' }}
            >
              {label}
            </span>
          </Link>
        );
      })}
    </div>
  );
}