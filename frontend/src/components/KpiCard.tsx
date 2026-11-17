import React, { useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Info } from 'lucide-react';
import { KpiMetric } from '../types';
import { formatKes } from '../i18n/translations';

interface KpiCardProps {
  label: string;
  metric?: KpiMetric;
  unit?: 'KES' | 'count';
  vsLabel: string;
  invertDeltaColor?: boolean;
}

export const KpiCard: React.FC<KpiCardProps> = ({
  label,
  metric,
  unit = 'KES',
  vsLabel,
  invertDeltaColor = false,
}) => {
  const [showFormula, setShowFormula] = useState(false);

  const available = metric?.available ?? false;
  const formatted = !available
    ? 'Awaiting data'
    : unit === 'KES'
      ? formatKes(metric?.value)
      : Number(metric?.value || 0).toLocaleString('en-KE');

  const delta = metric?.changePct;
  const isPositive = delta !== null && delta !== undefined && delta >= 0;
  const goodColor = invertDeltaColor ? !isPositive : isPositive;

  return (
    <div className="bg-white border border-slate-200/90 rounded-xl p-5 hover:border-slate-300 transition-colors relative">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</span>
        {metric?.formula && (
          <button
            type="button"
            onClick={() => setShowFormula((s) => !s)}
            className="text-slate-400 hover:text-slate-600 p-0.5 rounded"
            title="Inspect KPI formula & data source"
          >
            <Info className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className={`mt-2.5 text-2xl font-bold tracking-tight ${available ? 'text-navy-950' : 'text-slate-400 text-lg font-medium'}`}>
        {formatted}
      </div>

      <div className="mt-2 flex items-center gap-1.5 text-xs">
        {available && delta !== null && delta !== undefined ? (
          <>
            <span
              className={`inline-flex items-center gap-0.5 font-semibold px-1.5 py-0.5 rounded-md ${
                goodColor ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
              }`}
            >
              {isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              {Math.abs(delta)}%
            </span>
            <span className="text-slate-400">{vsLabel}</span>
          </>
        ) : (
          <span className="text-slate-400">
            {available ? 'Baseline period' : 'Import records to activate'}
          </span>
        )}
      </div>

      {showFormula && metric && (
        <div className="mt-3 p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-600 space-y-1">
          <div>
            <span className="font-semibold text-slate-800">Formula:</span> {metric.formula}
          </div>
          <div>
            <span className="font-semibold text-slate-800">Source:</span> <code>{metric.source}</code>
          </div>
        </div>
      )}
    </div>
  );
};
