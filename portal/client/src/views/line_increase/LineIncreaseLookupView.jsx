import { useState, useEffect } from 'react';
import Card from '../../components/Card';
import StatCard from '../../components/StatCard';
import EntitySelect from '../../components/EntitySelect';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorBanner from '../../components/ErrorBanner';
import ReasonList from '../../components/ReasonList';
import Waterfall from '../../components/Waterfall';
import PassFailBadge from '../../components/PassFailBadge';
import { useExamples } from '../../lib/hooks';

const pct = (x) => `${(x * 100).toFixed(1)}%`;
const usd = (x) => `$${Math.round(x).toLocaleString()}`;

function waterfallRows(w) {
  return [
    { label: 'Interest income', value: w.interest_income, kind: 'add' },
    { label: 'Cost of funds', value: w.cost_of_funds, kind: 'subtract' },
    { label: 'Expected loss', value: w.expected_loss, kind: 'subtract' },
    { label: 'Operating cost', value: w.operating_cost, kind: 'subtract' },
    { label: 'Tax', value: w.tax, kind: 'subtract' },
    { label: 'Net income', value: w.net_income, kind: 'total' },
  ];
}

export default function LineIncreaseLookupView({ hook }) {
  const { data, error, loading, lookup, sim, runSimulate } = hook;
  const [id, setId] = useState('');
  const [amount, setAmount] = useState(0);
  const examples = useExamples();
  const options = examples?.line_increase || [];

  useEffect(() => {
    if (!id && options.length > 0) {
      setId(options[0].id);
      lookup(options[0].id);
    }
  }, [options]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (data) setAmount(data.recommended_amount);
  }, [data]);

  const view = sim || (data ? { incremental: data.incremental, waterfall: data.waterfall,
                                proposed_amount: data.recommended_amount } : null);

  return (
    <div data-testid="view-li-lookup" className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-1">Line Increase Lookup</h2>
        <p className="text-sm text-slate-500">
          Pick a business to view its eligibility, recommended increase, and incremental ROE.
        </p>
      </div>

      <Card>
        <EntitySelect value={id} options={options} onChange={setId} onLookup={lookup} />
      </Card>

      <ErrorBanner error={error} />
      {loading && <LoadingSpinner />}

      {data && !loading && view && (
        <>
          <div className="flex flex-wrap items-center gap-4">
            <PassFailBadge pass={data.eligible}
              label={data.eligible ? 'OFFER ELIGIBLE' : 'NOT ELIGIBLE'} />
            <span className="text-sm text-slate-500">
              {data.business_id} · {data.industry} · band {data.score_band}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard label="Recommended Increase" value={usd(data.recommended_amount)} />
            <StatCard label="Current Utilization" value={pct(data.utilization_onbook)} />
            <StatCard label="Post-Increase Utilization" value={pct(data.post_increase_utilization)} />
          </div>

          <Card title="What-if: proposed increase amount">
            <input
              type="range" data-testid="li-amount-slider"
              min={0} max={Math.max(data.recommended_amount * 2, 1000)} step={1000}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              onMouseUp={() => runSimulate({ business_id: data.business_id, proposed_amount: amount })}
              onTouchEnd={() => runSimulate({ business_id: data.business_id, proposed_amount: amount })}
              className="w-full"
            />
            <div className="mt-2 text-sm text-slate-600">Proposed: {usd(amount)}</div>
          </Card>

          <div className="flex flex-wrap items-center gap-4">
            <PassFailBadge pass={view.incremental.clears_hurdle} />
            <span className="text-sm text-slate-500">
              Incremental ROE {pct(view.incremental.roe)} on {usd(view.incremental.incremental_ead)} exposure
            </span>
          </div>

          <Card title="Incremental profit waterfall">
            <Waterfall rows={waterfallRows(view.waterfall)} />
          </Card>

          <Card title="Why this candidate">
            <ReasonList ruleHits={[]} shapReasons={data.top_shap_reasons} />
          </Card>
        </>
      )}
    </div>
  );
}
