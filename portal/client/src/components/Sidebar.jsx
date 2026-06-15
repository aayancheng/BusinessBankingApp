import { LayoutDashboard, Search, SlidersHorizontal, PieChart, Star, DollarSign, AlertTriangle, TrendingUp } from 'lucide-react';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'lookup',    label: 'Lookup',    icon: Search },
  { id: 'whatif',   label: 'What-If',   icon: SlidersHorizontal },
  { id: 'segments', label: 'Segments',  icon: PieChart },
];

const DISABLED_ITEMS = [
  { label: 'Score',         icon: Star },
  { label: 'Pricing',       icon: DollarSign },
  { label: 'Early Warning', icon: AlertTriangle },
  { label: 'Line Increase', icon: TrendingUp },
];

export default function Sidebar({ activeView, onNavigate }) {
  return (
    <aside className="fixed left-0 top-0 h-screen w-56 bg-gradient-to-b from-slate-900 to-slate-800 flex flex-col text-white z-40">
      <div className="px-5 py-6 border-b border-slate-700">
        <h1 className="text-base font-bold tracking-tight text-white leading-tight">
          Adjudication Portal
        </h1>
        <p className="text-xs text-slate-400 mt-0.5">Business Banking</p>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            data-testid={`nav-${id}`}
            onClick={() => onNavigate?.(id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
              activeView === id
                ? 'bg-white/15 border-l-2 border-emerald-400 text-white'
                : 'text-slate-300 hover:bg-white/5 hover:text-white border-l-2 border-transparent'
            }`}
          >
            <Icon size={17} />
            {label}
          </button>
        ))}

        <div className="pt-4 pb-1">
          <p className="px-3 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
            Coming soon
          </p>
        </div>

        {DISABLED_ITEMS.map(({ label, icon: Icon }) => (
          <div
            key={label}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 border-l-2 border-transparent cursor-not-allowed select-none"
          >
            <Icon size={17} />
            {label}
          </div>
        ))}
      </nav>

      <div className="px-5 py-4 text-[11px] text-slate-500 border-t border-slate-700">
        Adjudication Module v1
      </div>
    </aside>
  );
}
