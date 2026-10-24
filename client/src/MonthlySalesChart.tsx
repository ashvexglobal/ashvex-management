import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const quantity = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

export default function MonthlySalesChart({ data, granularity }: { data: Array<{ label: string; units: number }>; granularity: 'day' | 'month' }) {
  return <div className="monthly-sales-chart">
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
        <defs><linearGradient id="monthlySalesFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4f46e5" stopOpacity={0.22} /><stop offset="100%" stopColor="#4f46e5" stopOpacity={0.02} /></linearGradient></defs>
        <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" vertical={false} />
        <XAxis dataKey="label" axisLine={false} tickLine={false} interval={granularity === 'day' ? 4 : 0} tick={{ fill: '#64748b', fontSize: 12 }} />
        <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} width={42} />
        <Tooltip formatter={(value) => [`${quantity.format(Number(value))} units`, 'Sold']} contentStyle={{ border: '1px solid #e2e8f0', borderRadius: 10, boxShadow: '0 8px 24px rgba(15, 23, 42, 0.1)' }} />
        <Area type="monotone" dataKey="units" name="Units sold" stroke="#4f46e5" strokeWidth={3} fill="url(#monthlySalesFill)" activeDot={{ r: 5, strokeWidth: 0 }} />
      </AreaChart>
    </ResponsiveContainer>
  </div>;
}
