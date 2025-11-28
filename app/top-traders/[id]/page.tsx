"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
    ArrowLeft,
    ShieldCheck,
    Users,
    TrendingUp,
    DollarSign,
    Activity,
    Copy,
    Share2,
    Star,
    Info
} from "lucide-react";
import Link from "next/link";
import { COLORS } from "@/lib/theme";
import { fetchTraderDetails, Trader } from "@/lib/apify";
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

export default function TraderDetailsPage() {
    const params = useParams();
    const router = useRouter();
    const id = params?.id as string;
    const [trader, setTrader] = useState<Trader | undefined>(undefined);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'ROI' | 'PnL'>('ROI');
    const [checkingToken, setCheckingToken] = useState(false);

    useEffect(() => {
        async function load() {
            if (!id) return;
            
            // First, try to fetch trader details
            try {
                const data = await fetchTraderDetails(id);
                if (data) {
                    setTrader(data);
                    setLoading(false);
                    return;
                }
            } catch (e) {
                console.error("Failed to fetch trader:", e);
            }
            
            // If trader fetch failed, check if it's a token mint by trying to fetch traders for that token
            setCheckingToken(true);
            try {
                const tokenResponse = await fetch(`/api/traders/token?mint=${id}`);
                if (tokenResponse.ok) {
                    const tokenTraders = await tokenResponse.json();
                    // If we got traders back, this is a token mint - redirect
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
            <div className="min-h-screen bg-canvas pt-24 px-6 flex justify-center">
                <div className="max-w-7xl w-full space-y-8">
                    <Skeleton className="h-32 w-full bg-white/5 rounded-xl" />
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <Skeleton className="h-64 bg-white/5 rounded-xl" />
                        <Skeleton className="h-64 bg-white/5 rounded-xl" />
                    </div>
                </div>
            </div>
        );
    }

    if (!trader) {
        return (
            <div className="min-h-screen bg-canvas pt-24 px-6 flex flex-col items-center justify-center text-center">
                <h2 className="text-2xl font-medium text-white mb-4">Trader Not Found</h2>
                <Link href="/top-traders">
                    <button className="px-6 py-2 bg-white/10 rounded-lg text-sm hover:bg-white/20 transition-colors">
                        Back to List
                    </button>
                </Link>
            </div>
        );
    }

    // Mock detailed chart data based on the weeklyPnl
    const chartData = trader.weeklyPnl.map((val, i) => ({
        date: `Day ${i + 1}`,
        value: activeTab === 'ROI' ? (val / 1000) * 100 : val * 100 // Mock scaling
    }));

    return (
        <div className="min-h-screen font-sans bg-canvas text-text pb-20">
            <div className="pt-24 px-6 max-w-7xl mx-auto space-y-8">

                {/* Breadcrumb / Back */}
                <Link href="/top-traders" className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors">
                    <ArrowLeft size={16} />
                    Back to Copy Trading
                </Link>

                {/* Header Profile Card */}
                <div className="glass-card p-8 relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-brand/5 to-transparent pointer-events-none" />

                    <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                        <div className="flex items-center gap-6">
                            <div className="relative">
                                <img
                                    src={trader.avatarUrl}
                                    alt={trader.name}
                                    className="w-20 h-20 rounded-full border-2 border-white/10"
                                />
                                <div className="absolute -bottom-2 -right-2 bg-surface border border-structure px-2 py-0.5 rounded-full text-[10px] font-mono text-brand">
                                    RANK #{trader.rank}
                                </div>
                            </div>

                            <div>
                                <div className="flex items-center gap-3 mb-2">
                                    <h1 className="text-2xl font-bold text-white">{trader.name}</h1>
                                    <ShieldCheck size={18} className="text-yellow-500" />
                                    <div className="px-2 py-0.5 rounded bg-white/10 text-[10px] text-gray-300">
                                        API Connected
                                    </div>
                                </div>
                                <p className="text-sm text-gray-400 max-w-lg">
                                    Public domain trading is more conservative, while private domain trading is more aggressive.
                                    Follow their trades based on your own financial situation.
                                </p>
                            </div>
                        </div>

                        <div className="flex gap-3 w-full md:w-auto">
                            <button className="flex-1 md:flex-none h-10 px-6 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-medium text-white transition-colors">
                                Mock Copy
                            </button>
                            <button className="flex-1 md:flex-none h-10 px-6 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-black text-sm font-bold transition-colors shadow-[0_0_20px_rgba(234,179,8,0.3)]">
                                Copy Trader
                            </button>
                        </div>
                    </div>
                </div>

                {/* Overview & Assets Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                    {/* Lead Trader Overview */}
                    <div className="glass-card p-6">
                        <h3 className="text-lg font-medium text-white mb-6">Lead Trader Overview</h3>
                        <div className="space-y-5">
                            <div className="flex justify-between items-center pb-4 border-b border-white/5">
                                <span className="text-sm text-gray-400">AUM</span>
                                <span className="text-sm font-medium text-white">${trader.aum.toLocaleString()} USDT</span>
                            </div>
                            <div className="flex justify-between items-center pb-4 border-b border-white/5">
                                <span className="text-sm text-gray-400">Profit Sharing</span>
                                <span className="text-sm font-medium text-white">10.00%</span>
                            </div>
                            <div className="flex justify-between items-center pb-4 border-b border-white/5">
                                <span className="text-sm text-gray-400">Leading Margin Balance</span>
                                <span className="text-sm font-medium text-white">${(trader.aum * 0.2).toLocaleString()} USDT</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-gray-400">Minimum Copy Amount</span>
                                <span className="text-sm font-medium text-white">1000/1000 USDT</span>
                            </div>
                        </div>
                    </div>

                    {/* Asset Preferences */}
                    <div className="glass-card p-6">
                        <div className="flex items-center gap-2 mb-6">
                            <h3 className="text-lg font-medium text-white">Asset Preferences</h3>
                            <Info size={14} className="text-gray-500" />
                        </div>
                        <div className="h-[200px] w-full flex items-center justify-center">
                            {trader.assets.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={trader.assets}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={60}
                                            outerRadius={80}
                                            paddingAngle={5}
                                            dataKey="value"
                                        >
                                            {trader.assets.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} stroke="rgba(0,0,0,0.5)" />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#0A0A0A', borderColor: '#262626', borderRadius: '8px' }}
                                            itemStyle={{ color: '#fff' }}
                                        />
                                        <Legend
                                            layout="vertical"
                                            verticalAlign="middle"
                                            align="right"
                                            formatter={(value, entry: any) => (
                                                <span className="text-xs text-gray-300 ml-2">{value}</span>
                                            )}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="text-sm text-gray-500">No asset data available</div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Performance Chart */}
                <div className="glass-card p-6 h-[400px] flex flex-col">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-medium text-white">Performance</h3>
                        <div className="flex bg-white/5 rounded-lg p-1">
                            {(['ROI', 'PnL'] as const).map((tab) => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab)}
                                    className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${activeTab === tab
                                        ? 'bg-white/10 text-white shadow-sm'
                                        : 'text-gray-400 hover:text-white'
                                        }`}
                                >
                                    {tab}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex-1 w-full min-h-0 flex items-center justify-center">
                        {chartData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData}>
                                    <defs>
                                        <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor={COLORS.brand} stopOpacity={0.3} />
                                            <stop offset="95%" stopColor={COLORS.brand} stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                    <XAxis
                                        dataKey="date"
                                        stroke="#525252"
                                        fontSize={10}
                                        tickLine={false}
                                        axisLine={false}
                                    />
                                    <YAxis
                                        stroke="#525252"
                                        fontSize={10}
                                        tickLine={false}
                                        axisLine={false}
                                        tickFormatter={(val) => activeTab === 'ROI' ? `${val}%` : `$${val}`}
                                    />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#0A0A0A', borderColor: '#262626', borderRadius: '8px' }}
                                        itemStyle={{ color: '#fff' }}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="value"
                                        stroke={COLORS.brand}
                                        fill="url(#chartGradient)"
                                        strokeWidth={2}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="text-sm text-gray-500">No performance history available</div>
                        )}
                    </div>
                </div>

                {/* Latest Records */}
                <div className="glass-card p-6">
                    <div className="flex items-center gap-6 mb-6 border-b border-white/10 pb-4">
                        <h3 className="text-lg font-medium text-white border-b-2 border-brand pb-4 -mb-4.5">Latest Records</h3>
                        <h3 className="text-lg font-medium text-gray-500 pb-4 -mb-4.5 cursor-pointer hover:text-gray-300">Positions</h3>
                        <h3 className="text-lg font-medium text-gray-500 pb-4 -mb-4.5 cursor-pointer hover:text-gray-300">Transfer History</h3>
                    </div>

                    <div className="space-y-4">
                        {trader.recentTrades.length > 0 ? (
                            trader.recentTrades.map((trade, i) => (
                                <div key={i} className="flex flex-col md:flex-row md:items-center justify-between p-4 rounded-lg bg-white/5 border border-white/5 hover:border-white/10 transition-colors">
                                    <div className="flex items-start gap-4 mb-4 md:mb-0">
                                        <div className="flex flex-col items-center gap-2">
                                            <div className="text-[10px] text-gray-500 font-mono">{trade.date.split(',')[0]}</div>
                                            <div className="h-full w-px bg-white/10 min-h-[20px]" />
                                        </div>
                                        <div>
                                            <div className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium mb-1 ${trade.type.includes('Open') ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'
                                                }`}>
                                                {trade.type}
                                            </div>
                                            <div className="text-sm text-gray-300">
                                                {trade.type} position of <span className="text-white font-medium underline decoration-dotted">{trade.symbol}</span> at price of <span className="text-white">{trade.price} USDT</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        {trade.pnl && (
                                            <div className={`text-sm font-medium ${parseFloat(trade.pnl) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                {parseFloat(trade.pnl) >= 0 ? '+' : ''}{trade.pnl} USDT
                                            </div>
                                        )}
                                        <div className="text-xs text-gray-500">
                                            Value: {trade.value} USDT
                                        </div>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="text-center py-8 text-sm text-gray-500">No recent trades found</div>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}
