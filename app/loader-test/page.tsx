"use client";

import React from "react";
import StellalphaLoader from "@/components/StellalphaLoader";

export default function LoaderTestPage() {
  return (
    <div className="h-screen w-full bg-[#050505] flex flex-col items-center justify-center">
      <StellalphaLoader size={400} />
      <p className="mt-8 text-emerald-500/50 font-mono text-sm tracking-widest animate-pulse">
        ALMOST THERE...
      </p>
    </div>
  );
}
