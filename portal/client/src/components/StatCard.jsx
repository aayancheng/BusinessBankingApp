export default function StatCard({ label, value, hint }) {
  const kebab = label ? label.toLowerCase().replace(/\s+/g, '-') : 'stat';
  return (
    <div
      className="rounded-xl border-l-4 border-slate-300 bg-slate-50 p-4"
      data-testid={`stat-${kebab}`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}
