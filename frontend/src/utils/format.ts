/** Format known KES amounts to cents without converting missing values to zero. */
export function formatKesPrecise(value: unknown): string {
  if (value == null || (typeof value === 'string' && !value.trim())) return '—';
  const amount = Number(value);
  return Number.isFinite(amount) ? `KES ${amount.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';
}

/** Compact, signed axis labels for large numeric values; never changes the underlying data. */
export function formatCompactAxis(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const magnitude = Math.abs(value);
  const unit = magnitude >= 1_000_000_000 ? { divisor: 1_000_000_000, suffix: 'b' }
    : magnitude >= 1_000_000 ? { divisor: 1_000_000, suffix: 'm' }
      : magnitude >= 1_000 ? { divisor: 1_000, suffix: 'k' } : null;
  return unit ? `${(value / unit.divisor).toFixed(1).replace(/\.0$/, '')}${unit.suffix}` : String(Math.round(value));
}
