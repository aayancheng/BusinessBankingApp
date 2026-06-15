import { DECISION_COLORS } from '../lib/constants';

export default function DecisionBadge({ decision }) {
  const colors = DECISION_COLORS[decision] || {
    bg: 'bg-slate-100',
    text: 'text-slate-700',
    dot: 'bg-slate-400',
  };
  return (
    <span
      data-testid="decision-badge"
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold ${colors.bg} ${colors.text}`}
    >
      <span className={`w-2 h-2 rounded-full ${colors.dot}`} />
      {decision}
    </span>
  );
}
