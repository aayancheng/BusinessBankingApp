import { useState } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './views/Dashboard';
import LookupView from './views/LookupView';
import WhatIfView from './views/WhatIfView';
import SegmentsView from './views/SegmentsView';
import { useApplication, useDecide, useSegments, useHealth } from './lib/hooks';

export default function App() {
  const [view, setView] = useState('lookup');
  const application = useApplication();
  const decideHook = useDecide();
  const segments = useSegments();
  const health = useHealth();

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar activeView={view} onNavigate={setView} />
      <main className="flex-1 md:ml-56 p-6 md:p-8 max-w-5xl">
        {view === 'dashboard' && <Dashboard hook={health} />}
        {view === 'lookup'    && <LookupView hook={application} />}
        {view === 'whatif'   && <WhatIfView hook={decideHook} />}
        {view === 'segments' && <SegmentsView hook={segments} />}
      </main>
    </div>
  );
}
