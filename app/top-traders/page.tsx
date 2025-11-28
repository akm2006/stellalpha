"use client";

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Search, Filter, ArrowUpRight, TrendingUp, Users, Activity } from "lucide-react";
import { COLORS } from "@/lib/theme";
import { fetchTopTraders, Trader } from "@/lib/apify";
import { TraderCard } from "@/components/TraderCard";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingTokens } from "@/components/TrendingTokens";
import { ChevronDown } from "lucide-react";

interface SelectedToken {
    address: string;
    symbol: string;
    name: string;
}

const BGPattern = () => (
    <div 
        className="absolute inset-0 opacity-[0.015]"
        style={{
            backgroundImage: `linear-gradient(${COLORS.structure} 1px, transparent 1px), linear-gradient(90deg, ${COLORS.structure} 1px, transparent 1px)`,
            backgroundSize: '32px 32px'
        }}
    />
);

export default function TopTradersPage() {
    const [traders, setTraders] = useState<Trader[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedToken, setSelectedToken] = useState<SelectedToken | null>(null);

    useEffect(() => {
        async function load() {
            try {
                setLoading(true);
                if (selectedToken) {
                    // Fetch traders for specific token
                    const response = await fetch(`/api/traders/token?mint=${selectedToken.address}`);
                    if (response.ok) {
                        const data = await response.json();
                        setTraders(data);
                    } else {
                        console.error("Failed to fetch token traders");
                        // Fallback to all traders
                        const data = await fetchTopTraders();
                        setTraders(data);
                    }
                } else {
                    // Fetch all traders
                    const data = await fetchTopTraders();
                    setTraders(data);
                }
            } catch (e) {
                console.error(e);
                // Fallback to all traders on error
                try {
                    const data = await fetchTopTraders();
                    setTraders(data);
                } catch (fallbackError) {
                    console.error("Failed to fetch traders:", fallbackError);
                }
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [selectedToken]);

    return (
        <div className="min-h-screen font-sans overflow-x-hidden" style={{ backgroundColor: COLORS.canvas, color: COLORS.text }}>
            {/* Header Section */}
            <section className="relative pt-16 md:pt-24 pb-12 px-6 border-b" style={{ borderColor: COLORS.structure }}>
                <BGPattern />
                <div className="max-w-7xl mx-auto relative z-10">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6 }}
                        className="mb-12"
                    >
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 mb-8">
                            <div className="flex-1">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="p-2 border" style={{ borderColor: COLORS.structure, backgroundColor: COLORS.surface }}>
                                        <TrendingUp size={18} style={{ color: COLORS.brand }} />
                                    </div>
                                    <span className="text-[9px] font-mono tracking-widest" style={{ color: COLORS.data }}>
                                        TOP_TRADERS
                                    </span>
                                </div>
                                <h1 className="text-4xl md:text-5xl font-medium mb-3 tracking-tight" style={{ color: COLORS.text }}>
                                    Copy Trading
                                </h1>
                                <p className="text-sm leading-relaxed max-w-2xl" style={{ color: COLORS.data }}>
                                    Discover and mirror the strategies of top-performing traders on Solana.
                                    Non-custodial, transparent, and verifiable.
                                </p>
                            </div>

                            {/* Controls */}
                            <div className="flex flex-wrap gap-3">
                                {/* Token Selector */}
                                <div className="relative group">
                                    <button 
                                        className="h-11 px-5 border flex items-center gap-2 text-sm transition-all group-hover:border-brand/50"
                                        style={{ 
                                            borderColor: COLORS.structure, 
                                            backgroundColor: COLORS.surface,
                                            color: COLORS.text 
                                        }}
                                    >
                                        <span className="flex items-center gap-2 min-w-[120px] justify-between">
                                            {selectedToken ? (
                                                <>
                                                    <span>{selectedToken.symbol}</span>
                                                </>
                                            ) : (
                                                <>
                                                    <span>All Tokens</span>
                                                </>
                                            )}
                                            <ChevronDown size={14} style={{ color: COLORS.data }} />
                                        </span>
                                    </button>
                                    {selectedToken && (
                                        <button
                                            onClick={() => setSelectedToken(null)}
                                            className="absolute -top-6 right-0 text-[10px] font-mono hover:text-brand transition-colors"
                                            style={{ color: COLORS.data }}
                                        >
                                            CLEAR
                                        </button>
                                    )}
                                </div>

                                {/* Search */}
                                <div className="relative">
                                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: COLORS.data }} />
                                    <input
                                        type="text"
                                        placeholder="Search traders..."
                                        className="h-11 pl-10 pr-4 border text-sm transition-all focus:border-brand/50 focus:outline-none"
                                        style={{ 
                                            borderColor: COLORS.structure, 
                                            backgroundColor: COLORS.surface,
                                            color: COLORS.text,
                                            width: '200px'
                                        }}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Quick Filters */}
                        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                            {['All Traders', 'Top PnL', 'High Volume', 'Active'].map((filter, i) => (
                                <button
                                    key={filter}
                                    className={`px-4 py-2 text-xs font-mono border transition-all whitespace-nowrap ${
                                        i === 0
                                            ? 'border-brand bg-brand/10'
                                            : 'border-structure hover:border-brand/50'
                                    }`}
                                    style={i === 0 
                                        ? { borderColor: COLORS.brand, backgroundColor: `${COLORS.brand}10`, color: COLORS.text }
                                        : { borderColor: COLORS.structure, color: COLORS.data, backgroundColor: COLORS.surface }
                                    }
                                >
                                    {filter}
                                </button>
                            ))}
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* Content Section */}
            <section className="py-16 px-6 relative" style={{ backgroundColor: COLORS.canvas }}>
                <div className="max-w-7xl mx-auto">
                    <div className="flex flex-col lg:flex-row gap-8">
                        {/* Main List */}
                        <div className="flex-1">
                            {loading ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                    {[...Array(6)].map((_, i) => (
                                        <div 
                                            key={i} 
                                            className="border p-6 space-y-4"
                                            style={{ borderColor: COLORS.structure, backgroundColor: COLORS.surface }}
                                        >
                                            <div className="flex items-center gap-4">
                                                <Skeleton className="h-12 w-12 rounded-full" style={{ backgroundColor: `${COLORS.structure}40` }} />
                                                <div className="space-y-2 flex-1">
                                                    <Skeleton className="h-4 w-24" style={{ backgroundColor: `${COLORS.structure}40` }} />
                                                    <Skeleton className="h-3 w-16" style={{ backgroundColor: `${COLORS.structure}40` }} />
                                                </div>
                                            </div>
                                            <Skeleton className="h-20 w-full" style={{ backgroundColor: `${COLORS.structure}40` }} />
                                            <div className="grid grid-cols-2 gap-4">
                                                <Skeleton className="h-10 w-full" style={{ backgroundColor: `${COLORS.structure}40` }} />
                                                <Skeleton className="h-10 w-full" style={{ backgroundColor: `${COLORS.structure}40` }} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : traders.length === 0 ? (
                                <div className="text-center py-16 border" style={{ borderColor: COLORS.structure, backgroundColor: COLORS.surface }}>
                                    <Users size={48} className="mx-auto mb-4 opacity-20" style={{ color: COLORS.data }} />
                                    <p className="text-sm font-mono" style={{ color: COLORS.data }}>
                                        {selectedToken ? `No traders found for ${selectedToken.symbol}` : 'No traders found'}
                                    </p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                    {traders.map((trader, index) => (
                                        <TraderCard key={trader.id} trader={trader} index={index} />
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Right Sidebar - Trending Tokens */}
                        <div className="w-full lg:w-80 shrink-0">
                            <div className="sticky top-24">
                                <TrendingTokens 
                                    onTokenSelect={(token) => setSelectedToken(token)}
                                    selectedToken={selectedToken}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
