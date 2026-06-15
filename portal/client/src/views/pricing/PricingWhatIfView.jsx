import { useState, useEffect, useRef } from 'react';
import Card from '../../components/Card';
import StatCard from '../../components/StatCard';
import SliderControl from '../../components/SliderControl';
import PassFailBadge from '../../components/PassFailBadge';
import Waterfall from '../../components/Waterfall';
import LoadingSpinner from '../../components/LoadingSpinner';
import { PRICING_WHATIF_FIELDS, PRICING_WHATIF_DEFAULT } from '../../lib/constants';

const pct = (x) => `${(x * 100).toFixed(1)}%`;

function waterfallRows(wf) {
  return [
    { label: 'Interest income', value: wf.interest_income, kind: 'add' },
    { label: 'Cost of funds', value: wf.cost_of_funds, kind: 'subtract' },
    { label: 'Expected loss', value: wf.expected_loss, kind: 'subtract' },
    { label: 'Operating cost', value: wf.operating_cost, kind: 'subtract' },
    { label: 'Pre-tax profit', value: wf.pre_tax_profit, kind: 'total' },
    { label: 'Tax', value: wf.tax, kind: 'subtract' },
    { label: 'Net income', value: wf.net_income, kind: 'total' },
  ];
}

export default function PricingWhatIfView({ hook }) {
  const { data, loading, run } = hook;
  const [params, setParams] = useState({ ...PRICING_WHATIF_DEFAULT });
  const debounceRef = useRef(null);

  useEffect(() => {
    run(PRICING_WHATIF_DEFAULT);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleChange(key, value) {
    const next = { ...params, [key]: value };
    setParams(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      run(next);
    }, 250);
  }

  return (
    <div data-testid="view-pricing-whatif" className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-1">Pricing What-If</h2>
        <p className="text-sm text-slate-500">
          Adjust pricing inputs to explore ROE, RAROC and profitability in real time.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card title="Pricing Inputs">
          <div className="space-y-5">
            {PRICING_WHATIF_FIELDS.map(([key, label, min, max, step]) => (
              <SliderControl
                key={key}
                testid={`slider-${key}`}
                label={label}
                value={params[key]}
                min={min}
                max={max}
                step={step}
                onChange={(v) => handleChange(key, v)}
              />
            ))}
          </div>
        </Card>

        <div className="space-y-4">
          <Card title="Profitability Result">
            {loading && <LoadingSpinner />}
            {!loading && data && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-slate-600">Hurdle:</span>
                  <PassFailBadge pass={data.clears_hurdle} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <StatCard label="ROE" value={pct(data.roe)} />
                  <StatCard label="RAROC" value={pct(data.raroc)} />
                </div>
              </div>
            )}
            {!loading && !data && (
              <p className="text-sm text-slate-400">Adjust sliders to compute profitability.</p>
            )}
          </Card>

          {data && !loading && (
            <Card title="Profitability Waterfall">
              <Waterfall rows={waterfallRows(data.waterfall)} />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
