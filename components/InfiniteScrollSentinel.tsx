import React from 'react';

interface InfiniteScrollSentinelProps {
  inputRef: (node: HTMLElement | null) => void;
  loading: boolean;
  hasMore: boolean;
  error?: React.ReactNode;
  skeleton?: React.ReactNode;
  endMessage?: React.ReactNode;
  onLoadMore?: () => void;
  loadMoreLabel?: string;
  className?: string;
}

export function InfiniteScrollSentinel({
  inputRef,
  loading,
  hasMore,
  error,
  skeleton,
  endMessage,
  onLoadMore,
  loadMoreLabel = 'Load more',
  className,
}: InfiniteScrollSentinelProps) {
  return (
    <div ref={inputRef} className={`py-2 min-h-[40px] ${className || ''}`.trim()}>
      {/* Loading State */}
      {loading && (
        <div className="flex flex-col">
          {skeleton || <div className="py-4 text-center text-xs text-gray-500">Loading...</div>}
        </div>
      )}

      {!!error && (
        <div className="mx-3 border border-red-400/35 bg-red-500/10 px-4 py-3 text-sm text-red-200 md:mx-5">
          {error}
        </div>
      )}

      {hasMore && !loading && onLoadMore && (
        <div className="flex justify-center py-4">
          <button
            type="button"
            onClick={onLoadMore}
            className="cyber-control px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/70 transition hover:border-emerald-300/60 hover:text-emerald-200"
          >
            {loadMoreLabel}
          </button>
        </div>
      )}

      {/* End of List State */}
      {!hasMore && (
        endMessage || (
          <div className="flex items-center justify-center gap-4 py-4 opacity-50">
            <div className="h-px w-12 bg-white/10" />
            <span className="text-[10px] text-gray-500 uppercase tracking-widest font-medium">End of History</span>
            <div className="h-px w-12 bg-white/10" />
          </div>
        )
      )}
    </div>
  );
}
