import { useState, useEffect, useRef } from 'react';
import Card from '../components/Card';
import SliderControl from '../components/SliderControl';
import DecisionBadge from '../components/DecisionBadge';
import ReasonList from '../components/ReasonList';
import LoadingSpinner from '../components/LoadingSpinner';
import { WHATIF_FIELDS, WHATIF_DEFAULT } from '../lib/constants';

export default function WhatIfView({ hook }) {
  const { data, loading, run } = hook;
  const [params, setParams] = useState({ ...WHATIF_DEFAULT });
  const debounceRef = useRef(null);

  // Fire once on mount with defaults so a decision shows immediately
  useEffect(() => {
    run(WHATIF_DEFAULT);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleChange(key, value) {
    const next = { ...params, [key]: value };
    setParams(next);
    // Debounce the API call ~250ms
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      run(next);
    }, 250);
  }

  return (
    <div data-testid="view-whatif" className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-1">What-If Simulator</h2>
        <p className="text-sm text-slate-500">
          Adjust applicant features to explore how the adjudication decision changes.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left: Sliders */}
        <Card title="Feature Inputs">
          <div className="space-y-5">
            {WHATIF_FIELDS.map(([key, label, min, max, step]) => (
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

        {/* Right: Decision output */}
        <div className="space-y-4">
          <Card title="Adjudication Result">
            {loading && <LoadingSpinner />}
            {!loading && data && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-slate-600">Decision:</span>
                  <DecisionBadge decision={data.decision} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-center">
                    <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">PD</p>
                    <p className="text-xl font-bold text-slate-800">
                      {(data.pd * 100).toFixed(2)}%
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-center">
                    <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Score</p>
                    <p className="text-xl font-bold text-slate-800">{data.business_score}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{data.score_band}</p>
                  </div>
                </div>
              </div>
            )}
            {!loading && !data && (
              <p className="text-sm text-slate-400">Adjust sliders to compute a decision.</p>
            )}
          </Card>

          {data && !loading && (
            <Card title="Decision Rationale">
              <ReasonList ruleHits={data.rule_hits} shapReasons={data.top_shap_reasons} />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
