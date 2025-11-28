"use client";

import React from "react";
import { motion } from "framer-motion";
import { TrendingUp, ArrowRight, ExternalLink } from "lucide-react";
import { COLORS } from "@/lib/theme";
import { Trader } from "@/lib/apify";
import Link from "next/link";

interface TraderCardProps {
    trader: Trader;
    index: number;
}

export const TraderCard: React.FC<TraderCardProps> = ({ trader, index }) => {
    const isPositive = trader.pnl >= 0;

    const formatCurrency = (value: number) => {
        if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
        if (value >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
        return `$${value.toFixed(2)}`;
    };

    const formatAddress = (address: string) => {
        if (address.length <= 8) return address;
        return `${address.slice(0, 4)}...${address.slice(-4)}`;
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: index * 0.05 }}
            className="relative group border overflow-hidden"
            style={{ 
                borderColor: COLORS.structure, 
                backgroundColor: COLORS.surface 
            }}
        >
            {/* Hover Gradient Effect */}
            <div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                style={{ background: `linear-gradient(135deg, ${COLORS.brand}05 0%, transparent 100%)` }}
            />

            <div className="p-6 relative z-10 flex flex-col h-full">
                {/* Header: Rank & Avatar */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <img
                                src={trader.avatarUrl}
                                alt={trader.name}
                                className="w-12 h-12 rounded-full border"
                                style={{ borderColor: COLORS.structure }}
                                onError={(e) => {
                                    e.currentTarget.src = `https://api.dicebear.com/7.x/identicon/svg?seed=${trader.id}`;
                                }}
                            />
                            {trader.rank <= 3 && (
                                <div 
                                    className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border-2"
                                    style={{ 
                                        backgroundColor: COLORS.brand,
                                        color: COLORS.canvas,
                                        borderColor: COLORS.canvas
                                    }}
                                >
                                    {trader.rank}
                                </div>
                            )}
                        </div>
                        <div>
                            <h3 
                                className="font-medium text-sm flex items-center gap-2"
                                style={{ color: COLORS.text }}
                            >
                                {formatAddress(trader.id)}
                                <a 
                                    href={`https://solscan.io/account/${trader.id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <ExternalLink size={12} style={{ color: COLORS.data }} />
                                </a>
                            </h3>
                            <p className="text-[10px] font-mono" style={{ color: COLORS.data }}>
                                #{trader.rank}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Main Metrics */}
                <div className="space-y-4 mb-6">
                    {/* ROI */}
                    <div className="flex items-end justify-between">
                        <span className="text-[10px] font-mono tracking-widest" style={{ color: COLORS.data }}>
                            ROI
                        </span>
                        <div 
                            className={`text-2xl font-medium ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}
                        >
                            {isPositive ? '+' : ''}{trader.roi.toFixed(1)}%
                        </div>
                    </div>

                    {/* PnL */}
                    <div className="border-t pt-4" style={{ borderColor: COLORS.structure }}>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-mono" style={{ color: COLORS.data }}>
                                Profit/Loss
                            </span>
                            <div 
                                className={`text-lg font-medium ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}
                            >
                                {isPositive ? '+' : ''}{formatCurrency(trader.pnl)}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="border p-3" style={{ borderColor: COLORS.structure }}>
                        <div className="text-[9px] font-mono mb-1" style={{ color: COLORS.data }}>
                            VOLUME
                        </div>
                        <div className="text-sm font-medium" style={{ color: COLORS.text }}>
                            {formatCurrency(trader.aum)}
                        </div>
                    </div>
                    <div className="border p-3" style={{ borderColor: COLORS.structure }}>
                        <div className="text-[9px] font-mono mb-1" style={{ color: COLORS.data }}>
                            TRADES
                        </div>
                        <div className="text-sm font-medium" style={{ color: COLORS.text }}>
                            {trader.totalTrades}
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="mt-auto flex gap-2 pt-4 border-t" style={{ borderColor: COLORS.structure }}>
                    <Link 
                        href={`/top-traders/${trader.id}`}
                        className="flex-1"
                    >
                        <button 
                            className="w-full h-10 border flex items-center justify-center gap-2 text-xs font-mono transition-all hover:border-brand/50 group"
                            style={{ 
                                borderColor: COLORS.structure,
                                backgroundColor: COLORS.surface,
                                color: COLORS.text
                            }}
                        >
                            VIEW
                            <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
                        </button>
                    </Link>
                    <button 
                        className="flex-1 h-10 border text-xs font-mono font-medium transition-all hover:border-brand/50"
                        style={{ 
                            borderColor: COLORS.brand,
                            backgroundColor: COLORS.brand,
                            color: COLORS.canvas
                        }}
                    >
                        COPY
                    </button>
                </div>
            </div>
        </motion.div>
    );
};
