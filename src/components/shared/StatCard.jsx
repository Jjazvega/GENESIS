import React from 'react';
import { motion } from 'framer-motion';

export default function StatCard({ title, value, subtitle, icon: Icon, trend, trendUp }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-lg p-5 group transition-all duration-300"
      style={{
        background: 'linear-gradient(135deg, #0d0d0d 0%, #0a0a0a 100%)',
        border: '1px solid rgba(197,160,89,0.2)',
        boxShadow: '0 2px 24px rgba(0,0,0,0.7), inset 0 1px 0 rgba(197,160,89,0.06)'
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(197,160,89,0.4)'; e.currentTarget.style.boxShadow = '0 4px 30px rgba(0,0,0,0.8), 0 0 20px rgba(197,160,89,0.08)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(197,160,89,0.2)'; e.currentTarget.style.boxShadow = '0 2px 24px rgba(0,0,0,0.7), inset 0 1px 0 rgba(197,160,89,0.06)'; }}
    >
      {/* Corner accent */}
      <div className="absolute top-0 right-0 w-16 h-16 opacity-30" style={{
        background: 'radial-gradient(circle at top right, rgba(197,160,89,0.15), transparent 70%)'
      }} />
      <div className="flex items-start justify-between relative">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-widest font-medium" style={{color: 'rgba(197,160,89,0.6)'}}>{title}</p>
          <p className="text-2xl font-bold" style={{color: '#f0f0f0'}}>{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          {trend && (
            <p className={`text-xs font-semibold ${trendUp ? 'text-emerald-400' : 'text-red-400'}`}>
              {trendUp ? '▲' : '▼'} {trend}
            </p>
          )}
        </div>
        {Icon && (
          <div className="p-2.5 rounded-lg" style={{background: 'rgba(197,160,89,0.1)', border: '1px solid rgba(197,160,89,0.2)'}}>
            <Icon className="w-5 h-5" style={{color: '#c5a059'}} />
          </div>
        )}
      </div>
    </motion.div>
  );
}