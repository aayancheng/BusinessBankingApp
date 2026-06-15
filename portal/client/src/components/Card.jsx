export default function Card({ title, children, className = '' }) {
  return (
    <div className={`bg-white rounded-2xl shadow-md p-5 ${className}`}>
      {title && (
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">
          {title}
        </h2>
      )}
      {children}
    </div>
  );
}
