import React, { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import Sidebar from './Sidebar';
import MobileHeader from './MobileHeader';
import BottomNav from './BottomNav';

const pageVariants = {
  initial: { opacity: 0, x: 16 },
  in: { opacity: 1, x: 0 },
  out: { opacity: 0, x: -16 },
};
const pageTransition = { duration: 0.22, ease: 'easeInOut' };

export default function AppLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const location = useLocation();

  return (
    <div className="flex min-h-screen" style={{background: '#050505'}}>
        {/* Desktop Sidebar */}
        <div className="hidden md:block">
          <Sidebar collapsed={sidebarCollapsed} setCollapsed={setSidebarCollapsed} />
        </div>
        {/* Mobile Header + Modules Bar */}
        <MobileHeader />
        <main
          className={`flex-1 min-h-screen transition-all duration-300 pt-14 md:pt-0 ${sidebarCollapsed ? 'md:ml-16' : 'md:ml-64'}`}
          style={{
            background: '#050505',
            paddingBottom: 'calc(56px + env(safe-area-inset-bottom))',
          }}
        >
          {/* Top gold accent line */}
          <div className="hidden md:block h-px w-full" style={{background: 'linear-gradient(90deg, transparent, rgba(197,160,89,0.3), rgba(197,160,89,0.5), rgba(197,160,89,0.3), transparent)'}} />
          <div className="p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial="initial"
                animate="in"
                exit="out"
                variants={pageVariants}
                transition={pageTransition}
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
        {/* Mobile Bottom Navigation */}
        <BottomNav />
    </div>
  );
}