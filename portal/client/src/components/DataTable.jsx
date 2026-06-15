export default function DataTable({ columns = [], rows = [], onRowClick }) {
  if (!rows || rows.length === 0) {
    return <p className="text-sm text-slate-400 py-4 text-center">No data available.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200">
            {columns.map((col) => (
              <th
                key={col.key}
                className="text-left py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide"
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              data-testid="app-row"
              onClick={() => onRowClick && onRowClick(row)}
              className={`border-b border-slate-100 cursor-pointer transition-colors hover:bg-slate-50 ${
                i % 2 === 1 ? 'bg-slate-50/50' : ''
              }`}
            >
              {columns.map((col) => (
                <td key={col.key} className="py-2.5 px-3 text-slate-700">
                  {row[col.key] != null ? row[col.key] : '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
