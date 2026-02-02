"use client";

import React from "react";
import StellalphaLoader from "./StellalphaLoader";
import { cn } from "@/lib/utils";

interface PageLoaderProps {
  className?: string; // Allow customizing the background wrapper
  size?: number;
}

export default function PageLoader({ className, size = 120 }: PageLoaderProps) {
  return (
    <div className={cn("fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm", className)}>
      <div className="flex flex-col items-center gap-4">
        <StellalphaLoader size={size} />
      </div>
    </div>
  );
}
