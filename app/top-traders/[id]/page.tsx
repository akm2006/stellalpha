"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
    ArrowLeft,
    TrendingUp,
    DollarSign,
    Activity,
    ExternalLink,
    Copy,
    Share2,
    BarChart3,
    TrendingDown,
    ArrowUpRight,
    ArrowDownRight,
    User
} from "lucide-react";
import Link from "next/link";
import { COLORS } from "@/lib/theme";
import { Skeleton } from "@/components/ui/skeleton";

const BGPattern = () => (
    <div 
        className="absolute inset-0 opacity-[0.015]"
        style={{
            backgroundImage: `linear-gradient(${COLORS.structure} 1px, transparent 1px), linear-gradient(90deg, ${COLORS.structure} 1px, transparent 1px)`,
            backgroundSize: '32px 32px'
        }}
    />
);

interface ExtendedTraderData {
    wallet: string;
    sol_scan_url: string;
    buy_usd_amount: number;
    sell_usd_amount: number;
    pnl: number;
    buy_token_amount: number;
    buy_txns: number;
    sell_token_amount: number;
    sell_txns: number;
    roi: number;
    totalTrades: number;
    totalVolume: number;
    netPosition: number;
    token?: string;
}

const formatCurrency = (value: number) => {
    if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    if (value >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
    return `$${value.toFixed(2)}`;
};

const formatNumber = (value: number, decimals: number = 2) => {
    if (value >= 1e9) return `${(value / 1e9).toFixed(decimals)}B`;
    if (value >= 1e6) return `${(value / 1e6).toFixed(decimals)}M`;
    if (value >= 1e3) return `${(value / 1e3).toFixed(decimals)}K`;
    return value.toFixed(decimals);
};

const formatAddress = (address: string) => {
    if (address.length <= 12) return address;
    return `${address.slice(0, 6)}...${address.slice(-6)}`;
};

export default function TraderDetailsPage() {
    const params = useParams();
    const router = useRouter();
    const id = params?.id as string;
    const [trader, setTrader] = useState<ExtendedTraderData | null>(null);
    const [loading, setLoading] = useState(true);
    const [checkingToken, setCheckingToken] = useState(false);

    useEffect(() => {
        async function load() {
            if (!id) return;
            
            // First, try to fetch detailed trader data
            try {
                const response = await fetch(`/api/traders/${id}`);
                if (response.ok) {
                    const data = await response.json();
                    setTrader(data);
                    setLoading(false);
                    return;
                }
            } catch (e) {
                console.error("Failed to fetch trader:", e);
            }
            
            // If trader fetch failed, check if it's a token mint
            setCheckingToken(true);
            try {
                const tokenResponse = await fetch(`/api/traders/token?mint=${id}`);
                if (tokenResponse.ok) {
                    const tokenTraders = await tokenResponse.json();
                    if (tokenTraders && tokenTraders.length >= 0) {
                        router.replace(`/top-traders/token/${id}`);
                        return;
                    }
                }
            } catch (e) {
                console.error("Failed to check if token:", e);
            }
            
            setCheckingToken(false);
            setLoading(false);
        }
        load();
    }, [id, router]);

    if (loading || checkingToken) {
        return (
            <div className="min-h-screen font-sans overflow-x-hidden" style={{ backgroundColor: COLORS.canvas, color: COLORS.text }}>
                <section className="relative pt-16 md:pt-24 pb-12 px-6 border-b" style={{ borderColor: COLORS.structure }}>
                    <BGPattern />
                    <div className="max-w-7xl mx-auto relative z-10">
                        <Skeleton className="h-32 w-full mb-8" style={{ backgroundColor: `${COLORS.structure}40` }} />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <Skeleton className="h-64" style={{ backgroundColor: `${COLORS.structure}40` }} />
                            <Skeleton className="h-64" style={{ backgroundColor: `${COLORS.structure}40` }} />
                        </div>
                    </div>
                </section>
            </div>
        );
    }

    if (!trader) {
        return (
            <div className="min-h-screen font-sans overflow-x-hidden flex flex-col items-center justify-center text-center px-6" style={{ backgroundColor: COLORS.canvas, color: COLORS.text }}>
                <h2 className="text-2xl font-medium mb-4" style={{ color: COLORS.text }}>Trader Not Found</h2>
                <p className="text-sm mb-6" style={{ color: COLORS.data }}>Unable to find trader with the provided address</p>
                <Link href="/top-traders">
                    <button 
                        className="h-11 px-7 border text-sm font-mono transition-all hover:border-brand/50"
                        style={{ 
                            borderColor: COLORS.structure, 
                            backgroundColor: COLORS.surface,
                            color: COLORS.text 
                        }}
                    >
                        BACK_TO_TRADERS
                    </button>
                </Link>
            </div>
        );
    }

    const isPositivePnL = trader.pnl >= 0;
    const buySellRatio = trader.buy_txns > 0 ? (trader.sell_txns / trader.buy_txns) : 0;
    const avgBuyAmount = trader.buy_txns > 0 ? trader.buy_usd_amount / trader.buy_txns : 0;
    const avgSellAmount = trader.sell_txns > 0 ? trader.sell_usd_amount / trader.sell_txns : 0;

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
                    >
                        {/* Back Button */}
                        <Link href="/top-traders">
                            <button 
                                className="inline-flex items-center gap-2 mb-8 text-sm transition-all hover:opacity-80"
                                style={{ color: COLORS.data }}
                            >
                                <ArrowLeft size={16} />
                                <span className="font-mono">BACK_TO_TRADERS</span>
                            </button>
                        </Link>

                        {/* Trader Header Card */}
                        <div className="border p-8 mb-8 relative overflow-hidden group" style={{ borderColor: COLORS.structure, backgroundColor: COLORS.surface }}>
                            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" 
                                 style={{ background: `linear-gradient(135deg, ${COLORS.brand}05 0%, transparent 100%)` }} />
                            
                            <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                                <div className="flex items-center gap-6 flex-1">
                                    <div className="relative">
                                        <img
                                            src={`https://api.dicebear.com/7.x/identicon/svg?seed=${trader.wallet}`}
                                            alt={trader.wallet}
                                            className="w-20 h-20 rounded-full border-2"
                                            style={{ borderColor: COLORS.structure }}
                                        />
                                        <div className="absolute -bottom-2 -right-2 px-3 py-1 border text-[10px] font-mono font-medium"
                                             style={{ borderColor: COLORS.brand, backgroundColor: COLORS.brand, color: COLORS.canvas }}>
                                            RANK #1
                                        </div>
                                    </div>

                                    <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-2">
                                            <h1 className="text-3xl font-medium tracking-tight" style={{ color: COLORS.text }}>
                                                {formatAddress(trader.wallet)}
                                            </h1>
                                            <a
                                                href={trader.sol_scan_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="opacity-70 hover:opacity-100 transition-opacity"
                                                style={{ color: COLORS.data }}
                                            >
                                                <ExternalLink size={18} />
                                            </a>
                                        </div>
                                        <p className="text-sm mb-4" style={{ color: COLORS.data }}>
                                            Solana wallet address • Active trader
                                        </p>
                                        <div className="flex items-center gap-4 flex-wrap">
                                            <div className="flex items-center gap-2 px-3 py-1 border text-xs font-mono"
                                                 style={{ borderColor: COLORS.structure, color: COLORS.data }}>
                                                <Activity size={12} />
                                                {trader.totalTrades} TRADES
                                            </div>
                                            <div className={`flex items-center gap-2 px-3 py-1 border text-xs font-mono ${
                                                isPositivePnL ? 'text-emerald-400' : 'text-red-400'
                                            }`}
                                                 style={{ borderColor: COLORS.structure }}>
                                                <TrendingUp size={12} />
                                                {trader.roi.toFixed(2)}% ROI
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex gap-3 w-full md:w-auto">
                                    <button 
                                        className="h-11 px-6 border text-sm font-mono transition-all hover:border-brand/50 flex-1 md:flex-none"
                                        style={{ 
                                            borderColor: COLORS.structure, 
                                            backgroundColor: COLORS.surface,
                                            color: COLORS.text 
                                        }}
                                    >
                                        COPY_TRADER
                                    </button>
                                    <button 
                                        className="h-11 px-6 text-sm font-mono font-medium transition-all hover:opacity-90 flex-1 md:flex-none"
                                        style={{ 
                                            backgroundColor: COLORS.brand, 
                                            color: COLORS.canvas 
                                        }}
                                    >
                                        FOLLOW
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Key Metrics Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                            <div className="border p-6" style={{ borderColor: COLORS.structure, backgroundColor: COLORS.surface }}>
                                <div className="text-[10px] font-mono tracking-widest mb-2" style={{ color: COLORS.data }}>
                                    PROFIT/LOSS
                                </div>
                                <div className={`text-2xl font-medium ${isPositivePnL ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {isPositivePnL ? '+' : ''}{formatCurrency(trader.pnl)}
                                </div>
                            </div>
                            <div className="border p-6" style={{ borderColor: COLORS.structure, backgroundColor: COLORS.surface }}>
                                <div className="text-[10px] font-mono tracking-widest mb-2" style={{ color: COLORS.data }}>
                                    TOTAL VOLUME
                                </div>
                                <div className="text-2xl font-medium" style={{ color: COLORS.text }}>
                                    {formatCurrency(trader.totalVolume)}
                                </div>
                            </div>
                            <div className="border p-6" style={{ borderColor: COLORS.structure, backgroundColor: COLORS.surface }}>
                                <div className="text-[10px] font-mono tracking-widest mb-2" style={{ color: COLORS.data }}>
                                    ROI
                                </div>
                                <div className={`text-2xl font-medium ${isPositivePnL ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {isPositivePnL ? '+' : ''}{trader.roi.toFixed(2)}%
                                </div>
                            </div>
                            <div className="border p-6" style={{ borderColor: COLORS.structure, backgroundColor: COLORS.surface }}>
                                <div className="text-[10px] font-mono tracking-widest mb-2" style={{ color: COLORS.data }}>
                                    TOTAL TRADES
                                </div>
                                <div className="text-2xl font-medium" style={{ color: COLORS.text }}>
                                    {trader.totalTrades}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* Content Section */}
            <section className="py-16 px-6 relative" style={{ backgroundColor: COLORS.canvas }}>
                <div className="max-w-7xl mx-auto">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                        {/* Trading Activity */}
                        <div className="border p-6" style={{ borderColor: COLORS.structure, backgroundColor: COLORS.surface }}>
                            <div className="flex items-center gap-2 mb-6">
                                <BarChart3 size={18} style={{ color: COLORS.brand }} />
                                <span className="text-[9px] font-mono tracking-widest" style={{ color: COLORS.data }}>
                                    TRADING_ACTIVITY
                                </span>
                            </div>
                            <div className="space-y-4">
                                <div className="flex justify-between items-center pb-4 border-b" style={{ borderColor: COLORS.structure }}>
                                    <span className="text-sm" style={{ color: COLORS.data }}>Buy Transactions</span>
                                    <span className="text-sm font-medium font-mono" style={{ color: COLORS.text }}>
                                        {trader.buy_txns}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center pb-4 border-b" style={{ borderColor: COLORS.structure }}>
                                    <span className="text-sm" style={{ color: COLORS.data }}>Sell Transactions</span>
                                    <span className="text-sm font-medium font-mono" style={{ color: COLORS.text }}>
                                        {trader.sell_txns}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center pb-4 border-b" style={{ borderColor: COLORS.structure }}>
                                    <span className="text-sm" style={{ color: COLORS.data }}>Buy/Sell Ratio</span>
                                    <span className="text-sm font-medium font-mono" style={{ color: COLORS.text }}>
                                        {buySellRatio.toFixed(2)}x
                                    </span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm" style={{ color: COLORS.data }}>Net Position</span>
                                    <span className={`text-sm font-medium font-mono ${
                                        trader.netPosition >= 0 ? 'text-emerald-400' : 'text-red-400'
                                    }`}>
                                        {trader.netPosition >= 0 ? '+' : ''}{formatNumber(trader.netPosition, 4)}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Volume Breakdown */}
                        <div className="border p-6" style={{ borderColor: COLORS.structure, backgroundColor: COLORS.surface }}>
                            <div className="flex items-center gap-2 mb-6">
                                <DollarSign size={18} style={{ color: COLORS.brand }} />
                                <span className="text-[9px] font-mono tracking-widest" style={{ color: COLORS.data }}>
                                    VOLUME_BREAKDOWN
                                </span>
                            </div>
                            <div className="space-y-4">
                                <div className="flex justify-between items-center pb-4 border-b" style={{ borderColor: COLORS.structure }}>
                                    <span className="text-sm flex items-center gap-2" style={{ color: COLORS.data }}>
                                        <ArrowUpRight size={14} className="text-emerald-400" />
                                        Buy Volume
                                    </span>
                                    <span className="text-sm font-medium font-mono" style={{ color: COLORS.text }}>
                                        {formatCurrency(trader.buy_usd_amount)}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center pb-4 border-b" style={{ borderColor: COLORS.structure }}>
                                    <span className="text-sm flex items-center gap-2" style={{ color: COLORS.data }}>
                                        <ArrowDownRight size={14} className="text-red-400" />
                                        Sell Volume
                                    </span>
                                    <span className="text-sm font-medium font-mono" style={{ color: COLORS.text }}>
                                        {formatCurrency(trader.sell_usd_amount)}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center pb-4 border-b" style={{ borderColor: COLORS.structure }}>
                                    <span className="text-sm" style={{ color: COLORS.data }}>Avg Buy Amount</span>
                                    <span className="text-sm font-medium font-mono" style={{ color: COLORS.text }}>
                                        {formatCurrency(avgBuyAmount)}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm" style={{ color: COLORS.data }}>Avg Sell Amount</span>
                                    <span className="text-sm font-medium font-mono" style={{ color: COLORS.text }}>
                                        {formatCurrency(avgSellAmount)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Token Amounts */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                        <div className="border p-6" style={{ borderColor: COLORS.structure, backgroundColor: COLORS.surface }}>
                            <div className="flex items-center gap-2 mb-6">
                                <TrendingUp size={18} style={{ color: COLORS.brand }} />
                                <span className="text-[9px] font-mono tracking-widest" style={{ color: COLORS.data }}>
                                    TOKEN_AMOUNTS
                                </span>
                            </div>
                            <div className="space-y-4">
                                <div className="flex justify-between items-center pb-4 border-b" style={{ borderColor: COLORS.structure }}>
                                    <span className="text-sm" style={{ color: COLORS.data }}>Buy Token Amount</span>
                                    <span className="text-sm font-medium font-mono" style={{ color: COLORS.text }}>
                                        {formatNumber(trader.buy_token_amount, 4)}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm" style={{ color: COLORS.data }}>Sell Token Amount</span>
                                    <span className="text-sm font-medium font-mono" style={{ color: COLORS.text }}>
                                        {formatNumber(trader.sell_token_amount, 4)}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Performance Summary */}
                        <div className="border p-6" style={{ borderColor: COLORS.structure, backgroundColor: COLORS.surface }}>
                            <div className="flex items-center gap-2 mb-6">
                                <Activity size={18} style={{ color: COLORS.brand }} />
                                <span className="text-[9px] font-mono tracking-widest" style={{ color: COLORS.data }}>
                                    PERFORMANCE_SUMMARY
                                </span>
                            </div>
                            <div className="space-y-4">
                                <div className="flex justify-between items-center pb-4 border-b" style={{ borderColor: COLORS.structure }}>
                                    <span className="text-sm" style={{ color: COLORS.data }}>Total PnL</span>
                                    <span className={`text-sm font-medium font-mono ${isPositivePnL ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {isPositivePnL ? '+' : ''}{formatCurrency(trader.pnl)}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center pb-4 border-b" style={{ borderColor: COLORS.structure }}>
                                    <span className="text-sm" style={{ color: COLORS.data }}>Total Volume (AUM)</span>
                                    <span className="text-sm font-medium font-mono" style={{ color: COLORS.text }}>
                                        {formatCurrency(trader.totalVolume)}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm" style={{ color: COLORS.data }}>Return on Investment</span>
                                    <span className={`text-sm font-medium font-mono ${isPositivePnL ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {isPositivePnL ? '+' : ''}{trader.roi.toFixed(2)}%
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Wallet Link */}
                    <div className="border p-6 text-center" style={{ borderColor: COLORS.structure, backgroundColor: COLORS.surface }}>
                        <a
                            href={trader.sol_scan_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-sm font-mono transition-all hover:opacity-80"
                            style={{ color: COLORS.brand }}
                        >
                            <ExternalLink size={16} />
                            VIEW_ON_SOLSCAN
                        </a>
                    </div>
                </div>
            </section>
        </div>
    );
}