import { useEffect, useState } from 'react';
import Card from '../components/Card';
import EntitySelect from '../components/EntitySelect';
import DecisionBadge from '../components/DecisionBadge';
import PassFailBadge from '../components/PassFailBadge';
import RiskTierBadge from '../components/RiskTierBadge';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorBanner from '../components/ErrorBanner';
import { useExamples } from '../lib/hooks';

const usd = (n) => `$${Math.round(n).toLocaleString()}`;
const pct = (n) => `${(n * 100).toFixed(1)}%`;

function NotBooked({ title }) {
  return (
    <Card title={title}>
      <p className="text-sm text-slate-400 italic">Not an on-book account — module not applicable.</p>
    </Card>
  );
}

export default function Customer360View({ hook }) {
  const { data, error, loading, lookup } = hook;
  const [id, setId] = useState('');
  const examples = useExamples();
  const options = examples?.customer360 || [];

  // Seed an on-book example first so all five modules light up on open.
  useEffect(() => {
    if (!id && options.length > 0) {
      const seed = options.find((o) => o.hint.includes('on book')) || options[0];
      setId(seed.id);
      lookup(seed.id);
    }
  }, [options]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div data-testid="view-customer360" className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-1">Customer 360</h2>
        <p className="text-sm text-slate-500">
          One business across all five modules — score, adjudication, pricing, early warning, line increase.
        </p>
      </div>

      <EntitySelect value={id} options={options} onChange={setId} onLookup={lookup}
                    placeholder="Select a business…" />

      {loading && <LoadingSpinner />}
      {error && <ErrorBanner message={error.message || 'No business found for that id'} />}

      {data && (
        <div className="space-y-4">
          <Card title="Profile">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-slate-700">
              <span><span className="text-slate-400">ID</span> {data.profile.business_id}</span>
              <span><span className="text-slate-400">Industry</span> {data.profile.industry}</span>
              {data.profile.region && <span><span className="text-slate-400">Region</span> {data.profile.region}</span>}
              {data.profile.annual_revenue != null &&
                <span><span className="text-slate-400">Revenue</span> {usd(data.profile.annual_revenue)}</span>}
              <span><span className="text-slate-400">On book</span> {data.profile.booked ? 'Yes' : 'No'}</span>
              <span className="ml-auto text-2xl font-bold text-slate-800">
                {data.score.business_score}
                <span className="ml-2 text-sm font-medium text-slate-400">{data.score.score_band}</span>
              </span>
            </div>
          </Card>

          <div data-testid="card-360-adjudication">
            <Card title="Adjudication">
              <div className="flex items-center gap-4 text-sm">
                <DecisionBadge decision={data.adjudication.decision} />
                <span className="text-slate-500">PD {pct(data.adjudication.pd)}</span>
                {data.adjudication.top_reason &&
                  <span className="text-slate-400">Top driver: {data.adjudication.top_reason}</span>}
              </div>
            </Card>
          </div>

          <div data-testid="card-360-pricing">
            {data.pricing ? (
              <Card title="Pricing & Profitability">
                <div className="flex items-center gap-4 text-sm">
                  <PassFailBadge pass={data.pricing.clears_hurdle} />
                  <span className="text-slate-500">Quoted {pct(data.pricing.quoted_rate)}</span>
                  <span className="text-slate-500">ROE {pct(data.pricing.roe)}</span>
                </div>
              </Card>
            ) : <NotBooked title="Pricing & Profitability" />}
          </div>

          <div data-testid="card-360-ews">
            {data.ews ? (
              <Card title="Early Warning">
                <div className="flex items-center gap-4 text-sm">
                  <RiskTierBadge tier={data.ews.risk_tier} />
                  <span className="text-slate-500">Deterioration {pct(data.ews.deterioration_prob)}</span>
                  <span className="text-slate-500">{data.ews.n_triggers} trigger(s)</span>
                </div>
              </Card>
            ) : <NotBooked title="Early Warning" />}
          </div>

          <div data-testid="card-360-line_increase">
            {data.line_increase ? (
              <Card title="Proactive Line Increase">
                <div className="flex items-center gap-4 text-sm">
                  <span className={`font-medium ${data.line_increase.eligible ? 'text-emerald-600' : 'text-slate-400'}`}>
                    {data.line_increase.eligible ? 'Offer eligible' : 'Not eligible'}
                  </span>
                  {data.line_increase.eligible && <>
                    <span className="text-slate-500">+{usd(data.line_increase.recommended_amount)}</span>
                    <span className="text-slate-500">Incr. ROE {pct(data.line_increase.incremental_roe)}</span>
                  </>}
                </div>
              </Card>
            ) : <NotBooked title="Proactive Line Increase" />}
          </div>
        </div>
      )}
    </div>
  );
}
