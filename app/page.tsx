"use client";

import React, { useState, useEffect } from "react"; // Modified import
import { motion, AnimatePresence } from "framer-motion";
import PageLoader from "@/components/PageLoader";
import { Hero } from "@/components/landing/Hero";
import { StatsBar } from "@/components/landing/StatsBar";
import { Features } from "@/components/landing/Features";
import { VaultPreview } from "@/components/landing/VaultPreview";
import { TokenUtility } from "@/components/landing/TokenUtility";
import { Roadmap } from "@/components/landing/Roadmap";
import { Team } from "@/components/landing/Team";
import { Footer } from "@/components/landing/Footer";
import { COLORS } from "@/lib/theme";

export default function HomePage() {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 2000); // 2 second splash screen to show off the animation
    return () => clearTimeout(timer);
  }, []);

  if (isLoading) {
    return <PageLoader className="bg-black" />;
  }

  return (
    <div className="min-h-screen font-sans overflow-x-hidden bg-[#050505] text-slate-200 animate-in fade-in duration-700">
      <Hero />
      {/* <StatsBar /> */}
      <VaultPreview />
      <Features />
      <TokenUtility />
      <Roadmap />
      <Team />
      
      {/* Final CTA */}
      <section className="py-24 px-6 border-t border-white/5 relative overflow-hidden">
        {/* Glow effect */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-emerald-500/5 blur-[120px] rounded-full pointer-events-none" />
        
        <div className="max-w-3xl mx-auto text-center relative z-10">
          <h2 className="text-3xl font-medium mb-6 text-white tracking-tight">
            Ready to Automate Your Portfolio?
          </h2>
          <p className="text-slate-400 text-sm leading-relaxed mb-10 max-w-xl mx-auto">
             Select a Star Trader, deposit into your non-custodial vault, and let the protocol handle the execution.
             Zero management fees, purely performance-based.
          </p>
          <div className="flex justify-center gap-4">
             <a href="/demo-vault">
                <button className="h-12 px-8 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-sm transition-all shadow-lg hover:shadow-emerald-500/20">
                  Try Demo
                </button>
             </a>
             <a href="/star-traders">
                <button className="h-12 px-8 rounded-lg border border-white/10 hover:border-white/20 hover:bg-white/5 text-white font-medium text-sm transition-all">
                  Explore Star Traders
                </button>
             </a>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}