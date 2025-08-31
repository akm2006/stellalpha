"use client";
import React from "react";
import Image from "next/image";
import { BackgroundBeams } from "@/components/ui/background-beams";

export const TechStack = () => {
  return (
    <div className="relative overflow-hidden">
      {/* BackgroundBeams component is placed here to fill the TechStack section */}
      <BackgroundBeams />
      
      {/* Technology Stack Section */}
      <section className="relative z-10 py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4 neon-text">
              Built on a Foundation of Innovation
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Next.js & React */}
            <div className="glass-card group">
              <div className="p-6">
                <div className="mb-4 flex justify-center">
                  <div className="relative">
                    <div className="absolute inset-0 bg-cyan-400 blur-lg opacity-20 group-hover:opacity-40 transition-opacity"></div>
                    <div className="relative w-12 p-2 h-12 bg-white rounded-xl flex items-center justify-center">
                      <Image src="/next.png" alt="Next.js" height={40} width={40} className="h-full w-full"/>
                    </div>
                  </div>
                </div>
                <h3 className="text-lg font-bold text-white mb-3 text-center">
                  Next.js & React
                </h3>
                <p className="text-gray-400 text-sm leading-relaxed text-center">
                  Provides a high-performance, server-rendered foundation for a seamless user experience.
                </p>
              </div>
            </div>

            {/* Ethers.js */}
            <div className="glass-card group">
              <div className="p-6">
                <div className="mb-4 flex justify-center">
                  <div className="relative">
                    <div className="absolute inset-0 bg-cyan-400 blur-lg opacity-20 group-hover:opacity-40 transition-opacity"></div>
                    <div className="relative w-12 h-12 bg-cyan-500/20 rounded-xl flex items-center justify-center overflow-hidden">
                      <Image src="/ether.png" alt="Ethers.js" height={40} width={40} className="h-full w-full"/>
                    </div>
                  </div>
                </div>
                <h3 className="text-lg font-bold text-white mb-3 text-center">
                  Ethers.js
                </h3>
                <p className="text-gray-400 text-sm leading-relaxed text-center">
                  A powerful library for interacting with the blockchain, handling wallets, and managing transactions.
                </p>
              </div>
            </div>

            {/* 0xGasless AgentKit SDK */}
            <div className="glass-card group">
              <div className="p-6">
                <div className="mb-4 flex justify-center">
                  <div className="relative">
                    <div className="absolute inset-0 bg-cyan-400 blur-lg opacity-20 group-hover:opacity-40 transition-opacity"></div>
                    <div className="relative w-12 h-12 bg-cyan-500/20 rounded-xl flex items-center justify-center overflow-hidden">
                      <Image src="/gasless.png" alt="Ethers.js" height={40} width={40} className="h-full w-full"/>
                    </div>
                  </div>
                </div>
                <h3 className="text-lg font-bold text-white mb-3 text-center">
                  0xGasless AgentKit SDK
                </h3>
                <p className="text-gray-400 text-sm leading-relaxed text-center">
                  The core infrastructure enabling our autonomous, gasless transactions, abstracting away network fees and complexity.
                </p>
              </div>
            </div>

            {/* LangChain.js & OpenRouter */}
            <div className="glass-card group">
              <div className="p-6">
                <div className="mb-4 flex justify-center">
                  <div className="relative">
                    <div className="absolute inset-0 bg-cyan-400 blur-lg opacity-20 group-hover:opacity-40 transition-opacity"></div>
                    <div className="relative w-12 h-12 bg-white rounded-xl flex items-center justify-center overflow-hidden">
                      <Image src="/langchain.png" alt="LangChain" height={40} width={40} className="h-full w-full"/>
                    </div>
                  </div>
                </div>
                <h3 className="text-lg font-bold text-white mb-3 text-center">
                  LangChain.js & OpenRouter
                </h3>
                <p className="text-gray-400 text-sm leading-relaxed text-center">
                  Powers the on-chain AI assistant, allowing for natural language commands and intelligent decision-making.
                </p>
              </div>
            </div>

            {/* Upstash Redis */}
            <div className="glass-card group">
              <div className="p-6">
                <div className="mb-4 flex justify-center">
                  <div className="relative">
                    <div className="absolute inset-0 bg-cyan-400 blur-lg opacity-20 group-hover:opacity-40 transition-opacity"></div>
                    <div className="relative w-12 p-2 h-12 bg-black rounded-xl flex items-center justify-center">
                      <Image src="/upstash.jpg" alt="upstash" height={40} width={40} className="h-full w-full"/>
                    </div>
                  </div>
                </div>
                <h3 className="text-lg font-bold text-white mb-3 text-center">
                  Upstash Redis
                </h3>
                <p className="text-gray-400 text-sm leading-relaxed text-center">
                  The serverless database used for real-time data storage, including activity logs, user settings, and followed stars.
                </p>
              </div>
            </div>

            {/* Avalanche Network */}
            <div className="glass-card group">
              <div className="p-6">
                <div className="mb-4 flex justify-center">
                  <div className="relative">
                    <div className="absolute inset-0 bg-cyan-400 blur-lg opacity-20 group-hover:opacity-40 transition-opacity"></div>
                    <div className="relative w-12 p-2 h-12 bg-white rounded-xl flex items-center justify-center">
                      <Image src="/avax.png" alt="Next.js" height={40} width={40} className="h-full w-full"/>
                    </div>
                  </div>
                </div>
                <h3 className="text-lg font-bold text-white mb-3 text-center">
                  Avalanche Network
                </h3>
                <p className="text-gray-400 text-sm leading-relaxed text-center">
                  A high-throughput, low-latency blockchain that provides the foundation for all on-chain activity.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}