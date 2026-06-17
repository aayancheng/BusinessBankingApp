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
import LineIncreaseLookupView from './views/line_increase/LineIncreaseLookupView';
import LineIncreaseCandidatesView from './views/line_increase/LineIncreaseCandidatesView';
import LineIncreaseSegmentsView from './views/line_increase/LineIncreaseSegmentsView';
import {
  useApplication, useDecide, useSegments,
  usePricing, usePricingPortfolio, usePricingQuote,
  useEws, useEwsWatchlist, useEwsSegments,
  useLineIncrease, useCandidates, useLineIncreaseSegments,
  useDashboardSummary,
} from './lib/hooks';

export default function App() {
  const [nav, setNav] = useState({ module: 'adjudication', view: 'lookup' });
  const application = useApplication();
  const decideHook = useDecide();
  const segments = useSegments();
  const dashboard = useDashboardSummary();
  const pricing = usePricing();
  const pricingPortfolio = usePricingPortfolio();
  const pricingQuoteHook = usePricingQuote();
  const ews = useEws();
  const ewsWatch = useEwsWatchlist();
  const ewsSeg = useEwsSegments();
  const lineIncrease = useLineIncrease();
  const candidatesHook = useCandidates();
  const liSeg = useLineIncreaseSegments();

  const onNavigate = (module, view) => setNav({ module, view });
  const is = (m, v) => nav.module === m && nav.view === v;

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar module={nav.module} view={nav.view} onNavigate={onNavigate} />
      <main className="flex-1 md:ml-56 p-6 md:p-8 max-w-5xl">
        {nav.module === 'dashboard' && <Dashboard hook={dashboard} />}
        {is('adjudication', 'lookup') && <LookupView hook={application} />}
        {is('adjudication', 'whatif') && <WhatIfView hook={decideHook} />}
        {is('adjudication', 'segments') && <SegmentsView hook={segments} />}
        {is('pricing', 'lookup') && <PricingLookupView hook={pricing} />}
        {is('pricing', 'whatif') && <PricingWhatIfView hook={pricingQuoteHook} />}
        {is('pricing', 'portfolio') && <PricingPortfolioView hook={pricingPortfolio} />}
        {is('ews', 'lookup') && <EwsLookupView hook={ews} />}
        {is('ews', 'watchlist') && <EwsWatchlistView hook={ewsWatch} />}
        {is('ews', 'segments') && <EwsSegmentsView hook={ewsSeg} />}
        {is('line_increase', 'lookup') && <LineIncreaseLookupView hook={lineIncrease} />}
        {is('line_increase', 'candidates') && <LineIncreaseCandidatesView hook={candidatesHook} />}
        {is('line_increase', 'segments') && <LineIncreaseSegmentsView hook={liSeg} />}
      </main>
    </div>
  );
}
