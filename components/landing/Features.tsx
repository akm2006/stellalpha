"use client";

import React from "react";
import { motion, Variants } from "framer-motion";
import { 
  AlertTriangle, 
  CheckCircle2, 
  Target, 
  ShieldCheck, 
  Zap,
  ShieldAlert,
  Ban,
  XCircle
} from "lucide-react";
import { useScrollContainer } from "./ScrollProvider";

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const itemVariantsLeft: Variants = {
  hidden: { opacity: 0, x: -40 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.6, type: "spring", bounce: 0.2 } }
};

const itemVariantsRight: Variants = {
  hidden: { opacity: 0, x: 40 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.6, type: "spring", bounce: 0.2 } }
};

const problemRows = [
  ["Custody", "Requires handover of private keys & full wallet control"],
  ["Overload", "Massive, unfiltered trader lists with fragmented data"],
  ["Settings", "Complex, manual configurations leave the strategy unclear"],
];

const problemPoints = [
  {
    title: "Custody Handover",
    desc: "Platforms require your private keys to execute trades.",
    icon: ShieldAlert,
    color: "text-amber-400"
  },
  {
    title: "Information Overload",
    desc: "Uncurated lists make selecting a trader a guessing game.",
    icon: Ban,
    color: "text-amber-500"
  },
  {
    title: "Manual Complexity",
    desc: "Fragmented settings leave the actual strategy unclear.",
    icon: XCircle,
    color: "text-amber-600"
  }
];

const solutionRows = [
  ["Trader", "Curated Star Performer (crypto 挪吒) selected by protocol"],
  ["Strategy", "Exact recommended copy model applied to vault layer"],
  ["Vault", "Non-custodial intent replication enforced by user control"],
];

const solutionPoints = [
  {
    title: "Curated Star Traders",
    desc: "Follow curated, proven performers selected by the protocol.",
    icon: Target,
    color: "text-emerald-400"
  },
  {
    title: "Recommended Strategy",
    desc: "Deploy the exact copy model that fits the trader's history.",
    icon: Zap,
    color: "text-cyan-400"
  },
  {
    title: "Vault Enforcement",
    desc: "Execute trades via a secure, non-custodial vault layer.",
    icon: ShieldCheck,
    color: "text-emerald-500"
  }
];

const FragmentPanel = ({
  tone,
  rows,
  variants,
}: {
  tone: "problem" | "solution";
  rows: string[][];
  variants: any;
}) => {
  const isProblem = tone === "problem";
  const scrollRef = useScrollContainer();

  return (
    <motion.div variants={variants} className="cyber-panel w-full min-h-[336px] border border-white/10 bg-black/35 overflow-hidden flex flex-col">
      <div className="cyber-table-header mb-6 flex items-center justify-between border-b border-white/5 px-6 py-3 shrink-0">
        <div className="flex items-center gap-3">
          {isProblem ? (
            <AlertTriangle size={16} className="text-amber-300" />
          ) : (
            <CheckCircle2 size={16} className="text-emerald-300" />
          )}
          <span className="cyber-command text-[10px] font-bold tracking-[0.2em] text-white/50">
            {isProblem ? "legacy copy setup" : "stellalpha flow"}
          </span>
        </div>
        <span
          className={`border px-2.5 py-1 text-[9px] font-mono uppercase tracking-[0.2em] ${
            isProblem
              ? "border-amber-300/30 text-amber-200/90 bg-amber-500/5"
              : "border-emerald-300/30 text-emerald-200/90 bg-emerald-500/5"
          }`}
        >
          {isProblem ? "vulnerable" : "non-custodial"}
        </span>
      </div>

      <div className="px-6 pb-6 md:px-8 md:pb-8 flex-1 flex flex-col">
        <div className="space-y-3 flex-1">
          {rows.map(([label, value], idx) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, x: isProblem ? 12 : -12 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ root: scrollRef as React.RefObject<Element>, once: true }}
              transition={{ delay: idx * 0.08, duration: 0.35 }}
              className="cyber-row flex items-center justify-between gap-4 border border-white/5 bg-white/[0.015] px-3 py-2 group transition-colors min-h-[52px]"
            >
              <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-500 relative z-10 shrink-0">
                {label}
              </span>
              <span className={`max-w-[14rem] text-right text-xs transition-colors relative z-10 ${isProblem ? "text-slate-400" : "text-emerald-300"}`}>
                {value}
              </span>
            </motion.div>
          ))}
        </div>

        <div className="mt-8 shrink-0">
          <div className="flex justify-between items-end mb-2">
              <span className="text-[8px] font-mono uppercase tracking-widest text-slate-600">Execution Integrity</span>
              <span className="text-[8px] font-mono text-slate-500">{isProblem ? "12%" : "98%"}</span>
          </div>
          <div className="h-1.5 overflow-hidden bg-white/5 cyber-panel-soft">
              <motion.div
              initial={{ width: "5%" }}
              whileInView={{ width: isProblem ? "12%" : "98%" }}
              viewport={{ root: scrollRef as React.RefObject<Element>, once: true }}
              transition={{ duration: 1.2, ease: "circOut" }}
              className={`h-full ${isProblem ? "bg-amber-400/50" : "bg-emerald-400/70"}`}
              />
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export const Features = () => {
  const scrollRef = useScrollContainer();
  return (
    <>
      <section id="problem" className="landing-section snap-start flex items-center justify-center min-h-screen relative overflow-hidden border-b border-white/5 px-6">
        <motion.div 
          initial="hidden"
          whileInView="visible"
          viewport={{ root: scrollRef as React.RefObject<Element>, once: true }}
          variants={containerVariants}
          className="mx-auto grid max-w-7xl w-full items-center gap-12 lg:grid-cols-[1.1fr_0.9fr] py-6"
        >
          <motion.div variants={itemVariantsLeft} className="max-w-xl">
            <span className="cyber-command mb-3 block text-[10px] text-amber-200/80">
              Analysis: Failed Model
            </span>
            <h2 className="mb-5 text-2xl font-medium tracking-tight text-white md:text-3xl">
              Copy trading is <span className="text-amber-400">easy</span> to start, but <span className="text-amber-400/80">dangerous</span> to trust.
            </h2>
            <p className="text-sm leading-relaxed text-slate-400 mb-8">
              Most platforms require <span className="text-amber-300">custody of your private keys</span> to function. 
              This leads to a fragmented and high-risk user experience.
            </p>

            <div className="space-y-4">
              {problemPoints.map((point) => (
                <div key={point.title} className="flex gap-4 group">
                  <div className={`mt-1 shrink-0 ${point.color}`}>
                    <point.icon size={18} />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-200 mb-1 group-hover:text-amber-300 transition-colors">
                      {point.title}
                    </h4>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      {point.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          <FragmentPanel tone="problem" rows={problemRows} variants={itemVariantsRight} />
        </motion.div>
      </section>

      <section id="solution" className="landing-section snap-start flex items-center justify-center min-h-screen relative overflow-hidden border-b border-white/5 px-6">
        <div className="mx-auto max-w-7xl w-full py-4">
          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ root: scrollRef as React.RefObject<Element>, once: true }}
            variants={containerVariants}
            className="grid items-center gap-12 lg:grid-cols-[0.9fr_1.1fr]"
          >
            <div className="order-2 lg:order-1">
              <FragmentPanel tone="solution" rows={solutionRows} variants={itemVariantsLeft} />
            </div>

            <motion.div
              variants={itemVariantsRight}
              className="order-1 max-w-xl lg:order-2"
            >
              <span className="cyber-command mb-3 block text-[10px] text-emerald-400/80">
                Analysis: Stellalpha flow
              </span>
              <h2 className="mb-5 text-2xl font-medium tracking-tight text-white md:text-3xl">
                Choose a Star Trader. <br/>Deploy a <span className="text-emerald-400">non-custodial vault</span>.
              </h2>
              <p className="text-sm leading-relaxed text-slate-400 mb-8">
                Stellalpha bridges the gap between selection and execution. 
                We provide the tools for safe, high-performance copy-trading.
              </p>

              <div className="space-y-4">
                {solutionPoints.map((point) => (
                  <div key={point.title} className="flex gap-4 group">
                    <div className={`mt-1 shrink-0 ${point.color}`}>
                      <point.icon size={18} />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-emerald-400 transition-colors">
                        {point.title}
                      </h4>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        {point.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>
    </>
  );
};
