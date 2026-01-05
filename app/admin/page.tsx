'use client';

import { useState, useEffect, useCallback } from 'react';

/**
 * Admin Operator Console
 * 
 * Backend-only swap execution for testing non-custodial automation.
 * 
 * ⚠️ BACKEND WALLET SIGNS ALL SWAPS
 * Users never sign swaps. Funds remain in TraderState PDAs.
 */

interface VaultInfo {
  address: string;
  owner: string;
  baseMint: string;
  balances: {
    sol: { formatted: string };
    usdc: { formatted: string };
  };
}

interface TraderInfo {
  address: string;
  trader: string;
  isInitialized: boolean;
  isPaused: boolean;
  balances: {
    input: { formatted: string; symbol: string; raw: string };
    output: { formatted: string; symbol: string; raw: string };
  };
}

interface SwapResult {
  success: boolean;
  transaction?: string;
  swap?: any;
  balances?: any;
  nonCustodialProof?: any;
  error?: string;
}

export default function AdminPage() {
  // State
  const [backendStatus, setBackendStatus] = useState<'checking' | 'ready' | 'error'>('checking');
  const [backendWallet, setBackendWallet] = useState<string>('');
  const [vaults, setVaults] = useState<VaultInfo[]>([]);
  const [selectedVault, setSelectedVault] = useState<VaultInfo | null>(null);
  const [traders, setTraders] = useState<TraderInfo[]>([]);
  const [selectedTrader, setSelectedTrader] = useState<TraderInfo | null>(null);
  
  // Swap form
  const [direction, setDirection] = useState<'SOL_TO_USDC' | 'USDC_TO_SOL'>('SOL_TO_USDC');
  const [amount, setAmount] = useState('0.1');
  const [slippage, setSlippage] = useState('100');
  
  // Execution state
  const [executing, setExecuting] = useState(false);
  const [swapResult, setSwapResult] = useState<SwapResult | null>(null);

  // Check backend wallet
  useEffect(() => {
    const checkBackend = async () => {
      try {
        // Simple check - try to list vaults
        const res = await fetch('/api/vault/list');
        if (res.ok) {
          setBackendStatus('ready');
          // The backend wallet address would be in the response headers or a dedicated endpoint
          // For now, we'll show it in swap results
        } else {
          setBackendStatus('error');
        }
      } catch {
        setBackendStatus('error');
      }
    };
    checkBackend();
  }, []);

  // Fetch vaults
  const fetchVaults = useCallback(async () => {
    try {
      const res = await fetch('/api/vault/list');
      const data = await res.json();
      setVaults(data.vaults || []);
    } catch (e) {
      console.error('Failed to fetch vaults:', e);
    }
  }, []);

  // Fetch traders for selected vault
  const fetchTraders = useCallback(async () => {
    if (!selectedVault) {
      setTraders([]);
      return;
    }
    try {
      const res = await fetch(`/api/trader/list-by-vault?vault=${selectedVault.address}`);
      const data = await res.json();
      setTraders(data.traders || []);
    } catch (e) {
      console.error('Failed to fetch traders:', e);
    }
  }, [selectedVault]);

  useEffect(() => {
    if (backendStatus === 'ready') {
      fetchVaults();
      const interval = setInterval(fetchVaults, 10000);
      return () => clearInterval(interval);
    }
  }, [backendStatus, fetchVaults]);

  useEffect(() => {
    fetchTraders();
  }, [selectedVault, fetchTraders]);

  // Execute swap
  const executeSwap = async () => {
    if (!selectedVault || !selectedTrader) return;
    
    setExecuting(true);
    setSwapResult(null);
    
    try {
      const res = await fetch('/api/swap/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerPubkey: selectedVault.owner,
          traderStatePubkey: selectedTrader.address,
          direction,
          amount: parseFloat(amount),
          slippageBps: parseInt(slippage),
        }),
      });
      
      const data = await res.json();
      setSwapResult(data);
      
      if (data.success) {
        // Refresh traders to see updated balances
        await fetchTraders();
      }
    } catch (e: any) {
      setSwapResult({ success: false, error: e.message });
    }
    
    setExecuting(false);
  };

  // Render backend error
  if (backendStatus === 'checking') {
    return (
      <div style={containerStyle}>
        <h1 style={{ color: '#fff' }}>🔄 Checking Backend...</h1>
      </div>
    );
  }

  if (backendStatus === 'error') {
    return (
      <div style={containerStyle}>
        <h1 style={{ color: '#ff6b6b' }}>❌ Backend Unavailable</h1>
        <p style={{ color: '#888' }}>
          Could not connect to backend API. Ensure the forked validator is running:
        </p>
        <code style={{ display: 'block', padding: '1rem', backgroundColor: '#111', borderRadius: '8px' }}>
          bash scripts/setup_phase6c_fork.sh
        </code>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ color: '#fff', marginBottom: '0.5rem' }}>
          🛠️ Admin Operator Console
        </h1>
        <div style={{
          padding: '0.75rem',
          backgroundColor: '#1a2a1a',
          border: '1px solid #2a5a2a',
          borderRadius: '8px',
          color: '#4CAF50',
          fontSize: '0.85rem',
        }}>
          ✓ <strong>Backend-Only Execution</strong> — All swaps signed by backend wallet. Users never sign trades.
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        {/* Left Column: Vault & Trader Selection */}
        <div>
          {/* Vault Explorer */}
          <Section title="🏦 Vault Explorer">
            {vaults.length === 0 ? (
              <p style={{ color: '#666' }}>No vaults found. Create one from /user page.</p>
            ) : (
              <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                {vaults.map((v) => (
                  <div
                    key={v.address}
                    onClick={() => {
                      setSelectedVault(v);
                      setSelectedTrader(null);
                    }}
                    style={{
                      padding: '0.75rem',
                      backgroundColor: selectedVault?.address === v.address ? '#1a3a1a' : '#0a0a0a',
                      border: selectedVault?.address === v.address ? '1px solid #4CAF50' : '1px solid #333',
                      borderRadius: '8px',
                      marginBottom: '0.5rem',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#888' }}>
                      {v.address.slice(0, 20)}...
                    </div>
                    <div style={{ fontSize: '0.85rem' }}>
                      {v.balances.sol.formatted} SOL | {v.balances.usdc.formatted} USDC
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button onClick={fetchVaults} style={{ ...buttonSecondaryStyle, marginTop: '0.5rem' }}>
              Refresh
            </button>
          </Section>

          {/* TraderState Inspector */}
          {selectedVault && (
            <Section title="📊 TraderState Inspector">
              {traders.length === 0 ? (
                <p style={{ color: '#666' }}>No traders for this vault.</p>
              ) : (
                <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                  {traders.map((t) => (
                    <div
                      key={t.address}
                      onClick={() => setSelectedTrader(t)}
                      style={{
                        padding: '0.75rem',
                        backgroundColor: selectedTrader?.address === t.address ? '#1a3a1a' : '#0a0a0a',
                        border: selectedTrader?.address === t.address ? '1px solid #4CAF50' : '1px solid #333',
                        borderRadius: '8px',
                        marginBottom: '0.5rem',
                        cursor: t.isInitialized ? 'pointer' : 'not-allowed',
                        opacity: t.isInitialized ? 1 : 0.5,
                      }}
                    >
                      <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#888' }}>
                        {t.address.slice(0, 20)}...
                      </div>
                      <div style={{ fontSize: '0.85rem' }}>
                        <span style={{ color: t.isInitialized ? '#4CAF50' : '#ff9800' }}>
                          {t.isInitialized ? '✓ Ready' : '⏳ Not initialized'}
                        </span>
                        {t.isPaused && <span style={{ color: '#ff6b6b' }}> | ⏸ Paused</span>}
                      </div>
                      <div style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                        {t.balances.input.formatted} {t.balances.input.symbol} |{' '}
                        {t.balances.output.formatted} {t.balances.output.symbol}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          )}
        </div>

        {/* Right Column: Swap Execution */}
        <div>
          <Section title="🔄 One-Click Swap Execution">
            {!selectedTrader ? (
              <p style={{ color: '#666' }}>Select an initialized TraderState to execute swaps.</p>
            ) : !selectedTrader.isInitialized ? (
              <p style={{ color: '#ff9800' }}>TraderState not initialized. Initialize from /user page first.</p>
            ) : (
              <>
                {/* Selected Trader Info */}
                <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: '#0a0a0a', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: '0.5rem' }}>Selected TraderState</div>
                  <div style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                    {selectedTrader.address}
                  </div>
                  <div style={{ marginTop: '0.5rem' }}>
                    <strong>{selectedTrader.balances.input.formatted}</strong> {selectedTrader.balances.input.symbol} |{' '}
                    <strong>{selectedTrader.balances.output.formatted}</strong> {selectedTrader.balances.output.symbol}
                  </div>
                </div>

                {/* Swap Controls */}
                <div style={{ marginBottom: '1rem' }}>
                  <label style={labelStyle}>Direction</label>
                  <select
                    value={direction}
                    onChange={(e) => setDirection(e.target.value as any)}
                    style={selectStyle}
                  >
                    <option value="SOL_TO_USDC">SOL → USDC</option>
                    <option value="USDC_TO_SOL">USDC → SOL</option>
                  </select>
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <label style={labelStyle}>
                    Amount ({direction === 'SOL_TO_USDC' ? 'SOL' : 'USDC'})
                  </label>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    style={inputStyle}
                    step="0.01"
                  />
                </div>

                <div style={{ marginBottom: '1.5rem' }}>
                  <label style={labelStyle}>Slippage (bps)</label>
                  <input
                    type="number"
                    value={slippage}
                    onChange={(e) => setSlippage(e.target.value)}
                    style={inputStyle}
                  />
                  <span style={{ fontSize: '0.75rem', color: '#666' }}> = {parseInt(slippage) / 100}%</span>
                </div>

                <button
                  onClick={executeSwap}
                  disabled={executing}
                  style={{
                    ...buttonStyle,
                    width: '100%',
                    padding: '1rem',
                    fontSize: '1.1rem',
                  }}
                >
                  {executing ? '⏳ Executing...' : '🚀 Execute Swap (Backend Only)'}
                </button>

                <p style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.5rem', textAlign: 'center' }}>
                  Backend wallet signs this transaction. User does not sign.
                </p>
              </>
            )}
          </Section>

          {/* Swap Result */}
          {swapResult && (
            <Section title={swapResult.success ? '✅ Swap Executed' : '❌ Swap Failed'}>
              {swapResult.success ? (
                <>
                  <InfoRow label="Transaction" value={swapResult.transaction || ''} />
                  {swapResult.swap && (
                    <>
                      <InfoRow label="Direction" value={swapResult.swap.direction} />
                      <InfoRow label="Route" value={swapResult.swap.route} />
                      <InfoRow
                        label="Amount"
                        value={`${swapResult.swap.amountIn} ${swapResult.swap.direction === 'SOL_TO_USDC' ? 'SOL' : 'USDC'}`}
                      />
                    </>
                  )}
                  {swapResult.balances && (
                    <>
                      <div style={{ marginTop: '1rem', fontWeight: 'bold', color: '#4CAF50' }}>Balance Changes</div>
                      <InfoRow label="Input" value={swapResult.balances.delta?.input || ''} />
                      <InfoRow label="Output" value={swapResult.balances.delta?.output || ''} />
                    </>
                  )}
                  {swapResult.nonCustodialProof && (
                    <div style={{
                      marginTop: '1rem',
                      padding: '0.75rem',
                      backgroundColor: '#1a2a1a',
                      borderRadius: '8px',
                      border: '1px solid #2a5a2a',
                    }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#4CAF50', marginBottom: '0.5rem' }}>
                        🔒 Non-Custodial Proof
                      </div>
                      <div style={{ fontSize: '0.75rem' }}>
                        <InfoRow label="Backend Wallet" value={swapResult.nonCustodialProof.backendWallet} />
                        <InfoRow label="Funds Owner" value={swapResult.nonCustodialProof.fundsOwner} />
                        <InfoRow
                          label="Backend Owns Tokens"
                          value={swapResult.nonCustodialProof.backendOwnsTokens ? 'YES ⚠️' : 'NO ✓'}
                        />
                        <InfoRow
                          label="User Signed Swap"
                          value={swapResult.nonCustodialProof.userSignedSwap ? 'YES ⚠️' : 'NO ✓'}
                        />
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div style={{ color: '#ff6b6b' }}>
                  {swapResult.error}
                </div>
              )}
            </Section>
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={{
        marginTop: '2rem',
        padding: '1rem',
        backgroundColor: '#111',
        borderRadius: '8px',
        fontSize: '0.8rem',
        color: '#666',
      }}>
        <h4 style={{ color: '#888', marginBottom: '0.5rem' }}>Custody Model Verification</h4>
        <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
          <li>Backend wallet: <strong>executor only</strong></li>
          <li>Token accounts: <strong>PDA-owned</strong></li>
          <li>User signatures: <strong>never required for swaps</strong></li>
          <li>invoke_signed: <strong>enforces PDA authority</strong></li>
        </ul>
      </div>
    </div>
  );
}

// Components
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      backgroundColor: '#111',
      padding: '1.5rem',
      borderRadius: '12px',
      border: '1px solid #333',
      marginBottom: '1.5rem',
    }}>
      <h2 style={{ color: '#fff', fontSize: '1rem', marginBottom: '1rem' }}>{title}</h2>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginBottom: '0.25rem' }}>
      <span style={{ color: '#888', fontSize: '0.8rem' }}>{label}: </span>
      <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', wordBreak: 'break-all' }}>
        {value}
      </span>
    </div>
  );
}

// Styles
const containerStyle: React.CSSProperties = {
  padding: '2rem',
  maxWidth: '1200px',
  margin: '0 auto',
  fontFamily: 'system-ui, sans-serif',
  backgroundColor: '#0a0a0a',
  minHeight: '100vh',
  color: '#e0e0e0',
};

const buttonStyle: React.CSSProperties = {
  padding: '0.75rem 1.5rem',
  backgroundColor: '#4CAF50',
  border: 'none',
  borderRadius: '8px',
  color: '#fff',
  cursor: 'pointer',
  fontWeight: 'bold',
};

const buttonSecondaryStyle: React.CSSProperties = {
  padding: '0.5rem 1rem',
  backgroundColor: '#333',
  border: 'none',
  borderRadius: '6px',
  color: '#fff',
  cursor: 'pointer',
  fontSize: '0.85rem',
};

const inputStyle: React.CSSProperties = {
  padding: '0.75rem',
  borderRadius: '6px',
  border: '1px solid #333',
  backgroundColor: '#0a0a0a',
  color: '#fff',
  width: '100%',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '0.5rem',
  color: '#888',
  fontSize: '0.85rem',
};
