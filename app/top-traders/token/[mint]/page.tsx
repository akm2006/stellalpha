"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, TrendingUp, Users, ExternalLink, ChevronDown } from "lucide-react";
import Link from "next/link";
import { COLORS } from "@/lib/theme";
import { Trader } from "@/lib/apify";
import { TraderCard } from "@/components/TraderCard";
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

export default function TokenTradersPage() {
    const params = useParams();
    const router = useRouter();
    const mint = params?.mint as string;
    const [traders, setTraders] = useState<Trader[]>([]);
    const [loading, setLoading] = useState(true);
    const [tokenInfo, setTokenInfo] = useState<{ symbol: string; name: string; logoURI?: string } | null>(null);

    useEffect(() => {
        async function load() {
            if (!mint) return;
            try {
                setLoading(true);
                
                // Fetch traders for this token
                const response = await fetch(`/api/traders/token?mint=${mint}`);
                if (response.ok) {
                    const data = await response.json();
                    setTraders(data);
                } else {
                    console.error("Failed to fetch token traders");
                }

                // Try to fetch token metadata for display
                try {
                    const tokenRes = await fetch(`/api/trending?window=1h`);
                    if (tokenRes.ok) {
                        const tokens = await tokenRes.json();
                        const token = tokens.find((t: any) => t.address.toLowerCase() === mint.toLowerCase());
                        if (token) {
                            setTokenInfo({
                                symbol: token.symbol,
                                name: token.name,
                                logoURI: token.logoURI,
                            });
                        }
                    }
                } catch (e) {
                    console.error("Failed to fetch token info:", e);
                }
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [mint]);

    const formatAddress = (address: string) => {
        if (address.length <= 12) return address;
        return `${address.slice(0, 6)}...${address.slice(-6)}`;
    };

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
                                
                                {tokenInfo ? (
                                    <div className="flex items-center gap-4 mb-4">
                                        {tokenInfo.logoURI && (
                                            <img
                                                src={tokenInfo.logoURI}
                                                alt={tokenInfo.symbol}
                                                className="w-12 h-12 rounded-full border"
                                                style={{ borderColor: COLORS.structure }}
                                                onError={(e) => {
                                                    e.currentTarget.src = `https://api.dicebear.com/7.x/identicon/svg?seed=${mint}`;
                                                }}
                                            />
                                        )}
                                        <div>
                                            <h1 className="text-4xl md:text-5xl font-medium mb-2 tracking-tight" style={{ color: COLORS.text }}>
                                                {tokenInfo.symbol}
                                            </h1>
                                            <p className="text-sm" style={{ color: COLORS.data }}>
                                                {tokenInfo.name}
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <h1 className="text-4xl md:text-5xl font-medium mb-3 tracking-tight" style={{ color: COLORS.text }}>
                                        Token Traders
                                    </h1>
                                )}
                                
                                <p className="text-sm leading-relaxed max-w-2xl mb-4" style={{ color: COLORS.data }}>
                                    Top performing traders for this token on Solana.
                                </p>
                                
                                <div className="flex items-center gap-2 mt-4">
                                    <span className="text-[10px] font-mono" style={{ color: COLORS.data }}>
                                        MINT: {formatAddress(mint)}
                                    </span>
                                    <a
                                        href={`https://solscan.io/token/${mint}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="opacity-70 hover:opacity-100 transition-opacity"
                                        style={{ color: COLORS.data }}
                                    >
                                        <ExternalLink size={12} />
                                    </a>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* Content Section */}
            <section className="py-16 px-6 relative" style={{ backgroundColor: COLORS.canvas }}>
                <div className="max-w-7xl mx-auto">
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
                                No traders found for this token
                            </p>
                            <Link href="/top-traders">
                                <button 
                                    className="mt-6 px-6 py-2 border transition-all hover:border-brand/50 text-sm font-mono"
                                    style={{ borderColor: COLORS.structure, color: COLORS.text, backgroundColor: COLORS.surface }}
                                >
                                    VIEW_ALL_TRADERS
                                </button>
                            </Link>
                        </div>
                    ) : (
                        <>
                            <div className="mb-6 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Users size={18} style={{ color: COLORS.brand }} />
                                    <span className="text-sm font-mono" style={{ color: COLORS.data }}>
                                        SHOWING {traders.length} TRADERS
                                    </span>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                {traders.map((trader, index) => (
                                    <TraderCard key={trader.id} trader={trader} index={index} />
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </section>
        </div>
    );
}
