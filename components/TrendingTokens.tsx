"use client";

import React, { useEffect, useState, useMemo } from "react";
import { TrendingUp, ArrowUpRight, Search, Filter, X, ExternalLink, ChevronDown, Users } from "lucide-react";
import { COLORS } from "@/lib/theme";
import { Input } from "@/components/ui/input";
import { Trader } from "@/lib/apify";

interface Token {
    address: string;
    symbol: string;
    name: string;
    logoURI: string;
    price: number;
    daily_volume: number;
    priceChange24h?: number;
    priceChange7d?: number;
    priceChange30d?: number;
    volume24h?: number;
    marketCap?: number;
    circulatingSupply?: number;
    totalSupply?: number;
    holders?: number;
}

type SortOption = "default" | "volume" | "price" | "priceChange";

interface TrendingTokensProps {
    onTokenSelect?: (token: Token | null) => void;
    selectedToken?: Token | null;
}

export function TrendingTokens({ onTokenSelect, selectedToken }: TrendingTokensProps = {}) {
    const [tokens, setTokens] = useState<Token[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [sortBy, setSortBy] = useState<SortOption>("default");
    const [minVolume, setMinVolume] = useState("");
    const [showFilters, setShowFilters] = useState(false);
    const [filterPriceChange, setFilterPriceChange] = useState<"all" | "positive" | "negative">("all");
    
    // Trader-related state
    const [expandedToken, setExpandedToken] = useState<string | null>(null);
    const [tokenTraders, setTokenTraders] = useState<Map<string, { traders: Trader[]; loading: boolean }>>(new Map());

    useEffect(() => {
        async function fetchTrending() {
            try {
                const res = await fetch("/api/trending?window=1h");
                const data = await res.json();
                setTokens(data);
            } catch (e) {
                console.error("Failed to fetch trending tokens", e);
            } finally {
                setLoading(false);
            }
        }
        fetchTrending();
    }, []);

    // Fetch traders when token is expanded
    useEffect(() => {
        if (!expandedToken) return;

        const fetchTraders = async () => {
            // Check if already fetched
            setTokenTraders(prev => {
                const existing = prev.get(expandedToken);
                if (existing && existing.traders.length > 0) {
                    return prev; // Already fetched, don't refetch
                }
                
                // Set loading state
                const newMap = new Map(prev);
                newMap.set(expandedToken, { traders: [], loading: true });
                return newMap;
            });

            try {
                const res = await fetch(`/api/traders/token?mint=${expandedToken}`);
                if (res.ok) {
                    const traders = await res.json();
                    setTokenTraders(prev => {
                        const newMap = new Map(prev);
                        newMap.set(expandedToken, { traders: traders || [], loading: false });
                        return newMap;
                    });
                } else {
                    setTokenTraders(prev => {
                        const newMap = new Map(prev);
                        newMap.set(expandedToken, { traders: [], loading: false });
                        return newMap;
                    });
                }
            } catch (e) {
                console.error("Failed to fetch traders", e);
                setTokenTraders(prev => {
                    const newMap = new Map(prev);
                    newMap.set(expandedToken, { traders: [], loading: false });
                    return newMap;
                });
            }
        };

        fetchTraders();
    }, [expandedToken]);

    // Filter and sort tokens
    const filteredAndSortedTokens = useMemo(() => {
        let filtered = [...tokens];

        // Search filter (name, symbol, or address)
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(
                (token) =>
                    token.name.toLowerCase().includes(query) ||
                    token.symbol.toLowerCase().includes(query) ||
                    token.address.toLowerCase().includes(query)
            );
        }

        // Volume filter
        if (minVolume) {
            const minVol = parseFloat(minVolume);
            if (!isNaN(minVol)) {
                filtered = filtered.filter((token) => {
                    const volume = token.volume24h || token.daily_volume || 0;
                    return volume >= minVol;
                });
            }
        }

        // Price change filter
        if (filterPriceChange !== "all") {
            filtered = filtered.filter((token) => {
                if (token.priceChange24h === undefined) return false;
                if (filterPriceChange === "positive") return token.priceChange24h > 0;
                if (filterPriceChange === "negative") return token.priceChange24h < 0;
                return true;
            });
        }

        // Sort
        switch (sortBy) {
            case "volume":
                filtered.sort((a, b) => {
                    const volA = a.volume24h || a.daily_volume || 0;
                    const volB = b.volume24h || b.daily_volume || 0;
                    return volB - volA;
                });
                break;
            case "price":
                filtered.sort((a, b) => b.price - a.price);
                break;
            case "priceChange":
                filtered.sort((a, b) => {
                    const changeA = a.priceChange24h || 0;
                    const changeB = b.priceChange24h || 0;
                    return changeB - changeA;
                });
                break;
            default:
                // Keep original order
                break;
        }

        return filtered;
    }, [tokens, searchQuery, sortBy, minVolume, filterPriceChange]);

    const formatVolume = (volume: number) => {
        if (volume >= 1e6) return `$${(volume / 1e6).toFixed(2)}M`;
        if (volume >= 1e3) return `$${(volume / 1e3).toFixed(2)}K`;
        return `$${volume.toFixed(2)}`;
    };

    const formatMarketCap = (marketCap?: number) => {
        if (!marketCap) return null;
        if (marketCap >= 1e9) return `$${(marketCap / 1e9).toFixed(2)}B`;
        if (marketCap >= 1e6) return `$${(marketCap / 1e6).toFixed(2)}M`;
        if (marketCap >= 1e3) return `$${(marketCap / 1e3).toFixed(2)}K`;
        return `$${marketCap.toFixed(2)}`;
    };

    const formatSupply = (supply?: number) => {
        if (!supply) return null;
        if (supply >= 1e9) return `${(supply / 1e9).toFixed(2)}B`;
        if (supply >= 1e6) return `${(supply / 1e6).toFixed(2)}M`;
        if (supply >= 1e3) return `${(supply / 1e3).toFixed(2)}K`;
        return supply.toFixed(2);
    };

    const formatAddress = (address: string) => {
        if (address.length <= 8) return address;
        return `${address.slice(0, 4)}...${address.slice(-4)}`;
    };

    if (loading) {
        return <div className="glass-card p-6 h-full animate-pulse bg-white/5" />;
    }

    return (
        <div className="glass-card p-6 h-full flex flex-col">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <TrendingUp size={20} className="text-brand" />
                    <h3 className="text-lg font-bold text-white">Trending Tokens</h3>
                </div>
                <button
                    onClick={() => setShowFilters(!showFilters)}
                    className="p-1.5 hover:bg-white/10 rounded transition-colors"
                    title="Toggle filters"
                >
                    <Filter size={16} className="text-gray-400" />
                </button>
            </div>

            {/* Search Bar */}
            <div className="relative mb-4">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <Input
                    type="text"
                    placeholder="Search by name, symbol, or address..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 pr-9 bg-white/5 border-white/10 text-white placeholder:text-gray-400"
                />
                {searchQuery && (
                    <button
                        onClick={() => setSearchQuery("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                    >
                        <X size={14} />
                    </button>
                )}
            </div>

            {/* Filters */}
            {showFilters && (
                <div className="mb-4 space-y-3 p-3 bg-white/5 rounded-lg border border-white/10">
                    <div className="space-y-2">
                        <label className="text-xs text-gray-400 font-medium">Sort By</label>
                        <div className="flex gap-2 flex-wrap">
                            {(["default", "volume", "price", "priceChange"] as SortOption[]).map((option) => (
                                <button
                                    key={option}
                                    onClick={() => setSortBy(option)}
                                    className={`px-3 py-1 text-xs rounded transition-colors ${
                                        sortBy === option
                                            ? "bg-brand text-white"
                                            : "bg-white/10 text-gray-300 hover:bg-white/20"
                                    }`}
                                >
                                    {option === "default" ? "Default" : option === "priceChange" ? "Price Change" : option.charAt(0).toUpperCase() + option.slice(1)}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs text-gray-400 font-medium">Min Volume (USD)</label>
                        <Input
                            type="number"
                            placeholder="e.g., 1000"
                            value={minVolume}
                            onChange={(e) => setMinVolume(e.target.value)}
                            className="bg-white/5 border-white/10 text-white placeholder:text-gray-400 text-xs"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs text-gray-400 font-medium">Price Change</label>
                        <div className="flex gap-2">
                            {(["all", "positive", "negative"] as const).map((option) => (
                                <button
                                    key={option}
                                    onClick={() => setFilterPriceChange(option)}
                                    className={`px-3 py-1 text-xs rounded transition-colors ${
                                        filterPriceChange === option
                                            ? "bg-brand text-white"
                                            : "bg-white/10 text-gray-300 hover:bg-white/20"
                                    }`}
                                >
                                    {option.charAt(0).toUpperCase() + option.slice(1)}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Results Count */}
            <div className="text-xs text-gray-400 mb-3">
                Showing {filteredAndSortedTokens.length} of {tokens.length} tokens
            </div>

            {/* Tokens List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                {filteredAndSortedTokens.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 text-sm">
                        No tokens found matching your criteria
                    </div>
                ) : (
                    filteredAndSortedTokens.map((token) => {
                        const blockExplorerUrl = `https://solscan.io/token/${token.address}`;
                        const isSelected = selectedToken?.address === token.address;
                        
                        const handleClick = (e: React.MouseEvent) => {
                            e.preventDefault();
                            
                            // If callback exists, use it for selection (don't open explorer)
                            if (onTokenSelect) {
                                if (isSelected) {
                                    onTokenSelect(null); // Deselect
                                } else {
                                    onTokenSelect(token); // Select
                                }
                            } else {
                                // Default behavior: navigate to token traders page
                                window.location.href = `/top-traders/token/${token.address}`;
                            }
                        };
                        
                        const handleRightClick = (e: React.MouseEvent) => {
                            e.preventDefault();
                            window.open(blockExplorerUrl, '_blank', 'noopener,noreferrer');
                        };

                        const isExpanded = expandedToken === token.address;
                        const traders = tokenTraders.get(token.address) || { traders: [], loading: false };

                        const handleExpandToggle = (e: React.MouseEvent) => {
                            e.stopPropagation();
                            setExpandedToken(isExpanded ? null : token.address);
                        };
                        
                        return (
                            <div
                                key={token.address}
                                className={`rounded-lg transition-colors border ${
                                    isSelected 
                                        ? 'border-brand bg-brand/10 hover:bg-brand/15' 
                                        : 'border-transparent hover:border-white/10'
                                }`}
                            >
                            <div
                                onClick={handleClick}
                                onContextMenu={handleRightClick}
                                title={onTokenSelect ? `Click to view traders for ${token.symbol}` : `View ${token.symbol} on Solscan (Right-click for explorer)`}
                                className={`flex items-center justify-between group cursor-pointer hover:bg-white/5 p-3 transition-colors`}
                            >
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                                <img
                                    src={token.logoURI || "/placeholder-token.png"}
                                    alt={token.symbol}
                                    className="w-10 h-10 rounded-full flex-shrink-0 object-cover"
                                    onError={(e) => {
                                        e.currentTarget.src = `https://api.dicebear.com/7.x/identicon/svg?seed=${token.address}`;
                                    }}
                                />
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium text-white text-sm truncate flex items-center gap-1">
                                        {token.symbol}
                                        <ExternalLink size={10} className="text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                    <div className="text-[10px] text-gray-400 truncate">{token.name}</div>
                                    <div className="text-[9px] text-gray-500 font-mono truncate">
                                        {formatAddress(token.address)}
                                    </div>
                                    {token.circulatingSupply && (
                                        <div className="text-[8px] text-gray-600 mt-0.5">
                                            Supply: {formatSupply(token.circulatingSupply)}
                                        </div>
                                    )}
                                    {token.holders !== undefined && (
                                        <div className="text-[8px] text-gray-600 mt-0.5">
                                            Holders: {token.holders.toLocaleString()}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="text-right flex-shrink-0 ml-2">
                                <div className="text-sm font-medium text-white">
                                    {token.price > 0 ? (
                                        `$${token.price < 0.01 ? token.price.toFixed(6) : token.price.toFixed(2)}`
                                    ) : (
                                        <span className="text-gray-500 text-xs">Price N/A</span>
                                    )}
                                </div>
                                {token.priceChange24h !== undefined && (
                                    <div
                                        className={`text-[10px] flex items-center justify-end gap-1 ${
                                            token.priceChange24h >= 0 ? "text-emerald-400" : "text-red-400"
                                        }`}
                                    >
                                        {token.priceChange24h >= 0 ? "+" : ""}
                                        {token.priceChange24h.toFixed(2)}%
                                        <ArrowUpRight size={10} />
                                    </div>
                                )}
                                {token.marketCap && (
                                    <div className="text-[9px] text-gray-400 mt-0.5">
                                        MCap: {formatMarketCap(token.marketCap)}
                                    </div>
                                )}
                                {(token.volume24h || token.daily_volume) && (
                                    <div className="text-[9px] text-gray-400 mt-0.5">
                                        Vol: {formatVolume(token.volume24h || token.daily_volume || 0)}
                                    </div>
                                )}
                            </div>
                            <button
                                onClick={handleExpandToggle}
                                className="ml-2 p-1 hover:bg-white/10 rounded transition-colors flex-shrink-0"
                                title="Show/hide traders"
                            >
                                <ChevronDown 
                                    size={16} 
                                    className={`text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                />
                            </button>
                        </div>
                        
                        {/* Expanded Traders Section */}
                        {isExpanded && (
                            <div className="px-3 pb-3 border-t border-white/10 mt-2 pt-3">
                                <div className="flex items-center gap-2 mb-3">
                                    <Users size={14} className="text-gray-400" />
                                    <span className="text-xs font-medium text-gray-300">Top Traders</span>
                                </div>
                                
                                {traders.loading ? (
                                    <div className="space-y-2">
                                        {[...Array(3)].map((_, i) => (
                                            <div key={i} className="animate-pulse flex items-center gap-2 p-2 bg-white/5 rounded">
                                                <div className="w-8 h-8 rounded-full bg-white/10"></div>
                                                <div className="flex-1 space-y-1">
                                                    <div className="h-3 w-24 bg-white/10 rounded"></div>
                                                    <div className="h-2 w-16 bg-white/10 rounded"></div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : traders.traders.length > 0 ? (
                                    <div className="space-y-2 max-h-64 overflow-y-auto">
                                        {traders.traders.slice(0, 20).map((trader) => (
                                            <div
                                                key={trader.id}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    window.open(`https://solscan.io/account/${trader.id}`, '_blank');
                                                }}
                                                className="flex items-center gap-2 p-2 hover:bg-white/5 rounded cursor-pointer transition-colors group"
                                            >
                                                <img
                                                    src={trader.avatarUrl}
                                                    alt={trader.name}
                                                    className="w-8 h-8 rounded-full border border-white/10"
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-xs font-medium text-white truncate">
                                                        {trader.name}
                                                    </div>
                                                    <div className="flex items-center gap-2 text-[10px]">
                                                        <span className={`${trader.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                            PnL: ${trader.pnl.toFixed(2)}
                                                        </span>
                                                        <span className="text-gray-400">•</span>
                                                        <span className="text-gray-400">
                                                            ROI: {trader.roi.toFixed(1)}%
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-[10px] text-gray-400">
                                                        #{trader.rank}
                                                    </div>
                                                    <div className="text-[9px] text-gray-500">
                                                        {trader.totalTrades} trades
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                        {traders.traders.length > 20 && (
                                            <div className="text-center pt-1">
                                                <span className="text-[10px] text-gray-400">
                                                    +{traders.traders.length - 20} more traders
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="text-center py-4 text-gray-400 text-xs">
                                        No traders found for this token
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}