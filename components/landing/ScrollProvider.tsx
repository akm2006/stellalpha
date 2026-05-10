"use client";

import React, { createContext, useContext, useRef } from "react";

const ScrollContext = createContext<React.RefObject<HTMLElement | null> | null>(null);

export const useScrollContainer = () => {
  return useContext(ScrollContext);
};

export const ScrollProvider = ({ children }: { children: React.ReactNode }) => {
  const containerRef = useRef<HTMLElement>(null);
  
  return (
    <ScrollContext.Provider value={containerRef}>
      <main 
        ref={containerRef}
        className="landing-content h-screen w-full overflow-y-auto overflow-x-hidden snap-y snap-mandatory scrollbar-hide animate-in fade-in duration-700"
      >
        {children}
      </main>
    </ScrollContext.Provider>
  );
};
