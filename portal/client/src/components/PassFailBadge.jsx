export default function PassFailBadge({ pass, label }) {
  const cls = pass
    ? 'bg-emerald-100 text-emerald-800'
    : 'bg-rose-100 text-rose-800';
  return (
    <span data-testid="roe-badge"
      className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-semibold ${cls}`}>
      <span className={`w-2 h-2 rounded-full ${pass ? 'bg-emerald-500' : 'bg-rose-500'}`} />
      {label || (pass ? 'CLEARS HURDLE' : 'BELOW HURDLE')}
    </span>
  );
}
