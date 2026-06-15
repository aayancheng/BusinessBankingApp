import { useEffect } from 'react';
import Card from '../components/Card';
import StatCard from '../components/StatCard';
import LoadingSpinner from '../components/LoadingSpinner';

export default function Dashboard({ hook }) {
  const { data, load } = hook;

  useEffect(() => {
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div data-testid="view-dashboard" className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-1">Dashboard</h2>
        <p className="text-sm text-slate-500">
          Adjudication model health and portfolio overview.
        </p>
      </div>

      {!data && <LoadingSpinner />}

      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard
              label="Total Applicants"
              value={data.n_applicants.toLocaleString()}
              hint="Scored in population"
            />
            <StatCard
              label="Model AUC"
              value={data.model_auc.toFixed(3)}
              hint="ROC-AUC on hold-out"
            />
            <StatCard
              label="Top-20% Lift"
              value={`${data.top20_lift.toFixed(2)}×`}
              hint="Lift vs. random in top decile"
            />
            <StatCard
              label="Status"
              value={data.status === 'ok' ? 'Live' : data.status}
              hint="Backend health"
            />
          </div>

          <Card title="About this portal">
            <p className="text-sm text-slate-600 leading-relaxed">
              This portal scores applicants using a gradient-boosted model trained on synthetic
              business credit data. The adjudication engine applies policy overlays (DSCR, leverage,
              delinquency rules) on top of the model score, producing Approve / Refer / Decline
              decisions with SHAP-based reason codes.
            </p>
            <p className="mt-3 text-sm text-slate-400">
              Use <span className="font-medium text-slate-600">Lookup</span> to investigate individual
              applicants, <span className="font-medium text-slate-600">What-If</span> to simulate
              decisions under alternative scenarios, and{' '}
              <span className="font-medium text-slate-600">Segments</span> to explore the portfolio
              decision mix.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
