import { Search } from 'lucide-react';

export default function ApplicantSelect({ value, onChange, onLookup }) {
  function handleKeyDown(e) {
    if (e.key === 'Enter') onLookup();
  }

  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          type="text"
          data-testid="applicant-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter business ID…"
          className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-800 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
        />
      </div>
      <button
        data-testid="applicant-lookup"
        onClick={onLookup}
        className="px-4 py-2.5 bg-slate-800 text-white text-sm font-medium rounded-xl shadow-sm hover:bg-slate-700 transition-colors"
      >
        Look up
      </button>
    </div>
  );
}
