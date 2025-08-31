"use client";
import Link from "next/link";
import React from "react";
import Image from "next/image";
import {
 
  
  Github,
  
  Twitter,
  Mail,
  FileText,
  BookOpenText
  
} from "lucide-react";
export const Footer = () => {
  return (
    <div>
      <footer className="relative z-10 py-16 px-4 border-t border-white/10">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-12">
            {/* Brand Column */}
            <div className="md:col-span-2 ">
              <div className="flex items-center gap-3 mb-6">
                <Image
                                src="/stellalpha.png"
                                alt="Stellalpha logo"
                                width={32}
                                height={32}
                                className="w-8 h-8"
                              />
                <h3 className="text-2xl font-bold text-white">Stellalpha</h3>
              </div>
              <p className="text-gray-400 leading-relaxed mb-6 max-w-md">
                Revolutionizing crypto trading with autonomous AI agents and
                gasless copy-trading on the Avalanche network. Follow the stars
                to trading success.
              </p>
              <div className="flex items-center gap-4">
                <a
                  href="https://x.com/AakashM88827113"
                  target="_blank"
                  className="glass-button bg-white/5 hover:bg-cyan-500/20 text-gray-400 hover:text-cyan-400 border border-white/10 hover:border-cyan-500/50 p-3 rounded-xl transition-all duration-300 hover:scale-110"
                >
                  <Twitter size={20} />
                </a>
                <a
                  href="https://github.com/akm2006"
                    target="_blank"
                  className="glass-button bg-white/5 hover:bg-cyan-500/20 text-gray-400 hover:text-cyan-400 border border-white/10 hover:border-cyan-500/50 p-3 rounded-xl transition-all duration-300 hover:scale-110"
                >
                  <Github size={20} />
                </a>
                <Link 
  href="https://dorahacks.io/buidl/32072" 
  target="_blank" 
  rel="noopener noreferrer"
>
  <div
    className="glass-button h-10 w-10 bg-white/5 hover:bg-cyan-500/20 border border-white/10 hover:border-cyan-500/50 rounded-xl transition-all duration-300 hover:scale-110 overflow-hidden"
  >
    <img 
      src="/dorahacks.jpg" 
      alt="DoraHacks" 
      className="w-full h-full object-cover rounded-md"
    />
  </div>
</Link>

              </div>
            </div>

            
            {/* Resources Links */}
            <div>
              <h4 className="text-lg font-semibold text-white mb-4">
                Resources
              </h4>
              <ul className="space-y-3">
                <li>
                  <a
                    href="https://github.com/0xgasless/agentkit-chat-interface/blob/main/doc.md"
                    target="_blank"
                    className="text-gray-400 hover:text-cyan-400 transition-colors duration-300 flex items-center gap-2"
                  >
                    <FileText size={16} />
                    0xGasless Documentation
                  </a>
                </li>
                <li>
                  <a
                    href="https://github.com/akm2006/stellalpha/blob/main/README.md"
                    target="_blank"
                    className="text-gray-400 hover:text-cyan-400 transition-colors duration-300 flex items-center gap-2"
                  >
                    <BookOpenText size={16} />
                    Usage Guide
                  </a>
                </li>
                <li>
                  <a
                    href="https://github.com/akm2006/stellalpha"
                    target="_blank"
                    className="text-gray-400 hover:text-cyan-400 transition-colors duration-300 flex items-center gap-2"
                  >
                    <Github size={16} />
                    GitHub
                  </a>
                </li>
                <li>
                  <a
                    href="https://github.com/0xgasless/agentkit"
                    target="_blank"
                    className="text-gray-400 hover:text-cyan-400 transition-colors duration-300 flex items-center gap-2"
                  >
                    API Reference
                  </a>
                </li>
              </ul>
            </div>
          </div>

          
        </div>
      </footer>
    </div>
  );
};
