import { useState } from 'react';
import Card from '../../components/Card';
import StatCard from '../../components/StatCard';
import ApplicantSelect from '../../components/ApplicantSelect';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorBanner from '../../components/ErrorBanner';
import ReasonList from '../../components/ReasonList';
import RiskTierBadge from '../../components/RiskTierBadge';
import RiskTrajectory from '../../components/RiskTrajectory';

const pct = (x) => `${(x * 100).toFixed(1)}%`;

export default function EwsLookupView({ hook }) {
  const { data, error, loading, lookup } = hook;
  const [id, setId] = useState('');

  return (
    <div data-testid="view-ews-lookup" className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-1">Early-Warning Lookup</h2>
        <p className="text-sm text-slate-500">
          Enter a business ID to view its deterioration risk, active triggers and trajectory.
        </p>
      </div>

      <Card>
        <ApplicantSelect value={id} onChange={setId} onLookup={() => lookup(id)} />
      </Card>

      <ErrorBanner error={error} />

      {loading && <LoadingSpinner />}

      {data && !loading && (
        <>
          <div className="flex flex-wrap items-center gap-4">
            <RiskTierBadge tier={data.risk_tier} />
            <span className="text-sm text-slate-500">
              {data.business_id} · {data.industry}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard label="Deterioration Probability" value={pct(data.prob)} />
          </div>

          <Card title="Active Triggers">
            {data.triggers && data.triggers.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {data.triggers.map((t, i) => (
                  <span
                    key={`${i}-${t}`}
                    className="inline-flex items-center rounded-full bg-rose-50 text-rose-700 text-xs font-medium px-3 py-1"
                  >
                    {t}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400 italic">No active triggers</p>
            )}
          </Card>

          <Card title="Risk Trajectory">
            <RiskTrajectory series={data.trajectory} />
          </Card>

          <Card title="Why this score">
            <ReasonList ruleHits={data.triggers} shapReasons={data.top_shap_reasons} />
          </Card>
        </>
      )}
    </div>
  );
}
