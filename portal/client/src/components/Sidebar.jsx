import { LayoutDashboard, Search, SlidersHorizontal, PieChart, Star, AlertTriangle, TrendingUp } from 'lucide-react';

const ADJUDICATION_ITEMS = [
  { module: 'adjudication', view: 'lookup',   testid: 'nav-lookup',   label: 'Lookup',   icon: Search },
  { module: 'adjudication', view: 'whatif',   testid: 'nav-whatif',   label: 'What-If',  icon: SlidersHorizontal },
  { module: 'adjudication', view: 'segments', testid: 'nav-segments', label: 'Segments', icon: PieChart },
];

const PRICING_ITEMS = [
  { module: 'pricing', view: 'lookup',    testid: 'nav-pricing-lookup',    label: 'Lookup',    icon: Search },
  { module: 'pricing', view: 'whatif',    testid: 'nav-pricing-whatif',    label: 'What-If',   icon: SlidersHorizontal },
  { module: 'pricing', view: 'portfolio', testid: 'nav-pricing-portfolio', label: 'Portfolio', icon: PieChart },
];

const EWS_ITEMS = [
  { module: 'ews', view: 'lookup',    testid: 'nav-ews-lookup',    label: 'Lookup',    icon: Search },
  { module: 'ews', view: 'watchlist', testid: 'nav-ews-watchlist', label: 'Watchlist', icon: AlertTriangle },
  { module: 'ews', view: 'segments',  testid: 'nav-ews-segments',  label: 'Segments',  icon: PieChart },
];

const DISABLED_ITEMS = [
  { label: 'Score',         icon: Star },
  { label: 'Line Increase', icon: TrendingUp },
];

export default function Sidebar({ module, view, onNavigate }) {
  const itemClass = (active) =>
    `w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
      active
        ? 'bg-white/15 border-l-2 border-emerald-400 text-white'
        : 'text-slate-300 hover:bg-white/5 hover:text-white border-l-2 border-transparent'
    }`;

  const NavButton = (item) => {
    const active = module === item.module && view === item.view;
    const Icon = item.icon;
    return (
      <button
        key={item.testid}
        data-testid={item.testid}
        onClick={() => onNavigate?.(item.module, item.view)}
        className={itemClass(active)}
      >
        <Icon size={17} />
        {item.label}
      </button>
    );
  };

  const GroupHeader = ({ children }) => (
    <div className="pt-4 pb-1">
      <p className="px-3 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
        {children}
      </p>
    </div>
  );

  return (
    <aside className="fixed left-0 top-0 h-screen w-56 bg-gradient-to-b from-slate-900 to-slate-800 flex flex-col text-white z-40">
      <div className="px-5 py-6 border-b border-slate-700">
        <h1 className="text-base font-bold tracking-tight text-white leading-tight">
          Business Banking
        </h1>
        <p className="text-xs text-slate-400 mt-0.5">Unified Portal</p>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <button
          data-testid="nav-dashboard"
          onClick={() => onNavigate?.('dashboard', 'dashboard')}
          className={itemClass(module === 'dashboard')}
        >
          <LayoutDashboard size={17} />
          Dashboard
        </button>

        <GroupHeader>Adjudication</GroupHeader>
        {ADJUDICATION_ITEMS.map(NavButton)}

        <GroupHeader>Pricing</GroupHeader>
        {PRICING_ITEMS.map(NavButton)}

        <GroupHeader>Early Warning</GroupHeader>
        {EWS_ITEMS.map(NavButton)}

        <GroupHeader>Coming soon</GroupHeader>
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
        Adjudication + Pricing + Early Warning
      </div>
    </aside>
  );
}
