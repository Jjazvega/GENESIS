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

const APP_BACKGROUND = {
  backgroundColor: '#050505',
  backgroundImage: `
    radial-gradient(circle at 55% -25%, rgba(246, 200, 74, 0.10), transparent 34%),
    linear-gradient(45deg, rgba(255,255,255,0.012) 25%, transparent 25%),
    linear-gradient(-45deg, rgba(255,255,255,0.012) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.012) 75%),
    linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.012) 75%)
  `,
  backgroundSize: 'auto, 24px 24px, 24px 24px, 24px 24px, 24px 24px',
  backgroundPosition: '0 0, 0 0, 0 12px, 12px -12px, -12px 0',
};

export default function AppLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const location = useLocation();
  const sidebarWidth = sidebarCollapsed ? 80 : 310;

  return (
    <div className="min-h-screen" style={APP_BACKGROUND}>
      <Sidebar collapsed={sidebarCollapsed} setCollapsed={setSidebarCollapsed} />
      <MobileHeader />
      <main
        className="min-h-screen transition-all duration-300"
        style={{
          marginLeft: sidebarWidth,
          paddingBottom: 'calc(56px + env(safe-area-inset-bottom))',
        }}
      >
        <div className="mx-auto w-full max-w-[1800px]">
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
      <BottomNav />
    </div>
  );
}
