import { useState, useEffect } from 'react';
import Card from '../components/Card';
import StatCard from '../components/StatCard';
import ApplicantSelect from '../components/ApplicantSelect';
import DecisionBadge from '../components/DecisionBadge';
import ReasonList from '../components/ReasonList';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorBanner from '../components/ErrorBanner';
import { fetchApplications } from '../lib/api';

export default function LookupView({ hook }) {
  const { data, error, loading, lookup } = hook;
  const [id, setId] = useState('');
  const [exampleIds, setExampleIds] = useState([]);

  // On mount, load a few example IDs so the view isn't empty
  useEffect(() => {
    fetchApplications(1, 3)
      .then((res) => {
        const ids = (res.items || []).map((i) => i.business_id);
        setExampleIds(ids);
        // Auto-seed the first ID and look it up
        if (ids.length > 0) {
          setId(ids[0]);
          lookup(ids[0]);
        }
      })
      .catch(() => {
        // non-fatal: just leave the view empty
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleLookup() {
    lookup(id);
  }

  return (
    <div data-testid="view-lookup" className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-1">Applicant Lookup</h2>
        <p className="text-sm text-slate-500">
          Enter a business ID to view the adjudication decision and risk profile.
        </p>
      </div>

      <Card>
        <ApplicantSelect value={id} onChange={setId} onLookup={handleLookup} />
        {exampleIds.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="text-xs text-slate-400 self-center">Examples:</span>
            {exampleIds.map((eid) => (
              <button
                key={eid}
                onClick={() => { setId(eid); lookup(eid); }}
                className="text-xs px-2.5 py-1 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
              >
                {eid}
              </button>
            ))}
          </div>
        )}
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
