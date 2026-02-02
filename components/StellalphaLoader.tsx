"use client";

import React from "react";
import { motion, Variants } from "framer-motion";
import { cn } from "@/lib/utils";

const PATHS = [
  "M187.43 331.101L368.93 196.101L443.93 175.601L301.93 282.101L162.43 384.101L187.43 331.101Z",
  "M268.43 176.101L373.43 193.601L441.43 176.101L286.93 148.601L268.43 176.101Z",
  "M221.93 0.601471L286.93 149.101L268.43 177.101L221.93 76.6015V0.601471Z",
  "M155.43 148.601L222.93 1.60147L220.93 76.1015L175.43 176.601L155.43 148.601Z",
  "M0.929932 174.601L154.93 148.601L174.93 176.101L74.4299 193.601L0.929932 174.601Z",
  "M122.43 272.101L0.929932 176.101L73.4299 194.101L136.93 243.101L122.43 272.101Z",
  "M367.93 432.101L309.43 312.101L284.43 330.601L320.43 405.101L367.93 432.101Z",
  "M122.93 402.601L76.4299 431.601L222.43 133.101V201.101L122.93 402.601Z",
  "M245.93 248.101L222.43 201.101V133.101L270.43 228.101L245.93 248.101Z"
];

interface StellalphaLoaderProps {
  className?: string; // For container styling
  size?: number;      // Size in pixels
}

const StellalphaLoader = ({ className, size = 100 }: StellalphaLoaderProps) => {
  // Staggered sequence:
  // 1. Draw outlines (0 -> 1)
  // 2. Fill in (0 -> 1)
  // 3. Pulse / Hold
  // 4. Fade out / Un-draw to restart
  
  const pathVariants: Variants = {
    hidden: {
      pathLength: 0,
      opacity: 0,
      fillOpacity: 0,
    },
    visible: (i: number) => ({
      pathLength: [0, 1, 1, 1, 0], // Draw, Stay, Stay, Undraw
      opacity: [0, 1, 1, 1, 0],    // Fade in, Stay, Stay, Fade out
      fillOpacity: [0, 0, 1, 0, 0], // No fill, No fill, Fill, No fill, No fill
      
      transition: {
        duration: 4,               // Total cycle length
        ease: "easeInOut",
        repeat: Infinity,
        repeatDelay: 0.5,
        times: [0, 0.3, 0.5, 0.8, 1], // Keyframe timing percentages
        delay: i * 0.05,            // Stagger effect based on index
      },
    }),
  };

  return (
    <div className={cn("flex justify-center items-center", className)}>
      <motion.svg
        width={size}
        height={size}
        viewBox="0 0 445 436"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="filter drop-shadow-[0_0_8px_rgba(1,181,92,0.6)]" // Tailwind filter for glow
      >
        <defs>
          <linearGradient id="neonGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#01B55C" />
            <stop offset="100%" stopColor="#00FF85" />
          </linearGradient>
        </defs>

        {PATHS.map((d, index) => (
          <motion.path
            key={index}
            custom={index}     // Pass index for stagger
            d={d}
            stroke="url(#neonGradient)" 
            strokeWidth="3"
            fill="url(#neonGradient)" 
            variants={pathVariants}
            initial="hidden"
            animate="visible"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </motion.svg>
    </div>
  );
};

export default StellalphaLoader;
