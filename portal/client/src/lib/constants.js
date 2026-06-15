export const DECISION_COLORS = {
  Approve: { bg: 'bg-emerald-100', text: 'text-emerald-800', dot: 'bg-emerald-500' },
  Refer:   { bg: 'bg-amber-100',   text: 'text-amber-800',   dot: 'bg-amber-500' },
  Decline: { bg: 'bg-rose-100',    text: 'text-rose-800',    dot: 'bg-rose-500' },
};

export const SCORE_BANDS = ['D', 'C', 'B', 'A', 'AAA'];

// What-If sliders: [key, label, min, max, step]
export const WHATIF_FIELDS = [
  ['requested_amount', 'Requested Amount', 10000, 1000000, 5000],
  ['dscr', 'DSCR', 0.2, 4.0, 0.05],
  ['leverage', 'Leverage', 0.1, 8.0, 0.1],
  ['current_ratio', 'Current Ratio', 0.2, 4.0, 0.05],
  ['utilization', 'Utilization', 0.0, 1.0, 0.01],
  ['prior_delinquencies', 'Prior Delinquencies', 0, 6, 1],
  ['public_records', 'Public Records', 0, 3, 1],
  ['annual_revenue', 'Annual Revenue', 100000, 10000000, 50000],
];

export const WHATIF_DEFAULT = {
  requested_amount: 150000, dscr: 1.5, leverage: 2.0, current_ratio: 1.4,
  utilization: 0.4, prior_delinquencies: 0, public_records: 0, annual_revenue: 1200000,
};
