import { useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import Card from '../../components/Card';
import LoadingSpinner from '../../components/LoadingSpinner';

export default function LineIncreaseSegmentsView({ hook }) {
  const { data, loading, load } = hook;
  useEffect(() => { load(); }, [load]);

  return (
    <div data-testid="view-li-segments" className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-1">Line Increase Segments</h2>
        <p className="text-sm text-slate-500">
          Offer rate and expected incremental exposure by score band.
        </p>
      </div>

      {loading && <LoadingSpinner />}

      {data && (
        <Card title="Offer rate by score band">
          <div data-testid="li-segments-chart" style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
              <BarChart data={data.by_band}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="key" />
                <YAxis tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
                <Tooltip formatter={(v) => `${(v * 100).toFixed(1)}%`} />
                <Bar dataKey="offer_rate" fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
    </div>
  );
}
