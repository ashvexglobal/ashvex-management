import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const quantity = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

export default function ProductUnitsChart({ data }: { data: Array<{ productName: string; sku: string; units: number }> }) {
  const chartData = data.map((item) => ({ ...item, label: item.productName }));

  return <div className="product-units-chart" style={{ height: Math.max(240, chartData.length * 48) }}>
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 18, left: 6, bottom: 4 }}>
        <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" horizontal={false} />
        <XAxis type="number" allowDecimals axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
        <YAxis type="category" dataKey="label" reversed width={150} axisLine={false} tickLine={false} tick={{ fill: '#334155', fontSize: 12 }} />
        <Tooltip
          formatter={(value) => [`${quantity.format(Number(value))} units`, 'Sold']}
          labelFormatter={(_, payload) => payload?.[0] ? `${payload[0].payload.productName} · ${payload[0].payload.sku}` : ''}
          contentStyle={{ border: '1px solid #e2e8f0', borderRadius: 10, boxShadow: '0 8px 24px rgba(15, 23, 42, 0.1)' }}
        />
        <Bar dataKey="units" name="Units sold" fill="#4f46e5" radius={[0, 6, 6, 0]} maxBarSize={26} />
      </BarChart>
    </ResponsiveContainer>
  </div>;
}
