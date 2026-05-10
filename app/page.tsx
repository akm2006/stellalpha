import type { Metadata } from "next";
import { Hero } from "@/components/landing/Hero";
import { Features } from "@/components/landing/Features";
import { StrategySection } from "@/components/landing/StrategySection";
import { DemoActivation } from "@/components/landing/DemoActivation";
import { Roadmap } from "@/components/landing/Roadmap";
import { Footer } from "@/components/landing/Footer";
import { SectionIndicator } from "@/components/landing/SectionIndicator";
import { ScrollProvider } from "@/components/landing/ScrollProvider";
import CyberBackground from "@/components/landing/CyberBackground";

export const metadata: Metadata = {
  title: "Stellalpha | Non-custodial copy trading for Solana",
  description:
    "Pick a curated Solana Star Trader, review the recommended copy strategy, and test the allocation loop with virtual capital.",
};

export default function HomePage() {
  return (
    <div className="landing-shell font-sans text-slate-200 bg-transparent">
      <CyberBackground />
      <SectionIndicator />
      <ScrollProvider>
        <Hero />
        <Features />
        <StrategySection />
        <Roadmap />

        <section id="cta" className="landing-section snap-start flex flex-col justify-between min-h-screen relative overflow-hidden border-t border-white/5">
          <div className="absolute inset-0 z-0 opacity-20 pointer-events-none">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-emerald-500/10 rounded-full blur-[120px]" />
          </div>
          
          <DemoActivation />
          
          <Footer />
        </section>
      </ScrollProvider>
    </div>
  );
}
