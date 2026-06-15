import { AlertCircle, TrendingDown } from 'lucide-react';

export default function ReasonList({ ruleHits = [], shapReasons = [] }) {
  const hasContent = ruleHits.length > 0 || shapReasons.length > 0;

  if (!hasContent) {
    return (
      <p className="text-sm text-slate-400 py-3 text-center italic">
        No adverse findings — all policy checks passed.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {ruleHits.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle size={15} className="text-rose-500" />
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Policy rule hits
            </h4>
          </div>
          <ul className="space-y-1">
            {ruleHits.map((hit, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-sm text-rose-700 bg-rose-50 rounded-lg px-3 py-1.5"
              >
                <span className="mt-0.5 text-rose-400">•</span>
                {hit}
              </li>
            ))}
          </ul>
        </div>
      )}

      {shapReasons.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown size={15} className="text-amber-500" />
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Top risk drivers
            </h4>
          </div>
          <ul className="space-y-1">
            {shapReasons.map((r, i) => (
              <li
                key={i}
                className="flex items-center justify-between text-sm bg-amber-50 rounded-lg px-3 py-1.5"
              >
                <span className="text-slate-700 capitalize">
                  {r.feature ? r.feature.replace(/_/g, ' ') : r.feature}
                </span>
                <span className="text-amber-700 font-semibold text-xs ml-4">
                  {r.impact != null
                    ? (r.impact > 0 ? '+' : '') + Number(r.impact).toFixed(4)
                    : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
