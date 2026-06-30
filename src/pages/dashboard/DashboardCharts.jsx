import React from 'react';
import { Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer } from 'recharts';

export function DashboardSparkline({ data, color }) {
  return (
    <ResponsiveContainer width="100%" height={40}>
      <LineChart data={data} className="text-[#ef1a1a]">
        <Line type="monotone" dataKey="value" stroke={color} dot={false} strokeWidth={2} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function DashboardRealtimePie() {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <PieChart>
        <Pie data={[{ value: 92 }, { value: 8 }]} innerRadius={60} outerRadius={90} startAngle={90} endAngle={-270} dataKey="value">
          <Cell fill="#f0d080" />
          <Cell fill="rgba(197,160,89,0.2)" />
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}
