'use client';

import { ReactNode } from 'react';

interface MetricTileProps {
  label: string;
  value: ReactNode;
  helper?: ReactNode;
  tone?: 'neutral' | 'positive' | 'negative' | 'warning';
  children?: ReactNode;
  className?: string;
}

export function MetricTile({
  label,
  value,
  helper,
  tone = 'neutral',
  children,
  className,
}: MetricTileProps) {
  const valueClass =
    tone === 'positive' ? 'text-emerald-300'
      : tone === 'negative' ? 'text-red-300'
        : tone === 'warning' ? 'text-amber-300'
          : 'text-white';

  return (
    <div className={`cyber-kpi cyber-panel-soft border px-4 py-4 ${className || ''}`.trim()}>
      <div className="cyber-command mb-2 text-[10px] text-white/50">{label}</div>
      <div className={`font-mono text-lg font-semibold tabular-nums ${valueClass}`}>{value}</div>
      {helper && <div className="mt-2 text-xs leading-relaxed text-white/45">{helper}</div>}
      {children}
    </div>
  );
}
