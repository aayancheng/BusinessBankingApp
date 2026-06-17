import { useEffect } from 'react';
import Card from '../components/Card';
import StatCard from '../components/StatCard';
import LoadingSpinner from '../components/LoadingSpinner';

export default function Dashboard({ hook }) {
  const { data, load } = hook;

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div data-testid="view-dashboard" className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-1">Portfolio Dashboard</h2>
        <p className="text-sm text-slate-500">
          One synthetic Business Credit Score feeding four decisions — adjudication,
          pricing, early warning, and proactive line increase.
        </p>
      </div>

      {!data && <LoadingSpinner />}

      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <StatCard label="Applicants Scored" value={data.n_applicants.toLocaleString()}
                      hint="Adjudication population" />
            <StatCard label="Model AUC" value={data.model_auc.toFixed(3)}
                      hint="Adjudication hold-out" />
            <StatCard label="Clears ROE Hurdle" value={`${(data.pct_clears_hurdle * 100).toFixed(1)}%`}
                      hint="Booked loans at quoted rate" />
            <StatCard label="High-Risk Accounts" value={data.n_high_risk.toLocaleString()}
                      hint="Early-warning watchlist (High tier)" />
            <StatCard label="Line-Increase Offers" value={data.n_eligible_offers.toLocaleString()}
                      hint="Eligible proactive offers" />
            <StatCard label="Status" value={data.status === 'ok' ? 'Live' : data.status}
                      hint="Backend health" />
          </div>

          <Card title="Five modules, one credit spine">
            <p className="text-sm text-slate-600 leading-relaxed">
              A shared Business Credit Score (WoE + logistic scorecard) is the foundation. On
              top of it, four gradient-boosted decision apps run the SME lending lifecycle:
              <span className="font-medium text-slate-700"> Adjudication</span> (approve / refer /
              decline), <span className="font-medium text-slate-700">Pricing &amp; Profitability</span>
              {' '}(ROE / RAROC), <span className="font-medium text-slate-700">Early Warning</span>
              {' '}(deterioration triggers), and <span className="font-medium text-slate-700">
              Proactive Line Increase</span> (incremental-ROE-gated offers). Open
              <span className="font-medium text-slate-700"> Customer 360</span> to see all five
              for a single business.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
