"use client";

import React from "react";
import { motion, Variants } from "framer-motion";
import { Github, Linkedin } from "lucide-react";
import { useScrollContainer } from "./ScrollProvider";

const TEAM_MEMBERS = [
  {
    name: "Aakash Mandal",
    role: "Founder, Developer",
    bio: "Founder & builder working on blockchain, automation, and decentralized systems. Lead developer of Stellalpha, focused on non-custodial trading infrastructure.",
    socials: {
      x: "https://x.com/aakashbeyond",
      github: "https://github.com/akm2006",
      linkedin: "https://www.linkedin.com/in/aakash-mandal"
    }
  },
  {
    name: "Manobendra Mandal",
    role: "Co-founder, Developer",
    bio: "Co-founder & developer with strong Web3 and full-stack experience. Hackathon-driven builder focused on smart contracts, dApps, and scalable systems.",
    socials: {
      x: "https://x.com/manovmandal",
      github: "https://github.com/manovHacksaw",
      linkedin: "https://www.linkedin.com/in/manob-mandal"
    }
  },
];

const XLogo = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.15 }
  }
};

const itemVariants: Variants = {
  hidden: { opacity: 0, scale: 0.98, y: 15 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } }
};

export const Team = () => {
  const scrollRef = useScrollContainer();
  return (
    <section id="team" className="landing-section snap-start flex items-center justify-center min-h-screen py-24 px-6 bg-[#050505] border-t border-white/5">
        <div className="max-w-7xl mx-auto w-full">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ root: scrollRef as React.RefObject<Element>, once: true }}
            transition={{ duration: 0.6 }}
            className="mb-16"
          >
            <span className="cyber-command mb-3 block text-[10px] text-emerald-400/80">
              Core Contributors
            </span>
            <h2 className="text-2xl md:text-3xl font-medium text-white tracking-tight">
              Protocol Development <span className="text-emerald-400">Team</span>
            </h2>
          </motion.div>

          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ root: scrollRef as React.RefObject<Element>, once: true }}
            variants={containerVariants}
            className="grid md:grid-cols-2 gap-8"
          >
            {TEAM_MEMBERS.map((member) => (
              <motion.div 
                key={member.name}
                variants={itemVariants}
                className="cyber-panel border border-white/10 bg-black/35 group relative overflow-hidden transition-all p-8 hover:border-emerald-400/30"
              >
                <div className="relative z-10">
                  <div className="flex justify-between items-start mb-6">
                    <div className="flex items-center gap-5">
                      <div className="w-14 h-14 bg-[#050505] flex items-center justify-center text-xl font-medium text-emerald-400 border border-white/10 cyber-panel-soft">
                        {member.name.charAt(0)}
                      </div>
                      <div>
                        <h4 className="text-xl font-medium text-white leading-tight">
                          {member.name}
                        </h4>
                        <p className="text-[10px] font-mono text-emerald-500/80 uppercase tracking-widest mt-1.5">
                          {member.role}
                        </p>
                      </div>
                    </div>
                  </div>

                  <p className="text-sm leading-relaxed text-slate-400 mb-8 h-20 md:h-16">
                    {member.bio}
                  </p>

                  <div className="flex items-center gap-5 pt-6 border-t border-white/5">
                    <a href={member.socials.linkedin} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-emerald-400 transition-colors">
                      <Linkedin size={18} />
                    </a>
                    <a href={member.socials.x} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-emerald-400 transition-colors">
                      <XLogo size={18} />
                    </a>
                    <a href={member.socials.github} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-emerald-400 transition-colors">
                      <Github size={18} />
                    </a>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
    </section>
  );
};
