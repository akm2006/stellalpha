'use client';

import { CheckCircle, Clock, Pause, StopCircle } from 'lucide-react';

export function getStatusTone(isSettled: boolean, isPaused: boolean, isInitialized: boolean) {
  if (isSettled) {
    return {
      label: 'Settled',
      icon: StopCircle,
      className: 'border-zinc-500/40 bg-zinc-500/10 text-zinc-300',
    };
  }
  if (isPaused) {
    return {
      label: 'Paused',
      icon: Pause,
      className: 'border-amber-400/45 bg-amber-400/10 text-amber-300',
    };
  }
  if (isInitialized) {
    return {
      label: 'Active',
      icon: CheckCircle,
      className: 'border-emerald-400/45 bg-emerald-400/10 text-emerald-300',
    };
  }
  return {
    label: 'Pending',
    icon: Clock,
    className: 'border-orange-400/45 bg-orange-400/10 text-orange-300',
  };
}

interface StatusBadgeProps {
  isSettled: boolean;
  isPaused: boolean;
  isInitialized: boolean;
}

export function StatusBadge({ isSettled, isPaused, isInitialized }: StatusBadgeProps) {
  const statusTone = getStatusTone(isSettled, isPaused, isInitialized);
  const StatusIcon = statusTone.icon;

  return (
    <span className={`inline-flex items-center gap-1.5 border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${statusTone.className}`}>
      <StatusIcon size={12} />
      {statusTone.label}
    </span>
  );
}
