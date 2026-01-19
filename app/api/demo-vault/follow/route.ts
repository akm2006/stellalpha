import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const SOL_MINT = 'So11111111111111111111111111111111111111112';

// POST: Create a new TraderState with USD allocation (no auto-sync)
export async function POST(request: NextRequest) {
  try {
    const { wallet, starTrader, allocationUsd } = await request.json();
    
    if (!wallet || !starTrader) {
      return NextResponse.json({ error: 'Wallet and starTrader required' }, { status: 400 });
    }
    
    const usdAmount = Math.max(0, Number(allocationUsd) || 0);
    
    if (usdAmount < 10) {
      return NextResponse.json({ error: 'Minimum allocation is $10' }, { status: 400 });
    }
    
    // Get vault
    const { data: vault, error: vaultError } = await supabase
      .from('demo_vaults')
      .select('id, balance_usd')
      .eq('user_wallet', wallet)
      .single();
    
    if (vaultError || !vault) {
      return NextResponse.json({ error: 'Vault not found' }, { status: 404 });
    }
    
    // Check sufficient balance
    if (usdAmount > Number(vault.balance_usd)) {
      return NextResponse.json({ 
        error: `Insufficient balance. Available: $${Number(vault.balance_usd).toFixed(2)}` 
      }, { status: 400 });
    }
    
    // Check if already following this trader
    const { data: existingTs } = await supabase
      .from('demo_trader_states')
      .select('id')
      .eq('vault_id', vault.id)
      .eq('star_trader', starTrader)
      .single();
    
    if (existingTs) {
      return NextResponse.json({ 
        error: 'Already following this trader. Unfollow first to change allocation.' 
      }, { status: 400 });
    }
    
    // INSERT new trader state - starts as pending (not synced, not initialized)
    const { data: traderState, error } = await supabase
      .from('demo_trader_states')
      .insert({
        vault_id: vault.id,
        star_trader: starTrader,
        allocated_usd: usdAmount,
        is_syncing: false,
        is_initialized: false,
        is_paused: false,
        is_settled: false
      })
      .select()
      .single();
    
    if (error) {
      console.error('Create trader state error:', error);
      return NextResponse.json({ error: 'Failed to create trader state' }, { status: 500 });
    }
    
    // Deduct from vault balance
    await supabase
      .from('demo_vaults')
      .update({ balance_usd: Number(vault.balance_usd) - usdAmount })
      .eq('id', vault.id);
    
    // Create initial USDC position (funds are reserved, not synced yet)
    await supabase.from('demo_positions').insert({
      trader_state_id: traderState.id,
      token_mint: USDC_MINT,
      token_symbol: 'USDC',
      size: usdAmount,
      cost_usd: usdAmount,
      avg_cost: 1
    });
    
    return NextResponse.json({
      success: true,
      traderState,
      message: 'Trader state created. Click Sync to match star trader portfolio.'
    });
  } catch (error) {
    console.error('Create trader state error:', error);
    return NextResponse.json({ error: 'Failed to create trader state' }, { status: 500 });
  }
}

// PATCH: Handle actions - sync, initialize, pause, resume, settle
export async function PATCH(request: NextRequest) {
  try {
    const { wallet, traderStateId, action } = await request.json();
    
    if (!wallet || !traderStateId || !action) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    
    // Verify ownership
    const { data: vault } = await supabase
      .from('demo_vaults')
      .select('id')
      .eq('user_wallet', wallet)
      .single();
    
    if (!vault) {
      return NextResponse.json({ error: 'Vault not found' }, { status: 404 });
    }
    
    const { data: ts } = await supabase
      .from('demo_trader_states')
      .select('*')
      .eq('id', traderStateId)
      .eq('vault_id', vault.id)
      .single();
    
    if (!ts) {
      return NextResponse.json({ error: 'Trader state not found' }, { status: 404 });
    }
    
    switch (action) {
      case 'sync':
        return await handleSync(ts);
      case 'initialize':
        return await handleInitialize(ts);
      case 'pause':
        if (ts.is_paused) return NextResponse.json({ error: 'Already paused' }, { status: 400 });
        await supabase.from('demo_trader_states').update({ is_paused: true }).eq('id', traderStateId);
        return NextResponse.json({ success: true, action: 'pause' });
      case 'resume':
        if (!ts.is_paused) return NextResponse.json({ error: 'Not paused' }, { status: 400 });
        await supabase.from('demo_trader_states').update({ is_paused: false }).eq('id', traderStateId);
        return NextResponse.json({ success: true, action: 'resume' });
      case 'settle':
        if (ts.is_settled) return NextResponse.json({ error: 'Already settled' }, { status: 400 });
        await supabase.from('demo_trader_states').update({ is_settled: true, is_paused: true }).eq('id', traderStateId);
        return NextResponse.json({ success: true, action: 'settle' });
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Update trader state error:', error);
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}

// Handle sync action - fetch star trader portfolio and create positions
async function handleSync(ts: any) {
  const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
  const JUPITER_API_KEY = process.env.JUPITER_API_KEY;
  
  if (ts.is_syncing) {
    return NextResponse.json({ error: 'Already syncing' }, { status: 400 });
  }
  
  if (ts.is_initialized) {
    return NextResponse.json({ error: 'Already initialized. Cannot re-sync.' }, { status: 400 });
  }
  
  // Mark as syncing
  await supabase.from('demo_trader_states').update({ is_syncing: true }).eq('id', ts.id);
  
  try {
    // Delete existing positions (clear USDC placeholder)
    await supabase.from('demo_positions').delete().eq('trader_state_id', ts.id);
    
    // Fetch star trader's portfolio
    const response = await fetch(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'sync-portfolio',
        method: 'getAssetsByOwner',
        params: {
          ownerAddress: ts.star_trader,
          page: 1,
          limit: 1000, // Increased from 100 to get all holdings
          displayOptions: { showFungible: true, showNativeBalance: true }
        }
      })
    });
    
    const data = await response.json();
    
    if (data.error || !data.result) {
      // Fallback: create USDC position
      await supabase.from('demo_positions').insert({
        trader_state_id: ts.id,
        token_mint: USDC_MINT,
        token_symbol: 'USDC',
        size: ts.allocated_usd,
        cost_usd: ts.allocated_usd,
        avg_cost: 1
      });
      await supabase.from('demo_trader_states').update({ is_syncing: false }).eq('id', ts.id);
      return NextResponse.json({ 
        success: true, 
        action: 'sync',
        warning: 'Could not fetch star trader portfolio. Created USDC position.'
      });
    }
    
    const result = data.result;
    const items: { mint: string; symbol: string; balance: number }[] = [];
    
    // Native SOL
    const nativeSol = (result.nativeBalance?.lamports || 0) / 1e9;
    if (nativeSol > 0.001) {
      items.push({ mint: SOL_MINT, symbol: 'SOL', balance: nativeSol });
    }
    
    // Fungible tokens
    for (const item of result.items || []) {
      if (item.interface === 'FungibleToken' || item.interface === 'FungibleAsset') {
        const tokenInfo = item.token_info || {};
        const metadata = item.content?.metadata || {};
        const rawBalance = tokenInfo.balance || 0;
        const decimals = tokenInfo.decimals ?? 6;
        const balance = rawBalance / Math.pow(10, decimals);
        
        if (balance > 0.0001) {
          items.push({
            mint: item.id,
            symbol: metadata.symbol || item.id.slice(0, 6),
            balance
          });
        }
      }
    }
    
    if (items.length === 0) {
      await supabase.from('demo_positions').insert({
        trader_state_id: ts.id,
        token_mint: USDC_MINT,
        token_symbol: 'USDC',
        size: ts.allocated_usd,
        cost_usd: ts.allocated_usd,
        avg_cost: 1
      });
      await supabase.from('demo_trader_states').update({ is_syncing: false }).eq('id', ts.id);
      return NextResponse.json({ success: true, action: 'sync', warning: 'Star trader has no tokens' });
    }
    
    // Get prices - first fetch SOL and USDC specifically (critical tokens)
    let prices: Record<string, number> = {};
    const JUPITER_HEADERS: Record<string, string> = JUPITER_API_KEY ? { 'x-api-key': JUPITER_API_KEY } : {};
    
    console.log(`[Sync] Fetching SOL/USDC prices first...`);
    
    try {
      // Step 1: Fetch critical token prices (SOL, USDC) first
      const criticalMints = [SOL_MINT, USDC_MINT];
      const criticalResponse = await fetch(
        `https://api.jup.ag/price/v3?ids=${criticalMints.join(',')}`,
        { headers: JUPITER_HEADERS }
      );
      
      if (criticalResponse.ok) {
        const criticalData = await criticalResponse.json();
        console.log(`[Sync] Critical prices response:`, JSON.stringify(criticalData).slice(0, 500));
        
        for (const [mint, info] of Object.entries(criticalData)) {
          if (info && typeof info === 'object') {
            const priceObj = info as Record<string, unknown>;
            const usdPrice = priceObj.usdPrice ?? priceObj.price;
            if (typeof usdPrice === 'number' && usdPrice > 0) {
              prices[mint] = usdPrice;
            } else if (typeof usdPrice === 'string') {
              const parsed = parseFloat(usdPrice);
              if (!isNaN(parsed) && parsed > 0) prices[mint] = parsed;
            }
          }
        }
      }
      
      console.log(`[Sync] Critical prices: SOL=$${prices[SOL_MINT]?.toFixed(2) || 'N/A'}, USDC=$${prices[USDC_MINT]?.toFixed(2) || 'N/A'}`);
      
      // Step 2: Fetch other token prices (limit to top 30 by balance)
      const sortedItems = [...items].sort((a, b) => b.balance - a.balance).slice(0, 30);
      const otherMints = sortedItems.map(i => i.mint).filter(m => m !== SOL_MINT && m !== USDC_MINT);
      
      if (otherMints.length > 0) {
        console.log(`[Sync] Fetching ${otherMints.length} other token prices...`);
        const otherResponse = await fetch(
          `https://api.jup.ag/price/v3?ids=${otherMints.join(',')}`,
          { headers: JUPITER_HEADERS }
        );
        
        if (otherResponse.ok) {
          const otherData = await otherResponse.json();
          for (const [mint, info] of Object.entries(otherData)) {
            if (info && typeof info === 'object') {
              const priceObj = info as Record<string, unknown>;
              const usdPrice = priceObj.usdPrice ?? priceObj.price;
              if (typeof usdPrice === 'number' && usdPrice > 0) {
                prices[mint] = usdPrice;
              }
            }
          }
        }
      }
      
      console.log(`[Sync] Total prices fetched: ${Object.keys(prices).length}`);
    } catch (err) {
      console.error('[Sync] Price fetch error:', err);
      await supabase.from('demo_trader_states').update({ is_syncing: false }).eq('id', ts.id);
      return NextResponse.json({ 
        error: 'Failed to fetch realtime prices from Jupiter. Please try again.' 
      }, { status: 500 });
    }
    
    // Require SOL or USDC price - fail if neither available
    if (!prices[SOL_MINT] && !prices[USDC_MINT]) {
      await supabase.from('demo_trader_states').update({ is_syncing: false }).eq('id', ts.id);
      return NextResponse.json({ 
        error: 'Could not fetch realtime prices for SOL/USDC. Please try again.' 
      }, { status: 500 });
    }
    
    // Calculate portfolio value and percentages
    let totalValue = 0;
    const holdings: { mint: string; symbol: string; balance: number; price: number; value: number; percent: number }[] = [];
    
    for (const item of items) {
      const price = prices[item.mint] || 0;
      const value = item.balance * price;
      totalValue += value;
      holdings.push({ ...item, price, value, percent: 0 });
    }
    
    console.log(`[Sync] Total portfolio value: $${totalValue.toFixed(2)}, ${holdings.length} holdings`);
    
    for (const h of holdings) {
      h.percent = totalValue > 0 ? (h.value / totalValue) * 100 : 0;
    }
    
    // Create positions matching star trader ratios
    const significantHoldings = holdings.filter(h => h.percent >= 0.1);
    
    console.log(`[Sync] Creating ${significantHoldings.length} positions from significant holdings`);
    
    let createdPositions = 0;
    for (const holding of significantHoldings) {
      const myUsdAllocation = ts.allocated_usd * (holding.percent / 100);
      if (myUsdAllocation < 0.10) continue;
      
      const pricePerToken = holding.price;
      
      if (pricePerToken > 0) {
        const myTokenAmount = myUsdAllocation / pricePerToken;
        
        const { error } = await supabase.from('demo_positions').insert({
          trader_state_id: ts.id,
          token_mint: holding.mint,
          token_symbol: holding.symbol,
          size: myTokenAmount,
          cost_usd: myUsdAllocation,
          avg_cost: pricePerToken
        });
        
        if (error) {
          console.error(`[Sync] Failed to create position for ${holding.symbol}:`, error);
        } else {
          createdPositions++;
          console.log(`[Sync] Created position: ${holding.symbol} ${myTokenAmount.toFixed(4)} @ $${pricePerToken.toFixed(2)} = $${myUsdAllocation.toFixed(2)}`);
        }
        
        // Cache price for fallback (ignore errors)
        try {
          await supabase.from('token_prices').upsert({
            mint: holding.mint,
            price: pricePerToken,
            updated_at: new Date().toISOString()
          }, { onConflict: 'mint' });
        } catch {}
      } else {
        // No price - use USD allocation as fallback
        const { error } = await supabase.from('demo_positions').insert({
          trader_state_id: ts.id,
          token_mint: holding.mint,
          token_symbol: holding.symbol,
          size: myUsdAllocation,
          cost_usd: myUsdAllocation,
          avg_cost: 1
        });
        
        if (error) {
          console.error(`[Sync] Failed to create fallback position for ${holding.symbol}:`, error);
        } else {
          createdPositions++;
        }
      }
    }
    
    console.log(`[Sync] Created ${createdPositions} positions successfully`);
    
    // Mark sync complete (but not initialized)
    await supabase.from('demo_trader_states').update({ is_syncing: false }).eq('id', ts.id);
    
    return NextResponse.json({ 
      success: true, 
      action: 'sync',
      positions: createdPositions,
      message: createdPositions > 0 
        ? 'Portfolio synced. Click Initialize to start copy trading.'
        : 'Sync completed but no positions created. Try again.'
    });
    
  } catch (error) {
    console.error('Sync error:', error);
    // Reset syncing flag
    await supabase.from('demo_trader_states').update({ is_syncing: false }).eq('id', ts.id);
    
    // Create USDC fallback position
    await supabase.from('demo_positions').insert({
      trader_state_id: ts.id,
      token_mint: USDC_MINT,
      token_symbol: 'USDC',
      size: ts.allocated_usd,
      cost_usd: ts.allocated_usd,
      avg_cost: 1
    });
    
    return NextResponse.json({ 
      success: true, 
      action: 'sync',
      warning: 'Sync failed, created USDC fallback position'
    });
  }
}

// Handle initialize action - mark as ready for copy trading
async function handleInitialize(ts: any) {
  if (ts.is_initialized) {
    return NextResponse.json({ error: 'Already initialized' }, { status: 400 });
  }
  
  if (ts.is_syncing) {
    return NextResponse.json({ error: 'Wait for sync to complete' }, { status: 400 });
  }
  
  // Check if has positions
  const { data: positions } = await supabase
    .from('demo_positions')
    .select('id')
    .eq('trader_state_id', ts.id);
  
  if (!positions || positions.length === 0) {
    return NextResponse.json({ error: 'Sync portfolio first' }, { status: 400 });
  }
  
  await supabase.from('demo_trader_states')
    .update({ is_initialized: true })
    .eq('id', ts.id);
  
  return NextResponse.json({ 
    success: true, 
    action: 'initialize',
    message: 'Trader state initialized. Copy trading active.'
  });
}

// DELETE: Unfollow/withdraw trader state (return funds to vault)
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const wallet = searchParams.get('wallet');
  const traderStateId = searchParams.get('traderStateId');
  
  if (!wallet || !traderStateId) {
    return NextResponse.json({ error: 'Wallet and traderStateId required' }, { status: 400 });
  }
  
  try {
    // Get vault
    const { data: vault } = await supabase
      .from('demo_vaults')
      .select('id, balance_usd')
      .eq('user_wallet', wallet)
      .single();
    
    if (!vault) {
      return NextResponse.json({ error: 'Vault not found' }, { status: 404 });
    }
    
    // Get trader state
    const { data: traderState } = await supabase
      .from('demo_trader_states')
      .select('id, allocated_usd')
      .eq('id', traderStateId)
      .eq('vault_id', vault.id)
      .single();
    
    if (!traderState) {
      return NextResponse.json({ error: 'Trader state not found' }, { status: 404 });
    }
    
    // Calculate current value of positions to return
    const { data: positions } = await supabase
      .from('demo_positions')
      .select('*')
      .eq('trader_state_id', traderState.id);
    
    // Fetch current prices to calculate actual return value
    const JUPITER_API_KEY = process.env.JUPITER_API_KEY;
    let totalReturnValue = 0;
    
    if (positions && positions.length > 0) {
      const mints = positions.map(p => p.token_mint);
      let prices: Record<string, number> = {};
      
      try {
        const pricesResponse = await fetch(
          `https://api.jup.ag/price/v3?ids=${mints.join(',')}`,
          { headers: JUPITER_API_KEY ? { 'x-api-key': JUPITER_API_KEY } : {} }
        );
        const pricesData = await pricesResponse.json();
        
        // Jupiter v3 returns prices directly on root object
        for (const [mint, info] of Object.entries(pricesData)) {
          if (info && typeof info === 'object' && 'usdPrice' in info) {
            prices[mint] = Number((info as { usdPrice: number }).usdPrice || 0);
          }
        }
      } catch {
        // Use cached prices
        const { data: cachedPrices } = await supabase
          .from('token_prices')
          .select('*')
          .in('mint', mints);
        
        if (cachedPrices) {
          for (const p of cachedPrices) {
            prices[p.mint] = p.price;
          }
        }
      }
      
      for (const pos of positions) {
        const price = prices[pos.token_mint] || 0;
        if (price > 0) {
          totalReturnValue += Number(pos.size) * price;
        } else {
          // No price, use cost basis
          totalReturnValue += Number(pos.cost_usd);
        }
      }
    }
    
    // If no value calculated, use allocated amount
    if (totalReturnValue === 0) {
      totalReturnValue = Number(traderState.allocated_usd);
    }
    
    // Return funds to vault
    await supabase
      .from('demo_vaults')
      .update({ balance_usd: Number(vault.balance_usd) + totalReturnValue })
      .eq('id', vault.id);
    
    // Delete trader state (cascades to positions and trades)
    await supabase
      .from('demo_trader_states')
      .delete()
      .eq('id', traderState.id);
    
    return NextResponse.json({ 
      success: true,
      returnedUsd: totalReturnValue 
    });
  } catch (error) {
    console.error('Delete trader state error:', error);
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}
