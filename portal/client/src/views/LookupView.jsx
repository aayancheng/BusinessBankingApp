import { useState, useEffect } from 'react';
import Card from '../components/Card';
import StatCard from '../components/StatCard';
import EntitySelect from '../components/EntitySelect';
import DecisionBadge from '../components/DecisionBadge';
import ReasonList from '../components/ReasonList';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorBanner from '../components/ErrorBanner';
import { useExamples } from '../lib/hooks';

export default function LookupView({ hook }) {
  const { data, error, loading, lookup } = hook;
  const [id, setId] = useState('');
  const examples = useExamples();
  const options = examples?.adjudication || [];

  // Auto-seed the first example once options load so the view isn't empty.
  useEffect(() => {
    if (!id && options.length > 0) {
      setId(options[0].id);
      lookup(options[0].id);
    }
  }, [options]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div data-testid="view-lookup" className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-1">Applicant Lookup</h2>
        <p className="text-sm text-slate-500">
          Pick a business to view the adjudication decision and risk profile.
        </p>
      </div>

      <Card>
        <EntitySelect value={id} options={options} onChange={setId} onLookup={lookup} />
      </Card>

      <ErrorBanner error={error} />

      {loading && <LoadingSpinner />}

      {data && !loading && (
        <>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-slate-600">Decision:</span>
            <DecisionBadge decision={data.decision} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label="Probability of Default"
              value={`${(data.pd * 100).toFixed(2)}%`}
              hint="Model PD score"
            />
            <StatCard
              label="Business Score"
              value={data.business_score}
              hint={`${data.score_band} · ${data.industry}`}
            />
          </div>

          <Card title="Key Financial Ratios">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <StatCard label="DSCR" value={data.key_ratios.dscr.toFixed(2)} />
              <StatCard label="Leverage" value={data.key_ratios.leverage.toFixed(2)} />
              <StatCard label="Current Ratio" value={data.key_ratios.current_ratio.toFixed(2)} />
              <StatCard label="Utilization" value={`${(data.key_ratios.utilization * 100).toFixed(1)}%`} />
              <StatCard label="Debt-to-Income" value={data.key_ratios.debt_to_income.toFixed(2)} />
            </div>
          </Card>

          <Card title="Decision Rationale">
            <ReasonList ruleHits={data.rule_hits} shapReasons={data.top_shap_reasons} />
          </Card>
        </>
      )}
    </div>
  );
}
