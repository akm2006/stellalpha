"use client";

import React from "react";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

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

import { Github, Linkedin, Twitter, Wallet } from "lucide-react";

export const Team = () => {
  return (
    <section className="py-24 px-6 bg-[#050505] border-t border-white/5">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-12"
          >
            <h2 className="text-3xl font-medium mb-3 text-white tracking-tight">
              Core Contributors
            </h2>
            <p className="text-sm font-mono tracking-widest text-slate-500 uppercase">
              Protocol Development Team
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-6">
            {TEAM_MEMBERS.map((member, idx) => (
              <motion.div 
                key={member.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
                className="p-6 border border-white/10 bg-[#0A0A0A] hover:border-emerald-500/20 group relative overflow-hidden transition-all rounded-xl"
              >
                
                <div className="relative z-10">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-lg font-medium text-emerald-500 border border-white/10">
                        {member.name.charAt(0)}
                      </div>
                      <div>
                        <h4 className="text-lg font-medium text-white leading-tight">
                          {member.name}
                        </h4>
                        <p className="text-xs font-mono text-emerald-500 mt-1">
                          {member.role}
                        </p>
                      </div>
                    </div>
                  </div>

                  <p className="text-sm leading-relaxed text-slate-400 mb-6 h-16">
                    {member.bio}
                  </p>

                  <div className="flex items-center gap-4">
                    <a href={member.socials.linkedin} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-white transition-colors">
                      <Linkedin size={18} />
                    </a>
                    <a href={member.socials.x} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-white transition-colors">
                      <Twitter size={18} />
                    </a>
                    <a href={member.socials.github} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-white transition-colors">
                      <Github size={18} />
                    </a>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
    </section>
  );
};
