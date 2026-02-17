import React from 'react';

interface InfiniteScrollSentinelProps {
  inputRef: (node: HTMLElement | null) => void;
  loading: boolean;
  hasMore: boolean;
  skeleton?: React.ReactNode;
  endMessage?: React.ReactNode;
}

export function InfiniteScrollSentinel({ inputRef, loading, hasMore, skeleton, endMessage }: InfiniteScrollSentinelProps) {
  return (
    <div ref={inputRef} className="py-2 min-h-[40px]">
      {/* Loading State */}
      {loading && (
        <div className="flex flex-col">
          {skeleton || <div className="py-4 text-center text-xs text-gray-500">Loading...</div>}
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
