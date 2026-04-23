'use client';

interface CyberHistorySkeletonRowsProps {
  rows?: number;
  containerClassName?: string;
  rowClassName?: string;
  cellClassNames?: string[];
  ariaLabel?: string;
}

const DEFAULT_CELL_CLASSNAMES = [
  'h-7 w-16',
  'h-3 w-48 max-w-full',
  'h-3 w-20',
  'h-3 w-20',
  'h-3 w-14',
  'h-3 w-12',
  'h-6 w-10',
];

export function CyberHistorySkeletonRows({
  rows = 3,
  containerClassName = 'grid gap-2 px-3 py-2 md:px-0',
  rowClassName = 'cyber-row cyber-panel-soft grid gap-3 border border-white/[0.08] p-4 md:grid-cols-[88px_minmax(280px,2fr)_0.8fr_0.8fr_0.7fr_0.7fr_80px] md:items-center md:border-x-0 md:px-5 md:py-3',
  cellClassNames = DEFAULT_CELL_CLASSNAMES,
  ariaLabel = 'Loading more rows',
}: CyberHistorySkeletonRowsProps) {
  return (
    <div className={containerClassName} aria-label={ariaLabel}>
      {[...Array(rows)].map((_, index) => (
        <div key={`history-skeleton-${index}`} className={rowClassName}>
          {cellClassNames.map((cellClassName, cellIndex) => (
            <div key={`history-skeleton-cell-${index}-${cellIndex}`} className={`cyber-skeleton-block ${cellClassName}`}>
              <span />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
