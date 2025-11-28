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

    // SOL mint address - always select this by default
    const SOL_MINT = "So11111111111111111111111111111111111111112";

    useEffect(() => {
        async function fetchTrending() {
            try {
                const res = await fetch("/api/trending?window=1h");
                const data = await res.json();
                setTokens(data);
                
                // Auto-select SOL by default if onTokenSelect is provided and no token is selected
                if (onTokenSelect && !selectedToken && data && data.length > 0) {
                    const solToken = data.find((t: Token) => 
                        t.address.toLowerCase() === SOL_MINT.toLowerCase() || 
                        t.symbol.toUpperCase() === "SOL"
                    );
                    if (solToken) {
                        onTokenSelect(solToken);
                    } else if (data.length > 0) {
                        // If SOL not found, select first token
                        onTokenSelect(data[0]);
                    }
                }
            } catch (e) {
                console.error("Failed to fetch trending tokens", e);
            } finally {
                setLoading(false);
            }
        }
        fetchTrending();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Only run once on mount - auto-selection happens when tokens load

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
        return (
            <div className="border p-6 h-full" style={{ borderColor: COLORS.structure, backgroundColor: COLORS.surface }}>
                <div className="animate-pulse space-y-4">
                    <div className="h-4 w-32" style={{ backgroundColor: `${COLORS.structure}40` }}></div>
                    <div className="h-10 w-full" style={{ backgroundColor: `${COLORS.structure}40` }}></div>
                    <div className="space-y-2">
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className="h-16 w-full" style={{ backgroundColor: `${COLORS.structure}40` }}></div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="border h-full flex flex-col" style={{ borderColor: COLORS.structure, backgroundColor: COLORS.surface }}>
            <div className="p-6 border-b" style={{ borderColor: COLORS.structure }}>
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 border" style={{ borderColor: COLORS.structure, backgroundColor: COLORS.canvas }}>
                            <TrendingUp size={16} style={{ color: COLORS.brand }} />
                        </div>
                        <span className="text-[9px] font-mono tracking-widest" style={{ color: COLORS.data }}>
                            TRENDING_TOKENS
                        </span>
                    </div>
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className="p-1.5 border transition-all hover:border-brand/50"
                        style={{ borderColor: COLORS.structure }}
                        title="Toggle filters"
                    >
                        <Filter size={14} style={{ color: COLORS.data }} />
                    </button>
                </div>

                {/* Search Bar */}
                <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: COLORS.data }} />
                    <input
                        type="text"
                        placeholder="Search by name, symbol, or address..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-9 h-10 text-sm border transition-all focus:border-brand/50 focus:outline-none"
                        style={{ 
                            borderColor: COLORS.structure, 
                            backgroundColor: COLORS.canvas,
                            color: COLORS.text 
                        }}
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery("")}
                            className="absolute right-3 top-1/2 -translate-y-1/2 transition-opacity hover:opacity-80"
                            style={{ color: COLORS.data }}
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>

                {/* Filters */}
                {showFilters && (
                    <div className="p-4 border-t space-y-4" style={{ borderColor: COLORS.structure }}>
                        <div className="space-y-2">
                            <label className="text-[10px] font-mono tracking-widest" style={{ color: COLORS.data }}>SORT_BY</label>
                            <div className="flex gap-2 flex-wrap">
                                {(["default", "volume", "price", "priceChange"] as SortOption[]).map((option) => (
                                    <button
                                        key={option}
                                        onClick={() => setSortBy(option)}
                                        className={`px-3 py-1.5 text-xs font-mono border transition-all ${
                                            sortBy === option
                                                ? 'border-brand bg-brand/10'
                                                : 'border-structure hover:border-brand/50'
                                        }`}
                                        style={sortBy === option 
                                            ? { borderColor: COLORS.brand, backgroundColor: `${COLORS.brand}10`, color: COLORS.text }
                                            : { borderColor: COLORS.structure, color: COLORS.data, backgroundColor: COLORS.canvas }
                                        }
                                    >
                                        {option === "default" ? "Default" : option === "priceChange" ? "Price Change" : option.charAt(0).toUpperCase() + option.slice(1)}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-mono tracking-widest" style={{ color: COLORS.data }}>MIN_VOLUME_USD</label>
                            <input
                                type="number"
                                placeholder="e.g., 1000"
                                value={minVolume}
                                onChange={(e) => setMinVolume(e.target.value)}
                                className="w-full h-9 px-3 text-xs border transition-all focus:border-brand/50 focus:outline-none"
                                style={{ 
                                    borderColor: COLORS.structure, 
                                    backgroundColor: COLORS.canvas,
                                    color: COLORS.text 
                                }}
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-mono tracking-widest" style={{ color: COLORS.data }}>PRICE_CHANGE</label>
                            <div className="flex gap-2">
                                {(["all", "positive", "negative"] as const).map((option) => (
                                    <button
                                        key={option}
                                        onClick={() => setFilterPriceChange(option)}
                                        className={`px-3 py-1.5 text-xs font-mono border transition-all ${
                                            filterPriceChange === option
                                                ? 'border-brand bg-brand/10'
                                                : 'border-structure hover:border-brand/50'
                                        }`}
                                        style={filterPriceChange === option 
                                            ? { borderColor: COLORS.brand, backgroundColor: `${COLORS.brand}10`, color: COLORS.text }
                                            : { borderColor: COLORS.structure, color: COLORS.data, backgroundColor: COLORS.canvas }
                                        }
                                    >
                                        {option.charAt(0).toUpperCase() + option.slice(1)}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Results Count */}
            <div className="px-6 py-3 border-b text-[10px] font-mono" style={{ borderColor: COLORS.structure, color: COLORS.data }}>
                Showing {filteredAndSortedTokens.length} of {tokens.length} tokens
            </div>

            {/* Tokens List */}
            <div className="flex-1 overflow-y-auto">
                {filteredAndSortedTokens.length === 0 ? (
                    <div className="text-center py-8 text-sm" style={{ color: COLORS.data }}>
                        No tokens found matching your criteria
                    </div>
                ) : (
                    <div className="space-y-px">
                        {filteredAndSortedTokens.map((token) => {
                            const blockExplorerUrl = `https://solscan.io/token/${token.address}`;
                            const isSelected = selectedToken?.address === token.address;
                            
                            const handleClick = (e: React.MouseEvent) => {
                                e.preventDefault();
                                
                                // If callback exists, use it for selection (don't open explorer)
                                if (onTokenSelect) {
                                    // Always select - prevent deselection (token must always be selected)
                                    if (!isSelected) {
                                        onTokenSelect(token);
                                    }
                                    // If already selected, do nothing (can't deselect)
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
                                    className={`group transition-colors border-b ${
                                        isSelected 
                                            ? 'border-brand' 
                                            : 'border-structure'
                                    }`}
                                    style={{ 
                                        borderColor: isSelected ? COLORS.brand : COLORS.structure,
                                        backgroundColor: isSelected ? `${COLORS.brand}05` : 'transparent'
                                    }}
                                >
                                <div
                                    onClick={handleClick}
                                    onContextMenu={handleRightClick}
                                    title={onTokenSelect ? `Click to view traders for ${token.symbol}` : `View ${token.symbol} on Solscan (Right-click for explorer)`}
                                    className={`flex items-center justify-between cursor-pointer p-4 transition-colors hover:opacity-90`}
                                    style={{ backgroundColor: isSelected ? `${COLORS.brand}05` : 'transparent' }}
                                >
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                        <img
                                            src={token.logoURI || "/placeholder-token.png"}
                                            alt={token.symbol}
                                            className="w-12 h-12 rounded-full flex-shrink-0 object-cover border"
                                            style={{ borderColor: COLORS.structure }}
                                            onError={(e) => {
                                                e.currentTarget.src = `https://api.dicebear.com/7.x/identicon/svg?seed=${token.address}`;
                                            }}
                                        />
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium text-sm truncate flex items-center gap-1.5" style={{ color: COLORS.text }}>
                                                {token.symbol}
                                                <ExternalLink size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: COLORS.data }} />
                                            </div>
                                            <div className="text-[11px] truncate mt-0.5" style={{ color: COLORS.data }}>{token.name}</div>
                                            <div className="text-[9px] font-mono truncate mt-0.5" style={{ color: COLORS.data }}>
                                                {formatAddress(token.address)}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right flex-shrink-0 ml-4">
                                        <div className="text-sm font-medium" style={{ color: COLORS.text }}>
                                            {token.price > 0 ? (
                                                `$${token.price < 0.01 ? token.price.toFixed(6) : token.price.toFixed(2)}`
                                            ) : (
                                                <span className="text-xs" style={{ color: COLORS.data }}>Price N/A</span>
                                            )}
                                        </div>
                                        {token.priceChange24h !== undefined && (
                                            <div
                                                className={`text-[11px] flex items-center justify-end gap-1 mt-0.5 ${
                                                    token.priceChange24h >= 0 ? "text-emerald-400" : "text-red-400"
                                                }`}
                                            >
                                                {token.priceChange24h >= 0 ? "+" : ""}
                                                {token.priceChange24h.toFixed(2)}%
                                                <ArrowUpRight size={10} />
                                            </div>
                                        )}
                                        {token.marketCap && (
                                            <div className="text-[10px] mt-1" style={{ color: COLORS.data }}>
                                                MCap: {formatMarketCap(token.marketCap)}
                                            </div>
                                        )}
                                        {(token.volume24h || token.daily_volume) && (
                                            <div className="text-[10px] mt-0.5" style={{ color: COLORS.data }}>
                                                Vol: {formatVolume(token.volume24h || token.daily_volume || 0)}
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        onClick={handleExpandToggle}
                                        className="ml-2 p-1 border transition-all hover:border-brand/50 flex-shrink-0"
                                        style={{ borderColor: COLORS.structure }}
                                        title="Show/hide traders"
                                    >
                                        <ChevronDown 
                                            size={14} 
                                            className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                            style={{ color: COLORS.data }}
                                        />
                                    </button>
                                </div>

                                {/* Expanded Traders Section */}
                                {isExpanded && (
                                    <div className="px-4 pb-3 border-t pt-3" style={{ borderColor: COLORS.structure }}>
                                        <div className="flex items-center gap-2 mb-3">
                                            <Users size={14} style={{ color: COLORS.data }} />
                                            <span className="text-xs font-mono" style={{ color: COLORS.data }}>TOP_TRADERS</span>
                                        </div>
                                        
                                        {traders.loading ? (
                                            <div className="space-y-2">
                                                {[...Array(3)].map((_, i) => (
                                                    <div key={i} className="animate-pulse flex items-center gap-2 p-2 border" style={{ borderColor: COLORS.structure }}>
                                                        <div className="w-8 h-8 rounded-full" style={{ backgroundColor: `${COLORS.structure}40` }}></div>
                                                        <div className="flex-1 space-y-1">
                                                            <div className="h-3 w-24 rounded" style={{ backgroundColor: `${COLORS.structure}40` }}></div>
                                                            <div className="h-2 w-16 rounded" style={{ backgroundColor: `${COLORS.structure}40` }}></div>
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
                                                        className="flex items-center gap-2 p-2 border cursor-pointer transition-colors hover:opacity-80"
                                                        style={{ borderColor: COLORS.structure }}
                                                    >
                                                        <img
                                                            src={trader.avatarUrl}
                                                            alt={trader.name}
                                                            className="w-8 h-8 rounded-full border"
                                                            style={{ borderColor: COLORS.structure }}
                                                        />
                                                        <div className="flex-1 min-w-0">
                                                            <div className="text-xs font-medium truncate" style={{ color: COLORS.text }}>
                                                                {trader.name}
                                                            </div>
                                                            <div className="flex items-center gap-2 text-[10px]">
                                                                <span className={trader.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                                                                    PnL: ${trader.pnl.toFixed(2)}
                                                                </span>
                                                                <span style={{ color: COLORS.data }}>•</span>
                                                                <span style={{ color: COLORS.data }}>
                                                                    ROI: {trader.roi.toFixed(1)}%
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="text-[10px] font-mono" style={{ color: COLORS.data }}>
                                                                #{trader.rank}
                                                            </div>
                                                            <div className="text-[9px]" style={{ color: COLORS.data }}>
                                                                {trader.totalTrades} trades
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                                {traders.traders.length > 20 && (
                                                    <div className="text-center pt-1">
                                                        <span className="text-[10px]" style={{ color: COLORS.data }}>
                                                            +{traders.traders.length - 20} more traders
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="text-center py-4 text-xs" style={{ color: COLORS.data }}>
                                                No traders found for this token
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    </div>
                )}
            </div>
        </div>
    );
}