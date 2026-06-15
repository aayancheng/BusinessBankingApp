export default function SliderControl({ testid, label, value, min, max, step = 1, onChange }) {
  const displayValue =
    typeof value === 'number' && step < 1 ? value.toFixed(2) : value;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-slate-600">{label}</label>
        <span className="text-sm font-bold bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-full">
          {displayValue}
        </span>
      </div>
      <input
        type="range"
        data-testid={testid}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-2 bg-slate-200 rounded-full appearance-none cursor-pointer accent-slate-600"
      />
    </div>
  );
}
