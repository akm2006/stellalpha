'use client';

import React from 'react';
import { Star, Zap, MessageCircle, ExternalLink, Github, Play, Twitter, Mail, FileText, Shield, Wallet, Users, Bot, ArrowRight, CheckCircle } from 'lucide-react';
import { StellaHero } from '@/components/ui/hero';
export default function HomePage() {
  return (
    <div className="min-h-screen relative overflow-hidden">
      
      

      {/* Hero Section */}
      <StellaHero />

      {/* About Stellalpha Section */}
      <section className="relative z-10 py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-8 neon-text">
            The Bridge Between Human Insight and AI Automation
          </h2>
          <div className="glass-card">
            <div className="p-8 md:p-12">
              <p className="text-xl text-gray-300 leading-relaxed">
                Stellalpha is more than just a trading tool—it's a revolutionary platform that bridges the gap 
                between human expertise and artificial intelligence. By allowing users to leverage the insights 
                of proven traders while automating execution through our conversational AI, we've created an 
                ecosystem where strategy meets automation. Our autonomous, gasless infrastructure ensures that 
                every opportunity is captured without the friction of traditional blockchain interactions, 
                making sophisticated trading strategies accessible to everyone in the modern decentralized ecosystem.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="relative z-10 py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4 neon-text">
              How to Get Started in 3 Simple Steps
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <div className="glass-card group relative">
              <div className="absolute -top-4 left-8">
                <div className="bg-cyan-500 text-black font-bold text-lg w-8 h-8 rounded-full flex items-center justify-center shadow-lg shadow-cyan-500/50">
                  1
                </div>
              </div>
              <div className="p-8 pt-12">
                <div className="mb-6 flex justify-center">
                  <div className="relative">
                    <div className="absolute inset-0 bg-cyan-400 blur-lg opacity-30 group-hover:opacity-50 transition-opacity"></div>
                    <Wallet size={48} className="relative text-cyan-400 neon-glow" />
                  </div>
                </div>
                <h3 className="text-2xl font-bold text-white mb-4 text-center">
                  Connect Wallet
                </h3>
                <p className="text-gray-300 leading-relaxed text-center">
                  Connect your MetaMask wallet to the Avalanche Fuji Testnet. This establishes 
                  your identity and allows you to interact with the Stellalpha ecosystem safely.
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="glass-card group relative">
              <div className="absolute -top-4 left-8">
                <div className="bg-cyan-500 text-black font-bold text-lg w-8 h-8 rounded-full flex items-center justify-center shadow-lg shadow-cyan-500/50">
                  2
                </div>
              </div>
              <div className="p-8 pt-12">
                <div className="mb-6 flex justify-center">
                  <div className="relative">
                    <div className="absolute inset-0 bg-cyan-400 blur-lg opacity-30 group-hover:opacity-50 transition-opacity"></div>
                    <Users size={48} className="relative text-cyan-400 neon-glow" />
                  </div>
                </div>
                <h3 className="text-2xl font-bold text-white mb-4 text-center">
                  Follow Stars
                </h3>
                <p className="text-gray-300 leading-relaxed text-center">
                  Browse and select proven "Star Traders" whose strategies align with your goals. 
                  Each trader's performance history and risk profile are transparently displayed.
                </p>
              </div>
            </div>

            {/* Step 3 */}
            <div className="glass-card group relative">
              <div className="absolute -top-4 left-8">
                <div className="bg-cyan-500 text-black font-bold text-lg w-8 h-8 rounded-full flex items-center justify-center shadow-lg shadow-cyan-500/50">
                  3
                </div>
              </div>
              <div className="p-8 pt-12">
                <div className="mb-6 flex justify-center">
                  <div className="relative">
                    <div className="absolute inset-0 bg-cyan-400 blur-lg opacity-30 group-hover:opacity-50 transition-opacity"></div>
                    <Bot size={48} className="relative text-cyan-400 neon-glow" />
                  </div>
                </div>
                <h3 className="text-2xl font-bold text-white mb-4 text-center">
                  Activate Agent
                </h3>
                <p className="text-gray-300 leading-relaxed text-center">
                  Activate your autonomous agent with a dedicated burner wallet's private key. 
                  <span className="text-yellow-400 font-semibold"> Always use a test wallet with minimal funds</span> 
                  to begin gasless copy-trading.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="relative z-10 py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4 neon-text">
              Unlock Your Trading Potential
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {/* Feature 1 */}
            <div className="glass-card group">
              <div className="p-8">
                <div className="mb-6 flex justify-center">
                  <div className="relative">
                    <div className="absolute inset-0 bg-cyan-400 blur-lg opacity-30 group-hover:opacity-50 transition-opacity"></div>
                    <Zap size={48} className="relative text-cyan-400 neon-glow" />
                  </div>
                </div>
                <h3 className="text-2xl font-bold text-white mb-4 text-center">
                  Autonomous Copy-Trading
                </h3>
                <p className="text-gray-300 leading-relaxed text-center">
                  Automatically replicate trades from 'Star Traders' on the Avalanche network. 
                  Never miss an opportunity without worrying about gas fees.
                </p>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="glass-card group">
              <div className="p-8">
                <div className="mb-6 flex justify-center">
                  <div className="relative">
                    <div className="absolute inset-0 bg-cyan-400 blur-lg opacity-30 group-hover:opacity-50 transition-opacity"></div>
                    <MessageCircle size={48} className="relative text-cyan-400 neon-glow" />
                  </div>
                </div>
                <h3 className="text-2xl font-bold text-white mb-4 text-center">
                  Interactive AI Assistant
                </h3>
                <p className="text-gray-300 leading-relaxed text-center">
                  Use natural language to manage your portfolio, check balances, and perform swaps, 
                  making blockchain interaction effortless.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

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
                    <div className="relative w-12 h-12 bg-cyan-500/20 rounded-xl flex items-center justify-center">
                      <span className="text-cyan-400 font-bold text-xl">⚛</span>
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
                    <div className="relative w-12 h-12 bg-cyan-500/20 rounded-xl flex items-center justify-center">
                      <span className="text-cyan-400 font-bold text-xl">⟠</span>
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
                    <div className="relative w-12 h-12 bg-cyan-500/20 rounded-xl flex items-center justify-center">
                      <Zap size={24} className="text-cyan-400" />
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
                    <div className="relative w-12 h-12 bg-cyan-500/20 rounded-xl flex items-center justify-center">
                      <MessageCircle size={24} className="text-cyan-400" />
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
                    <div className="relative w-12 h-12 bg-cyan-500/20 rounded-xl flex items-center justify-center">
                      <span className="text-cyan-400 font-bold text-xl">⚡</span>
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
                    <div className="relative w-12 h-12 bg-cyan-500/20 rounded-xl flex items-center justify-center">
                      <span className="text-cyan-400 font-bold text-xl">🏔</span>
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

      {/* Security and Implementation Details Section */}
      <section className="relative z-10 py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4 neon-text">
              Our Implementation: From Testnet to Mainnet
            </h2>
            <p className="text-xl text-gray-300 max-w-4xl mx-auto leading-relaxed">
              The current version of Stellalpha is a proof-of-concept for hackathon purposes, 
              using a simple EOA (Externally Owned Account) agent model for development simplicity 
              and to demonstrate the functionality of the 0xGasless Agent.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 mb-16">
            {/* Current Development Model */}
            <div className="glass-card group">
              <div className="p-8">
                <div className="mb-6 flex justify-center">
                  <div className="relative">
                    <div className="absolute inset-0 bg-yellow-400 blur-lg opacity-30 group-hover:opacity-50 transition-opacity"></div>
                    <div className="relative w-16 h-16 bg-yellow-500/20 rounded-xl flex items-center justify-center border border-yellow-500/30">
                      <span className="text-yellow-400 font-bold text-2xl">🔧</span>
                    </div>
                  </div>
                </div>
                <h3 className="text-2xl font-bold text-white mb-6 text-center">
                  Current Development Model
                  <span className="block text-lg text-yellow-400 font-normal mt-2">(Testnet)</span>
                </h3>
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-yellow-400 rounded-full mt-3 flex-shrink-0"></div>
                    <div>
                      <h4 className="text-lg font-semibold text-white mb-2">Mechanism</h4>
                      <p className="text-gray-300 leading-relaxed">
                        Uses EOA (Externally Owned Account) and requires the user's private key 
                        to be provided to the backend for transaction signing and execution.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-yellow-400 rounded-full mt-3 flex-shrink-0"></div>
                    <div>
                      <h4 className="text-lg font-semibold text-white mb-2">Purpose</h4>
                      <p className="text-gray-300 leading-relaxed">
                        Designed for development simplicity and to demonstrate the core functionality 
                        of the 0xGasless Agent in a hackathon environment.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Future Production Model */}
            <div className="glass-card group">
              <div className="p-8">
                <div className="mb-6 flex justify-center">
                  <div className="relative">
                    <div className="absolute inset-0 bg-green-400 blur-lg opacity-30 group-hover:opacity-50 transition-opacity"></div>
                    <div className="relative w-16 h-16 bg-green-500/20 rounded-xl flex items-center justify-center border border-green-500/30">
                      <Shield size={32} className="text-green-400" />
                    </div>
                  </div>
                </div>
                <h3 className="text-2xl font-bold text-white mb-6 text-center">
                  Future Production Model
                  <span className="block text-lg text-green-400 font-normal mt-2">(Mainnet Ready)</span>
                </h3>
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-green-400 rounded-full mt-3 flex-shrink-0"></div>
                    <div>
                      <h4 className="text-lg font-semibold text-white mb-2">Mechanism</h4>
                      <p className="text-gray-300 leading-relaxed">
                        Will utilize 0xGasless Smart Accounts, eliminating the need for users 
                        to share their private keys with any external service or backend.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-green-400 rounded-full mt-3 flex-shrink-0"></div>
                    <div>
                      <h4 className="text-lg font-semibold text-white mb-2">Purpose</h4>
                      <p className="text-gray-300 leading-relaxed">
                        Provides enterprise-grade security where users fund their smart accounts 
                        directly and the app only interacts with the smart wallet interface.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Critical Warning Banner */}
          <div className="glass-card border-red-500/50 bg-red-500/10">
            <div className="p-8">
              <h3 className="text-3xl font-bold text-red-400 mb-6 text-center flex items-center justify-center gap-3">
                <span className="text-4xl">⚠️</span>
                Important Notice: Use with Caution
              </h3>
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 mb-6">
                <p className="text-gray-200 leading-relaxed text-center text-lg">
                  Users should <span className="text-red-400 font-bold">NEVER</span> use a wallet with significant funds, 
                  and should <span className="text-red-400 font-bold">ALWAYS</span> use a dedicated burner wallet for testing 
                  on the Avalanche Fuji Testnet. This is an exact quote from the project documentation and represents 
                  a critical security requirement for safe usage.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <div className="flex items-center justify-center gap-2 text-gray-300">
                  <CheckCircle size={20} className="text-green-400" />
                  <span>Use dedicated burner wallet</span>
                </div>
                <div className="flex items-center justify-center gap-2 text-gray-300">
                  <CheckCircle size={20} className="text-green-400" />
                  <span>Fuji Testnet only</span>
                </div>
                <div className="flex items-center justify-center gap-2 text-gray-300">
                  <CheckCircle size={20} className="text-green-400" />
                  <span>Minimal test funds</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

     
      {/* Main Footer */}
      <footer className="relative z-10 py-16 px-4 border-t border-white/10">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-12">
            {/* Brand Column */}
            <div className="md:col-span-2">
              <div className="flex items-center gap-3 mb-6">
                <Star size={32} className="text-cyan-400 fill-cyan-400/20 neon-glow" />
                <h3 className="text-2xl font-bold text-white">Stellalpha</h3>
              </div>
              <p className="text-gray-400 leading-relaxed mb-6 max-w-md">
                Revolutionizing crypto trading with autonomous AI agents and gasless copy-trading 
                on the Avalanche network. Follow the stars to trading success.
              </p>
              <div className="flex gap-4">
                <a 
                  href="#" 
                  className="glass-button bg-white/5 hover:bg-cyan-500/20 text-gray-400 hover:text-cyan-400 border border-white/10 hover:border-cyan-500/50 p-3 rounded-xl transition-all duration-300 hover:scale-110"
                >
                  <Twitter size={20} />
                </a>
                <a 
                  href="#" 
                  className="glass-button bg-white/5 hover:bg-cyan-500/20 text-gray-400 hover:text-cyan-400 border border-white/10 hover:border-cyan-500/50 p-3 rounded-xl transition-all duration-300 hover:scale-110"
                >
                  <Github size={20} />
                </a>
                <a 
                  href="#" 
                  className="glass-button bg-white/5 hover:bg-cyan-500/20 text-gray-400 hover:text-cyan-400 border border-white/10 hover:border-cyan-500/50 p-3 rounded-xl transition-all duration-300 hover:scale-110"
                >
                  <Mail size={20} />
                </a>
              </div>
            </div>

            {/* Product Links */}
            <div>
              <h4 className="text-lg font-semibold text-white mb-4">Product</h4>
              <ul className="space-y-3">
                <li>
                  <a href="#" className="text-gray-400 hover:text-cyan-400 transition-colors duration-300 flex items-center gap-2">
                    Dashboard
                  </a>
                </li>
                <li>
                  <a href="#" className="text-gray-400 hover:text-cyan-400 transition-colors duration-300 flex items-center gap-2">
                    Star Traders
                  </a>
                </li>
                <li>
                  <a href="#" className="text-gray-400 hover:text-cyan-400 transition-colors duration-300 flex items-center gap-2">
                    AI Assistant
                  </a>
                </li>
                <li>
                  <a href="#" className="text-gray-400 hover:text-cyan-400 transition-colors duration-300 flex items-center gap-2">
                    Analytics
                  </a>
                </li>
              </ul>
            </div>

            {/* Resources Links */}
            <div>
              <h4 className="text-lg font-semibold text-white mb-4">Resources</h4>
              <ul className="space-y-3">
                <li>
                  <a href="#" className="text-gray-400 hover:text-cyan-400 transition-colors duration-300 flex items-center gap-2">
                    <FileText size={16} />
                    Documentation
                  </a>
                </li>
                <li>
                  <a href="#" className="text-gray-400 hover:text-cyan-400 transition-colors duration-300 flex items-center gap-2">
                    <Shield size={16} />
                    Security Guide
                  </a>
                </li>
                <li>
                  <a href="#" className="text-gray-400 hover:text-cyan-400 transition-colors duration-300 flex items-center gap-2">
                    <Github size={16} />
                    GitHub
                  </a>
                </li>
                <li>
                  <a href="#" className="text-gray-400 hover:text-cyan-400 transition-colors duration-300 flex items-center gap-2">
                    API Reference
                  </a>
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom Footer */}
          <div className="pt-8 border-t border-white/10">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
              <div className="text-gray-500 text-sm">
                © 2025 Stellalpha. Built for hackathon and development purposes only.
              </div>
              <div className="flex gap-6 text-sm">
                <a href="#" className="text-gray-500 hover:text-cyan-400 transition-colors duration-300">
                  Privacy Policy
                </a>
                <a href="#" className="text-gray-500 hover:text-cyan-400 transition-colors duration-300">
                  Terms of Service
                </a>
                <a href="#" className="text-gray-500 hover:text-cyan-400 transition-colors duration-300">
                  Risk Disclosure
                </a>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
