import { AlertTriangle } from 'lucide-react';

function extractMessage(error) {
  if (!error) return null;
  if (typeof error === 'string') return error;
  if (error.message) return error.message;
  if (error.error) return error.error;
  return String(error);
}

export default function ErrorBanner({ error }) {
  const message = extractMessage(error);
  if (!message) return null;

  return (
    <div className="flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3">
      <AlertTriangle size={18} className="shrink-0" />
      <span className="flex-1 text-sm">{message}</span>
    </div>
  );
}
