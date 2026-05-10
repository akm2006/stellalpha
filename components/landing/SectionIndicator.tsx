"use client";

import React, { useEffect, useState } from "react";
import { useScrollContainer } from "./ScrollProvider";
import { motion, AnimatePresence } from "framer-motion";

const SECTIONS = [
  { id: "hero", label: "OVERVIEW" },
  { id: "problem", label: "THE PROBLEM" },
  { id: "solution", label: "SOLUTION" },
  { id: "strategy-container", label: "STRATEGY", stops: ["strategy-synthesis", "strategy-library"] },
  { id: "roadmap", label: "ROADMAP" },
  { id: "cta", label: "GET STARTED" },
];

const SCROLL_STOPS = SECTIONS.flatMap(s => s.stops || [s.id]);

export const SectionIndicator = () => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [activeStopIndex, setActiveStopIndex] = useState(0);
  const scrollRef = useScrollContainer();

  // Track active section and stop based purely on scroll position for perfect reliability
  useEffect(() => {
    const main = document.querySelector('main.landing-content');
    if (!main) return;

    const handleScroll = () => {
      // Calculate which 100vh block we are currently viewing
      const currentStopIndex = Math.round(main.scrollTop / window.innerHeight);
      const safeStopIndex = Math.max(0, Math.min(currentStopIndex, SCROLL_STOPS.length - 1));
      
      if (activeStopIndex !== safeStopIndex) {
        setActiveStopIndex(safeStopIndex);
        
        // Find which SECTION this stop belongs to
        const currentStopId = SCROLL_STOPS[safeStopIndex];
        const sectionIndex = SECTIONS.findIndex(s => s.id === currentStopId || s.stops?.includes(currentStopId));
        if (sectionIndex !== -1 && sectionIndex !== activeIndex) {
          setActiveIndex(sectionIndex);
        }
      }
    };

    // Initial check
    handleScroll();

    main.addEventListener('scroll', handleScroll, { passive: true });
    return () => main.removeEventListener('scroll', handleScroll);
  }, [activeStopIndex, activeIndex]);

  // Keyboard Navigation using the robust activeStopIndex
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const main = document.querySelector('main.landing-content');
      if (!main) return;
      
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const nextIndex = Math.min(activeStopIndex + 1, SCROLL_STOPS.length - 1);
        main.scrollTo({ top: nextIndex * window.innerHeight, behavior: "smooth" });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prevIndex = Math.max(activeStopIndex - 1, 0);
        main.scrollTo({ top: prevIndex * window.innerHeight, behavior: "smooth" });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeStopIndex]);

  return (
    <nav 
      aria-label="Section navigation" 
      className="fixed right-4 md:right-8 top-1/2 -translate-y-1/2 z-50 flex flex-col items-center py-4"
    >
      {/* 
        Correct Dashing Effect:
        1. Vertical SVG line with animated dashoffset (Marching Ants)
        2. High-fidelity industrial glow
      */}
      <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px] pointer-events-none overflow-visible">
        <svg width="2" height="100%" className="overflow-visible">
          {/* Base track */}
          <line
            x1="1" y1="0" x2="1" y2="100%"
            stroke="white"
            strokeWidth="0.5"
            strokeOpacity="0.05"
          />
          {/* Animated Dashes (Marching Ants) */}
          <motion.line
            x1="1" y1="0" x2="1" y2="100%"
            stroke="url(#dashGradient)"
            strokeWidth="1.5"
            strokeDasharray="2, 6"
            animate={{ strokeDashoffset: [0, -8] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
          />
          <defs>
            <linearGradient id="dashGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10B981" stopOpacity="0" />
              <stop offset="50%" stopColor="#10B981" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#10B981" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      <div className="flex flex-col gap-8 relative z-10">
        {SECTIONS.map(({ id, label, stops }, index) => {
          const isActive = activeIndex === index;
          return (
            <button
              key={id}
              aria-label={label}
              onClick={() => {
                const main = document.querySelector('main.landing-content');
                if (main) {
                  const targetId = stops ? stops[0] : id;
                  const stopIndex = SCROLL_STOPS.indexOf(targetId);
                  main.scrollTo({ top: stopIndex * window.innerHeight, behavior: "smooth" });
                }
              }}
              className="group relative flex items-center justify-center h-4 w-4 cursor-pointer"
            >
              {/* Stretching Active Dash */}
              <AnimatePresence>
                {isActive && (
                  <motion.div
                    layoutId="active-dash"
                    initial={{ height: 4, opacity: 0 }}
                    animate={{ height: 24, opacity: 1 }}
                    exit={{ height: 4, opacity: 0 }}
                    className="absolute w-[2px] bg-emerald-400 z-20 rounded-full"
                    style={{
                      boxShadow: '0 0 12px rgba(16,185,129,0.9), 0 0 4px rgba(16,185,129,0.5)',
                    }}
                    transition={{ 
                      type: "spring", 
                      stiffness: 400, 
                      damping: 30,
                      opacity: { duration: 0.2 }
                    }}
                  />
                )}
              </AnimatePresence>

              {/* Static node dot */}
              <div className={`w-1.5 h-1.5 rounded-full transition-all duration-300 relative z-10 ${
                isActive ? "bg-emerald-400 scale-0" : "bg-white/20 group-hover:bg-white/50"
              }`} />
              
              <span className={`absolute right-8 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-[#050505] border border-white/10 rounded-sm text-[10px] font-mono uppercase tracking-[0.25em] transition-all duration-300 pointer-events-none ${
                isActive ? "text-emerald-400 opacity-100 translate-x-0 border-emerald-500/20" : "text-slate-500 opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0"
              }`}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
