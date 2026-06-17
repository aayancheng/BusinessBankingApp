import { Search, ChevronDown } from 'lucide-react';

// Dropdown of example business IDs (each with a module-relevant hint) so users can
// pick a business instead of typing a blank ID. Selecting an option looks it up.
export default function EntitySelect({
  value, options = [], onChange, onLookup, placeholder = 'Select a business…',
}) {
  function handleChange(e) {
    const v = e.target.value;
    onChange(v);
    if (v) onLookup(v);
  }

  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none z-10" />
        <select
          data-testid="applicant-input"
          value={value}
          onChange={handleChange}
          className="w-full pl-9 pr-9 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-800 bg-white shadow-sm appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
        >
          <option value="">{placeholder}</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>{o.id} — {o.hint}</option>
          ))}
        </select>
        <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      </div>
      <button
        data-testid="applicant-lookup"
        onClick={() => value && onLookup(value)}
        className="px-4 py-2.5 bg-slate-800 text-white text-sm font-medium rounded-xl shadow-sm hover:bg-slate-700 transition-colors"
      >
        Look up
      </button>
    </div>
  );
}
