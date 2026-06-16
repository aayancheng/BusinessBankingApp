import { RISK_TIER_COLORS } from '../lib/constants';

export default function RiskTierBadge({ tier }) {
  const c = RISK_TIER_COLORS[tier] || RISK_TIER_COLORS.Low;
  return (
    <span data-testid="risk-tier-badge"
      className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-semibold ${c.bg} ${c.text}`}>
      <span className={`w-2 h-2 rounded-full ${c.dot}`} />
      {tier} risk
    </span>
  );
}
