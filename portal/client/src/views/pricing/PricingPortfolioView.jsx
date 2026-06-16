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
import StatCard from '../../components/StatCard';
import LoadingSpinner from '../../components/LoadingSpinner';

const BAR_COLOR = '#6366f1';

export default function PricingPortfolioView({ hook }) {
  const { data, loading, load } = hook;

  useEffect(() => {
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const byIndustryData = (data?.by_industry || []).map((row) => ({
    name: row.key,
    mispriced: +(row.mispriced_rate * 100).toFixed(1),
  }));

  return (
    <div data-testid="view-pricing-portfolio" className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-1">Pricing Portfolio</h2>
        <p className="text-sm text-slate-500">
          Hurdle-clearing share, median ROE and mispricing across the book.
        </p>
      </div>

      {(!data || loading) && <LoadingSpinner />}

      {data && !loading && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard
              label="Share Clearing Hurdle"
              value={`${(data.share_clears * 100).toFixed(1)}%`}
            />
            <StatCard
              label="Median ROE"
              value={`${(data.median_roe * 100).toFixed(1)}%`}
            />
            <StatCard
              label="Mispriced EAD"
              value={`$${Math.round(data.mispriced_ead).toLocaleString()}`}
            />
          </div>

          <Card title="Mispriced Rate by Industry">
            <div data-testid="pricing-portfolio-chart">
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
                  <Bar dataKey="mispriced" fill={BAR_COLOR} unit="%" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
