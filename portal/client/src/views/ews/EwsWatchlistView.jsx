import { useEffect } from 'react';
import Card from '../../components/Card';
import DataTable from '../../components/DataTable';
import LoadingSpinner from '../../components/LoadingSpinner';

const COLUMNS = [
  { key: 'business_id', label: 'Account' },
  { key: 'industry', label: 'Industry' },
  { key: 'risk_tier', label: 'Tier' },
  { key: 'prob', label: 'P(deterioration)' },
  { key: 'triggers', label: 'Triggers' },
];

export default function EwsWatchlistView({ hook }) {
  const { data, loading, load } = hook;

  useEffect(() => {
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = (data || []).map((row) => ({
    ...row,
    prob: `${(row.prob * 100).toFixed(1)}%`,
    triggers: (row.triggers || []).join(', '),
  }));

  return (
    <div data-testid="view-ews-watchlist" className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-1">Watchlist</h2>
        <p className="text-sm text-slate-500">
          Accounts ranked by deterioration probability.
        </p>
      </div>

      {(!data || loading) && <LoadingSpinner />}

      {data && !loading && (
        <Card title="Ranked Watchlist">
          <DataTable columns={COLUMNS} rows={rows} rowKey="business_id" />
        </Card>
      )}
    </div>
  );
}
