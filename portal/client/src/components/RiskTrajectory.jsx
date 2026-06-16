import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function RiskTrajectory({ series = [] }) {
  const data = series.map((p) => ({
    month: p.month_index,
    Utilization: +(p.utilization * 100).toFixed(1),
    DPD: p.days_past_due,
  }));
  return (
    <div data-testid="ews-trajectory">
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="month" tick={{ fontSize: 12 }} />
          <YAxis yAxisId="l" tick={{ fontSize: 12 }} unit="%" />
          <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 12 }} />
          <Tooltip />
          <Legend />
          <Line yAxisId="l" type="monotone" dataKey="Utilization" stroke="#6366f1" dot={false} />
          <Line yAxisId="r" type="monotone" dataKey="DPD" stroke="#f43f5e" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
