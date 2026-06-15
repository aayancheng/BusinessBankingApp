import { useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import Card from '../components/Card';
import LoadingSpinner from '../components/LoadingSpinner';

const APPROVE_COLOR = '#10b981';
const REFER_COLOR   = '#f59e0b';
const DECLINE_COLOR = '#f43f5e';

export default function SegmentsView({ hook }) {
  const { data, loading, load } = hook;

  useEffect(() => {
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Convert fractions → percentages for the chart
  const byBandData = (data?.by_band || []).map((row) => ({
    name: row.key,
    Approve: +(row.approve * 100).toFixed(1),
    Refer:   +(row.refer   * 100).toFixed(1),
    Decline: +(row.decline * 100).toFixed(1),
  }));

  const byIndustryData = (data?.by_industry || []).map((row) => ({
    name: row.key,
    Approve: +(row.approve * 100).toFixed(1),
    Refer:   +(row.refer   * 100).toFixed(1),
    Decline: +(row.decline * 100).toFixed(1),
  }));

  return (
    <div data-testid="view-segments" className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-1">Portfolio Segments</h2>
        <p className="text-sm text-slate-500">Decision mix by score band and industry.</p>
      </div>

      {(!data || loading) && <LoadingSpinner />}

      {data && !loading && (
      <div data-testid="segments-chart" className="space-y-5">
        <Card title="Decision Mix by Score Band">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={byBandData} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis unit="%" tick={{ fontSize: 12 }} domain={[0, 100]} />
              <Tooltip formatter={(v) => `${v}%`} />
              <Legend />
              <Bar dataKey="Approve" stackId="a" fill={APPROVE_COLOR} />
              <Bar dataKey="Refer"   stackId="a" fill={REFER_COLOR} />
              <Bar dataKey="Decline" stackId="a" fill={DECLINE_COLOR} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Decision Mix by Industry">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart
              data={byIndustryData}
              layout="vertical"
              margin={{ top: 8, right: 16, left: 80, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" unit="%" tick={{ fontSize: 12 }} domain={[0, 100]} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={76} />
              <Tooltip formatter={(v) => `${v}%`} />
              <Legend />
              <Bar dataKey="Approve" stackId="b" fill={APPROVE_COLOR} />
              <Bar dataKey="Refer"   stackId="b" fill={REFER_COLOR} />
              <Bar dataKey="Decline" stackId="b" fill={DECLINE_COLOR} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
      )}
    </div>
  );
}
