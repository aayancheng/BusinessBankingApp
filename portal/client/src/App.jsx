import { useState } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './views/Dashboard';
import LookupView from './views/LookupView';
import WhatIfView from './views/WhatIfView';
import SegmentsView from './views/SegmentsView';
import PricingLookupView from './views/pricing/PricingLookupView';
import PricingWhatIfView from './views/pricing/PricingWhatIfView';
import PricingPortfolioView from './views/pricing/PricingPortfolioView';
import EwsLookupView from './views/ews/EwsLookupView';
import EwsWatchlistView from './views/ews/EwsWatchlistView';
import EwsSegmentsView from './views/ews/EwsSegmentsView';
import {
  useApplication, useDecide, useSegments, useHealth,
  usePricing, usePricingPortfolio, usePricingQuote,
  useEws, useEwsWatchlist, useEwsSegments,
} from './lib/hooks';

export default function App() {
  const [nav, setNav] = useState({ module: 'adjudication', view: 'lookup' });
  const application = useApplication();
  const decideHook = useDecide();
  const segments = useSegments();
  const health = useHealth();
  const pricing = usePricing();
  const pricingPortfolio = usePricingPortfolio();
  const pricingQuoteHook = usePricingQuote();
  const ews = useEws();
  const ewsWatch = useEwsWatchlist();
  const ewsSeg = useEwsSegments();

  const onNavigate = (module, view) => setNav({ module, view });
  const is = (m, v) => nav.module === m && nav.view === v;

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar module={nav.module} view={nav.view} onNavigate={onNavigate} />
      <main className="flex-1 md:ml-56 p-6 md:p-8 max-w-5xl">
        {nav.module === 'dashboard' && <Dashboard hook={health} />}
        {is('adjudication', 'lookup') && <LookupView hook={application} />}
        {is('adjudication', 'whatif') && <WhatIfView hook={decideHook} />}
        {is('adjudication', 'segments') && <SegmentsView hook={segments} />}
        {is('pricing', 'lookup') && <PricingLookupView hook={pricing} />}
        {is('pricing', 'whatif') && <PricingWhatIfView hook={pricingQuoteHook} />}
        {is('pricing', 'portfolio') && <PricingPortfolioView hook={pricingPortfolio} />}
        {is('ews', 'lookup') && <EwsLookupView hook={ews} />}
        {is('ews', 'watchlist') && <EwsWatchlistView hook={ewsWatch} />}
        {is('ews', 'segments') && <EwsSegmentsView hook={ewsSeg} />}
      </main>
    </div>
  );
}
