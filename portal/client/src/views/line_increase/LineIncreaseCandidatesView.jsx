import { useEffect } from 'react';
import Card from '../../components/Card';
import LoadingSpinner from '../../components/LoadingSpinner';

const pct = (x) => `${(x * 100).toFixed(1)}%`;
const usd = (x) => `$${Math.round(x).toLocaleString()}`;

export default function LineIncreaseCandidatesView({ hook }) {
  const { data, loading, load } = hook;
  useEffect(() => { load(); }, [load]);

  return (
    <div data-testid="view-li-candidates" className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-1">Line Increase Candidates</h2>
        <p className="text-sm text-slate-500">
          Eligible accounts ranked by candidate probability; each offer clears the incremental-ROE hurdle.
        </p>
      </div>

      {loading && <LoadingSpinner />}

      {data && (
        <Card>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="py-2">Business</th><th>Band</th><th className="text-right">Prob</th>
                <th className="text-right">Increase</th><th className="text-right">Incr. Exposure</th>
                <th className="text-right">Incr. ROE</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.business_id} data-testid="app-row" className="border-b border-slate-100">
                  <td className="py-2 font-medium text-slate-700">{r.business_id}</td>
                  <td className="text-slate-500">{r.score_band}</td>
                  <td className="text-right tabular-nums">{pct(r.prob)}</td>
                  <td className="text-right tabular-nums">{usd(r.recommended_amount)}</td>
                  <td className="text-right tabular-nums">{usd(r.incremental_ead)}</td>
                  <td className="text-right tabular-nums text-emerald-700">{pct(r.incremental_roe)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
