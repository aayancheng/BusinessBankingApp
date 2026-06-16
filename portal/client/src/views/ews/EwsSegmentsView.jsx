import { useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import Card from '../../components/Card';
import LoadingSpinner from '../../components/LoadingSpinner';

const BAR_COLOR = '#6366f1';

export default function EwsSegmentsView({ hook }) {
  const { data, loading, load } = hook;

  useEffect(() => {
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const byIndustryData = (data?.by_industry || []).map((row) => ({
    name: row.key,
    rate: +(row.deterioration_rate * 100).toFixed(1),
  }));

  return (
    <div data-testid="view-ews-segments" className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-1">Segments</h2>
        <p className="text-sm text-slate-500">
          High-risk share of the book by industry.
        </p>
      </div>

      {(!data || loading) && <LoadingSpinner />}

      {data && !loading && (
        <Card title="High-Risk Share by Industry">
          <div data-testid="ews-segments-chart">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart
                data={byIndustryData}
                layout="vertical"
                margin={{ top: 8, right: 16, left: 80, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" unit="%" tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={76} />
                <Tooltip formatter={(v) => `${v}%`} />
                <Bar dataKey="rate" fill={BAR_COLOR} unit="%" name="High-risk share" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
    </div>
  );
}
