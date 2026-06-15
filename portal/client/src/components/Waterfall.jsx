const fmt = (v) => `$${Math.round(v).toLocaleString()}`;

export default function Waterfall({ rows = [] }) {
  return (
    <table className="w-full text-sm" data-testid="pricing-waterfall">
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className={r.kind === 'total' ? 'border-t border-slate-300 font-semibold' : ''}>
            <td className="py-1.5 text-slate-600">
              {r.kind === 'subtract' ? '− ' : r.kind === 'add' ? '+ ' : ''}{r.label}
            </td>
            <td className={`py-1.5 text-right tabular-nums ${
              r.kind === 'subtract' ? 'text-rose-600' : 'text-slate-800'}`}>
              {fmt(r.value)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
