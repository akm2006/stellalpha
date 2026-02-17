import React from 'react';

interface SkeletonRowProps {
  className?: string;
}

export function SkeletonRow({ className }: SkeletonRowProps) {
  return (
    <div className={`gap-2 px-5 py-3 items-center animate-pulse border-b border-white/5 ${className || "grid grid-cols-[70px_2fr_0.8fr_0.8fr_0.6fr_0.6fr_70px]"}`}>
      {/* Type Badge */}
      <div>
        <div className="h-5 w-12 bg-white/5 rounded" />
      </div>

      {/* Token Flow */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5">
           <div className="w-6 h-6 rounded-full bg-white/5" />
           <div className="h-4 w-12 bg-white/5 rounded" />
        </div>
        <div className="h-3 w-3 rounded-full bg-white/5" />
        <div className="flex items-center gap-1.5">
           <div className="w-6 h-6 rounded-full bg-white/5" />
           <div className="h-4 w-12 bg-white/5 rounded" />
        </div>
      </div>

      {/* USD Value */}
      <div>
        <div className="h-4 w-16 bg-white/5 rounded" />
      </div>

      {/* Profit */}
      <div>
         <div className="h-4 w-14 bg-white/5 rounded" />
      </div>

      {/* Latency */}
      <div>
         <div className="h-3 w-10 bg-white/5 rounded" />
      </div>

      {/* Age */}
      <div>
         <div className="h-3 w-12 bg-white/5 rounded" />
      </div>

      {/* Actions */}
      <div className="flex justify-end">
         <div className="h-3 w-8 bg-white/5 rounded" />
      </div>
    </div>
  );
}
