import { useState } from 'react';
import Card from '../../components/Card';
import StatCard from '../../components/StatCard';
import ApplicantSelect from '../../components/ApplicantSelect';
import PassFailBadge from '../../components/PassFailBadge';
import Waterfall from '../../components/Waterfall';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorBanner from '../../components/ErrorBanner';

const pct = (x) => `${(x * 100).toFixed(1)}%`;

function waterfallRows(wf) {
  return [
    { label: 'Interest income', value: wf.interest_income, kind: 'add' },
    { label: 'Cost of funds', value: wf.cost_of_funds, kind: 'subtract' },
    { label: 'Expected loss', value: wf.expected_loss, kind: 'subtract' },
    { label: 'Operating cost', value: wf.operating_cost, kind: 'subtract' },
    { label: 'Pre-tax profit', value: wf.pre_tax_profit, kind: 'total' },
    { label: 'Tax', value: wf.tax, kind: 'subtract' },
    { label: 'Net income', value: wf.net_income, kind: 'total' },
  ];
}

export default function PricingLookupView({ hook }) {
  const { data, error, loading, lookup } = hook;
  const [id, setId] = useState('');

  return (
    <div data-testid="view-pricing-lookup" className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-1">Pricing Lookup</h2>
        <p className="text-sm text-slate-500">
          Enter a business ID to view its risk-adjusted pricing and profitability.
        </p>
      </div>

      <Card>
        <ApplicantSelect value={id} onChange={setId} onLookup={() => lookup(id)} />
      </Card>

      <ErrorBanner error={error} />

      {loading && <LoadingSpinner />}

      {data && !loading && (
        <>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-slate-600">Hurdle:</span>
            <PassFailBadge pass={data.clears_hurdle} />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="ROE at Quoted" value={pct(data.roe_at_quoted)} />
            <StatCard label="RAROC at Quoted" value={pct(data.raroc_at_quoted)} />
            <StatCard label="Recommended Rate" value={pct(data.recommended_rate)} />
            <StatCard label="Quoted Rate" value={pct(data.quoted_rate)} />
          </div>

          {data.mispriced && (
            <div className="rounded-xl border-l-4 border-amber-400 bg-amber-50 p-4 text-sm text-amber-800">
              Mispriced — rate shortfall of {pct(data.rate_shortfall)}{' '}
              ({Math.round(data.rate_shortfall * 10000)} bps) below the hurdle-clearing rate.
            </div>
          )}

          <Card title="Profitability Waterfall (at Quoted Rate)">
            <Waterfall rows={waterfallRows(data.waterfall_quoted)} />
          </Card>
        </>
      )}
    </div>
  );
}
