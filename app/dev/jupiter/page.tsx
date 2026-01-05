'use client';

import { useState } from 'react';

/**
 * Jupiter Test Page
 * 
 * Dev-only interface for testing Jupiter v1 API integration.
 * NO wallet connection. NO transaction execution. Read-only.
 * 
 * Route: /dev/jupiter
 */

// Common Solana token mints for testing
const COMMON_MINTS = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  JUP: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
};

interface QuoteResponse {
  success: boolean;
  quote?: {
    inputMint: string;
    outputMint: string;
    inAmount: string;
    outAmount: string;
    slippageBps: number;
    priceImpactPct: string;
    routePlan: Array<{
      swapInfo: {
        ammKey: string;
        label: string;
        inAmount: string;
        outAmount: string;
      };
      percent: number;
    }>;
  };
  summary?: {
    inputMint: string;
    outputMint: string;
    inAmount: string;
    outAmount: string;
    slippageBps: number;
    priceImpactPct: string;
    routeSteps: number;
  };
  error?: string;
}

interface AccountMeta {
  pubkey: string;
  isSigner: boolean;
  isWritable: boolean;
  index: number;
  role: string;
}

interface SwapInstructionsResponse {
  success: boolean;
  swapInstruction?: {
    programId: string;
    accounts: AccountMeta[];
    data: string;
    dataLength: number;
  };
  summary?: {
    totalAccounts: number;
    signerCount: number;
    writableCount: number;
    signers: Array<{ pubkey: string; role: string }>;
    programId: string;
    hasLookupTables: boolean;
    lookupTableCount: number;
  };
  addressLookupTableAddresses?: string[];
  error?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw?: any;
}

export default function JupiterTestPage() {
  // Form state
  const [inputMint, setInputMint] = useState(COMMON_MINTS.SOL);
  const [outputMint, setOutputMint] = useState(COMMON_MINTS.USDC);
  const [amount, setAmount] = useState('1000000000'); // 1 SOL in lamports
  const [slippageBps, setSlippageBps] = useState('50');
  const [authorityPublicKey, setAuthorityPublicKey] = useState('');

  // Response state
  const [quoteResponse, setQuoteResponse] = useState<QuoteResponse | null>(null);
  const [swapInstructionsResponse, setSwapInstructionsResponse] = useState<SwapInstructionsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchQuote = async () => {
    setLoading(true);
    setError(null);
    setQuoteResponse(null);
    setSwapInstructionsResponse(null);

    try {
      const params = new URLSearchParams({
        inputMint,
        outputMint,
        amount,
        slippageBps,
      });

      const response = await fetch(`/api/jupiter/quote?${params}`);
      const data = await response.json();
      
      if (!response.ok) {
        setError(data.error || 'Failed to fetch quote');
        return;
      }

      setQuoteResponse(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const fetchSwapInstructions = async () => {
    if (!quoteResponse?.quote) {
      setError('Fetch a quote first');
      return;
    }

    if (!authorityPublicKey) {
      setError('Enter authorityPublicKey (TraderState PDA)');
      return;
    }

    setLoading(true);
    setError(null);
    setSwapInstructionsResponse(null);

    try {
      const response = await fetch('/api/jupiter/swap-instructions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteResponse: quoteResponse.quote,
          authorityPublicKey,
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        setError(data.error || 'Failed to fetch swap instructions');
        return;
      }

      setSwapInstructionsResponse(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ 
      padding: '2rem', 
      maxWidth: '1400px', 
      margin: '0 auto',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      backgroundColor: '#0a0a0a',
      minHeight: '100vh',
      color: '#e0e0e0'
    }}>
      <header style={{ marginBottom: '2rem' }}>
        <h1 style={{ color: '#fff', marginBottom: '0.5rem' }}>
          🪐 Jupiter Test Interface
        </h1>
        <p style={{ color: '#888', fontSize: '0.9rem' }}>
          Dev-only • No wallets • No execution • Read-only quote inspection
        </p>
        <div style={{ 
          marginTop: '1rem', 
          padding: '0.75rem', 
          backgroundColor: '#1a1a2e', 
          borderRadius: '8px',
          border: '1px solid #333'
        }}>
          <strong style={{ color: '#ffd700' }}>⚠️ API Key Required:</strong>
          <span style={{ marginLeft: '0.5rem', color: '#aaa' }}>
            Set <code style={{ backgroundColor: '#333', padding: '2px 6px', borderRadius: '3px' }}>JUPITER_API_KEY</code> in <code style={{ backgroundColor: '#333', padding: '2px 6px', borderRadius: '3px' }}>.env.local</code>
          </span>
        </div>
      </header>

      {/* Form Section */}
      <section style={{ 
        backgroundColor: '#111', 
        padding: '1.5rem', 
        borderRadius: '12px',
        border: '1px solid #333',
        marginBottom: '2rem'
      }}>
        <h2 style={{ color: '#fff', marginBottom: '1rem', fontSize: '1.2rem' }}>
          Swap Parameters
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
          {/* Input Mint */}
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#aaa', fontSize: '0.85rem' }}>
              Input Mint
            </label>
            <select 
              value={inputMint} 
              onChange={(e) => setInputMint(e.target.value)}
              style={selectStyle}
            >
              {Object.entries(COMMON_MINTS).map(([name, mint]) => (
                <option key={mint} value={mint}>{name}</option>
              ))}
            </select>
            <input
              type="text"
              value={inputMint}
              onChange={(e) => setInputMint(e.target.value)}
              placeholder="Or enter custom mint..."
              style={{ ...inputStyle, marginTop: '0.5rem' }}
            />
          </div>

          {/* Output Mint */}
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#aaa', fontSize: '0.85rem' }}>
              Output Mint
            </label>
            <select 
              value={outputMint} 
              onChange={(e) => setOutputMint(e.target.value)}
              style={selectStyle}
            >
              {Object.entries(COMMON_MINTS).map(([name, mint]) => (
                <option key={mint} value={mint}>{name}</option>
              ))}
            </select>
            <input
              type="text"
              value={outputMint}
              onChange={(e) => setOutputMint(e.target.value)}
              placeholder="Or enter custom mint..."
              style={{ ...inputStyle, marginTop: '0.5rem' }}
            />
          </div>

          {/* Amount */}
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#aaa', fontSize: '0.85rem' }}>
              Amount (raw, before decimals)
            </label>
            <input
              type="text"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 1000000000 for 1 SOL"
              style={inputStyle}
            />
            <p style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.25rem' }}>
              1 SOL = 1,000,000,000 lamports
            </p>
          </div>

          {/* Slippage */}
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#aaa', fontSize: '0.85rem' }}>
              Slippage (BPS)
            </label>
            <input
              type="text"
              value={slippageBps}
              onChange={(e) => setSlippageBps(e.target.value)}
              placeholder="e.g. 50 = 0.5%"
              style={inputStyle}
            />
            <p style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.25rem' }}>
              100 BPS = 1%
            </p>
          </div>
        </div>

        <button
          onClick={fetchQuote}
          disabled={loading}
          style={{
            ...buttonStyle,
            backgroundColor: loading ? '#333' : '#4CAF50',
            marginTop: '1.5rem',
          }}
        >
          {loading ? 'Loading...' : '1. Get Quote'}
        </button>
      </section>

      {/* Quote Response */}
      {quoteResponse && (
        <section style={{ 
          backgroundColor: '#111', 
          padding: '1.5rem', 
          borderRadius: '12px',
          border: '1px solid #2a5a2a',
          marginBottom: '2rem'
        }}>
          <h2 style={{ color: '#4CAF50', marginBottom: '1rem', fontSize: '1.2rem' }}>
            ✅ Quote Response
          </h2>

          {quoteResponse.summary && (
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
              gap: '1rem',
              marginBottom: '1rem'
            }}>
              <InfoCard label="In Amount" value={quoteResponse.summary.inAmount} />
              <InfoCard label="Out Amount" value={quoteResponse.summary.outAmount} />
              <InfoCard label="Price Impact" value={`${quoteResponse.summary.priceImpactPct}%`} />
              <InfoCard label="Route Steps" value={String(quoteResponse.summary.routeSteps)} />
            </div>
          )}

          {/* Route Plan */}
          {quoteResponse.quote?.routePlan && (
            <div style={{ marginBottom: '1rem' }}>
              <h3 style={{ color: '#aaa', fontSize: '0.9rem', marginBottom: '0.5rem' }}>Route Plan</h3>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {quoteResponse.quote.routePlan.map((step, i) => (
                  <div key={i} style={{ 
                    backgroundColor: '#1a1a2e', 
                    padding: '0.5rem 1rem', 
                    borderRadius: '6px',
                    fontSize: '0.85rem'
                  }}>
                    <strong>{step.swapInfo.label}</strong> ({step.percent}%)
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Swap Instructions Section */}
          <div style={{ 
            marginTop: '1.5rem', 
            padding: '1rem', 
            backgroundColor: '#0a0a0a', 
            borderRadius: '8px' 
          }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#aaa', fontSize: '0.85rem' }}>
              Authority Public Key (TraderState PDA placeholder)
            </label>
            <input
              type="text"
              value={authorityPublicKey}
              onChange={(e) => setAuthorityPublicKey(e.target.value)}
              placeholder="Enter TraderState PDA address..."
              style={{ ...inputStyle, marginBottom: '1rem' }}
            />
            <p style={{ fontSize: '0.75rem', color: '#888', marginBottom: '1rem' }}>
              ℹ️ This is the <code>userPublicKey</code> in Jupiter&apos;s API — for StellAlpha, this maps to the TraderState PDA which signs via <code>invoke_signed</code>.
            </p>
            <button
              onClick={fetchSwapInstructions}
              disabled={loading || !authorityPublicKey}
              style={{
                ...buttonStyle,
                backgroundColor: loading || !authorityPublicKey ? '#333' : '#2196F3',
              }}
            >
              {loading ? 'Loading...' : '2. Get Swap Instructions'}
            </button>
          </div>

          {/* Raw Quote JSON */}
          <details style={{ marginTop: '1rem' }}>
            <summary style={{ cursor: 'pointer', color: '#888' }}>Raw Quote JSON</summary>
            <pre style={preStyle}>
              {JSON.stringify(quoteResponse.quote, null, 2)}
            </pre>
          </details>
        </section>
      )}

      {/* Swap Instructions Response */}
      {swapInstructionsResponse && (
        <section style={{ 
          backgroundColor: '#111', 
          padding: '1.5rem', 
          borderRadius: '12px',
          border: '1px solid #1e4a7c',
          marginBottom: '2rem'
        }}>
          <h2 style={{ color: '#2196F3', marginBottom: '1rem', fontSize: '1.2rem' }}>
            🔧 Swap Instructions
          </h2>

          {swapInstructionsResponse.summary && (
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', 
              gap: '1rem',
              marginBottom: '1.5rem'
            }}>
              <InfoCard label="Program ID" value={swapInstructionsResponse.summary.programId.slice(0, 8) + '...'} />
              <InfoCard label="Total Accounts" value={String(swapInstructionsResponse.summary.totalAccounts)} />
              <InfoCard label="Signers" value={String(swapInstructionsResponse.summary.signerCount)} />
              <InfoCard label="Writable" value={String(swapInstructionsResponse.summary.writableCount)} />
              <InfoCard label="Lookup Tables" value={String(swapInstructionsResponse.summary.lookupTableCount)} />
            </div>
          )}

          {/* Signers List */}
          {swapInstructionsResponse.summary?.signers && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ color: '#ff9800', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                🔐 Required Signers
              </h3>
              {swapInstructionsResponse.summary.signers.map((signer, i) => (
                <div key={i} style={{ 
                  backgroundColor: '#1a1a2e', 
                  padding: '0.75rem', 
                  borderRadius: '6px',
                  marginBottom: '0.5rem',
                  fontFamily: 'monospace',
                  fontSize: '0.8rem'
                }}>
                  <div style={{ color: '#fff' }}>{signer.pubkey}</div>
                  <div style={{ color: '#ff9800', fontSize: '0.75rem' }}>{signer.role}</div>
                </div>
              ))}
            </div>
          )}

          {/* Accounts Table */}
          <div style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ color: '#aaa', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
              Account Metas (with Signer/Writable flags)
            </h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ backgroundColor: '#1a1a2e' }}>
                    <th style={thStyle}>#</th>
                    <th style={thStyle}>Pubkey</th>
                    <th style={thStyle}>Signer</th>
                    <th style={thStyle}>Writable</th>
                    <th style={thStyle}>Role</th>
                  </tr>
                </thead>
                <tbody>
                  {swapInstructionsResponse.swapInstruction?.accounts.map((acc) => (
                    <tr key={acc.index} style={{ borderBottom: '1px solid #333' }}>
                      <td style={tdStyle}>{acc.index}</td>
                      <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '0.75rem' }}>
                        {acc.pubkey.slice(0, 12)}...{acc.pubkey.slice(-8)}
                      </td>
                      <td style={tdStyle}>
                        <span style={{ 
                          color: acc.isSigner ? '#4CAF50' : '#666',
                          fontWeight: acc.isSigner ? 'bold' : 'normal'
                        }}>
                          {acc.isSigner ? '✓ YES' : 'no'}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <span style={{ 
                          color: acc.isWritable ? '#ff9800' : '#666',
                          fontWeight: acc.isWritable ? 'bold' : 'normal'
                        }}>
                          {acc.isWritable ? '✓ YES' : 'no'}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, color: '#888' }}>{acc.role}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Instruction Data */}
          <div style={{ marginBottom: '1rem' }}>
            <h3 style={{ color: '#aaa', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
              Instruction Data (Base64)
            </h3>
            <pre style={{ 
              ...preStyle, 
              wordBreak: 'break-all', 
              whiteSpace: 'pre-wrap' 
            }}>
              {swapInstructionsResponse.swapInstruction?.data}
            </pre>
            <p style={{ fontSize: '0.75rem', color: '#666' }}>
              Length: {swapInstructionsResponse.swapInstruction?.dataLength} bytes
            </p>
          </div>

          {/* Address Lookup Tables */}
          {swapInstructionsResponse.addressLookupTableAddresses && 
           swapInstructionsResponse.addressLookupTableAddresses.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <h3 style={{ color: '#aaa', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                Address Lookup Tables
              </h3>
              {swapInstructionsResponse.addressLookupTableAddresses.map((addr, i) => (
                <div key={i} style={{ 
                  fontFamily: 'monospace', 
                  fontSize: '0.8rem', 
                  color: '#888',
                  marginBottom: '0.25rem'
                }}>
                  {addr}
                </div>
              ))}
            </div>
          )}

          {/* Raw JSON */}
          <details>
            <summary style={{ cursor: 'pointer', color: '#888' }}>Raw Response JSON</summary>
            <pre style={preStyle}>
              {JSON.stringify(swapInstructionsResponse.raw, null, 2)}
            </pre>
          </details>
        </section>
      )}

      {/* Error Display */}
      {error && (
        <div style={{ 
          padding: '1rem', 
          backgroundColor: '#2a1a1a', 
          border: '1px solid #5a2a2a',
          borderRadius: '8px',
          color: '#ff6b6b',
          marginBottom: '2rem'
        }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Footer */}
      <footer style={{ 
        marginTop: '3rem', 
        padding: '1rem', 
        backgroundColor: '#111', 
        borderRadius: '8px',
        fontSize: '0.8rem',
        color: '#666'
      }}>
        <h3 style={{ color: '#888', marginBottom: '0.5rem' }}>StellAlpha Integration Notes</h3>
        <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
          <li><code>userPublicKey</code> → <code>authorityPublicKey</code> = TraderState PDA</li>
          <li>TraderState PDA signs via <code>invoke_signed</code> in <code>execute_trader_swap</code></li>
          <li><code>swapInstruction.accounts</code> becomes <code>remaining_accounts</code> in CPI</li>
          <li><code>swapInstruction.data</code> passed directly to Jupiter program</li>
        </ul>
      </footer>
    </div>
  );
}

// Styles
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.75rem',
  borderRadius: '6px',
  border: '1px solid #333',
  backgroundColor: '#0a0a0a',
  color: '#fff',
  fontSize: '0.9rem',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
};

const buttonStyle: React.CSSProperties = {
  padding: '0.75rem 1.5rem',
  borderRadius: '8px',
  border: 'none',
  color: '#fff',
  fontSize: '1rem',
  cursor: 'pointer',
  fontWeight: 'bold',
};

const preStyle: React.CSSProperties = {
  backgroundColor: '#0a0a0a',
  padding: '1rem',
  borderRadius: '6px',
  overflow: 'auto',
  maxHeight: '300px',
  fontSize: '0.75rem',
  color: '#aaa',
};

const thStyle: React.CSSProperties = {
  padding: '0.75rem',
  textAlign: 'left',
  color: '#aaa',
};

const tdStyle: React.CSSProperties = {
  padding: '0.75rem',
  textAlign: 'left',
};

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ 
      backgroundColor: '#1a1a2e', 
      padding: '1rem', 
      borderRadius: '8px' 
    }}>
      <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: '0.25rem' }}>{label}</div>
      <div style={{ fontSize: '1rem', color: '#fff', fontWeight: 'bold' }}>{value}</div>
    </div>
  );
}
