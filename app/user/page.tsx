'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  createAssociatedTokenAccountInstruction,
  createSyncNativeInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import bs58 from 'bs58';

/**
 * User Test Console
 * 
 * Browser-generated keypair for testing on forked mainnet localnet.
 * 
 * ⚠️ LOCALNET TEST WALLET — DO NOT USE ON MAINNET
 */

const RPC_URL = 'http://127.0.0.1:8899';
const SOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const STELLALPHA_PROGRAM_ID = new PublicKey('64XogE2RvY7g4fDp8XxWZxFTycANjDK37n88GZizm5nx');

interface VaultInfo {
  address: string;
  balances: {
    sol: { formatted: string };
    usdc: { formatted: string };
  };
}

interface TraderInfo {
  address: string;
  isInitialized: boolean;
  isPaused: boolean;
  balances: {
    input: { formatted: string; symbol: string };
    output: { formatted: string; symbol: string };
  };
}

export default function UserPage() {
  // Wallet state
  const [keypair, setKeypair] = useState<Keypair | null>(null);
  const [solBalance, setSolBalance] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>('');

  // Vault state
  const [vault, setVault] = useState<VaultInfo | null>(null);
  const [fundAmount, setFundAmount] = useState('1');

  // Trader state
  const [traders, setTraders] = useState<TraderInfo[]>([]);
  const [allocAmount, setAllocAmount] = useState('0.5');

  // Connection
  const connection = new Connection(RPC_URL, 'confirmed');

  // Load or generate keypair from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('stellalpha_test_wallet');
    if (stored) {
      try {
        const secretKey = bs58.decode(stored);
        setKeypair(Keypair.fromSecretKey(secretKey));
      } catch {
        localStorage.removeItem('stellalpha_test_wallet');
      }
    }
  }, []);

  // Fetch balances
  const fetchBalances = useCallback(async () => {
    if (!keypair) return;
    try {
      const balance = await connection.getBalance(keypair.publicKey);
      setSolBalance(balance / LAMPORTS_PER_SOL);
    } catch (e) {
      console.error('Failed to fetch balance:', e);
    }
  }, [keypair]);

  const fetchVault = useCallback(async () => {
    if (!keypair) return;
    try {
      const [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('user_vault_v1'), keypair.publicKey.toBuffer()],
        STELLALPHA_PROGRAM_ID
      );
      
      const res = await fetch('/api/vault/list');
      const data = await res.json();
      const found = data.vaults?.find((v: any) => v.owner === keypair.publicKey.toBase58());
      
      if (found) {
        setVault(found);
        // Fetch traders
        const tradersRes = await fetch(`/api/trader/list-by-vault?vault=${found.address}`);
        const tradersData = await tradersRes.json();
        setTraders(tradersData.traders || []);
      } else {
        setVault(null);
        setTraders([]);
      }
    } catch (e) {
      console.error('Failed to fetch vault:', e);
    }
  }, [keypair]);

  useEffect(() => {
    if (keypair) {
      fetchBalances();
      fetchVault();
      const interval = setInterval(() => {
        fetchBalances();
        fetchVault();
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [keypair, fetchBalances, fetchVault]);

  // Generate new wallet
  const generateWallet = () => {
    const newKeypair = Keypair.generate();
    localStorage.setItem('stellalpha_test_wallet', bs58.encode(newKeypair.secretKey));
    setKeypair(newKeypair);
    setStatus('New wallet generated');
  };

  // Clear wallet
  const clearWallet = () => {
    localStorage.removeItem('stellalpha_test_wallet');
    setKeypair(null);
    setVault(null);
    setTraders([]);
    setStatus('Wallet cleared');
  };

  // Create vault (USER SIGNS)
  const createVault = async () => {
    if (!keypair) return;
    setLoading(true);
    setStatus('Creating vault (user signs)...');
    try {
      // Get unsigned transaction from API
      const res = await fetch('/api/vault/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerPubkey: keypair.publicKey.toBase58() }),
      });
      const data = await res.json();
      
      if (data.alreadyExists) {
        setStatus(`✅ Vault exists: ${data.vault.slice(0, 12)}...`);
        await fetchVault();
        setLoading(false);
        return;
      }
      
      if (!data.success || !data.transaction) {
        setStatus(`❌ ${data.error || 'Failed to build transaction'}`);
        setLoading(false);
        return;
      }
      
      // Deserialize, sign, and send
      const txBuffer = Buffer.from(data.transaction, 'base64');
      const tx = Transaction.from(txBuffer);
      tx.sign(keypair);
      
      const sig = await connection.sendRawTransaction(tx.serialize());
      await connection.confirmTransaction(sig, 'confirmed');
      
      setStatus(`✅ Vault created (user-signed): ${sig.slice(0, 12)}...`);
      await fetchVault();
    } catch (e: any) {
      setStatus(`❌ ${e.message}`);
    }
    setLoading(false);
  };

  // Fund vault (CLIENT-SIDE SIGNING - no backend API)
  const fundVault = async () => {
    if (!keypair || !vault) return;
    setLoading(true);
    setStatus('Funding vault (client-side signing)...');
    
    try {
      const amount = parseFloat(fundAmount);
      const lamports = Math.floor(amount * LAMPORTS_PER_SOL);
      
      // Get vault SOL ATA
      const vaultPda = new PublicKey(vault.address);
      const vaultSolAta = getAssociatedTokenAddressSync(SOL_MINT, vaultPda, true);
      
      // Create owner WSOL ATA if needed
      const ownerSolAta = getAssociatedTokenAddressSync(SOL_MINT, keypair.publicKey);
      const ownerAtaInfo = await connection.getAccountInfo(ownerSolAta);
      
      const tx = new Transaction();
      
      if (!ownerAtaInfo) {
        tx.add(
          createAssociatedTokenAccountInstruction(
            keypair.publicKey,
            ownerSolAta,
            keypair.publicKey,
            SOL_MINT
          )
        );
      }
      
      // Transfer SOL to owner ATA and sync (wrap)
      tx.add(
        SystemProgram.transfer({
          fromPubkey: keypair.publicKey,
          toPubkey: ownerSolAta,
          lamports,
        }),
        createSyncNativeInstruction(ownerSolAta)
      );
      
      // Transfer wrapped SOL to vault ATA
      // Note: Need to create vault ATA first if doesn't exist
      const vaultAtaInfo = await connection.getAccountInfo(vaultSolAta);
      if (!vaultAtaInfo) {
        tx.add(
          createAssociatedTokenAccountInstruction(
            keypair.publicKey,
            vaultSolAta,
            vaultPda,
            SOL_MINT
          )
        );
      }
      
      // Direct token transfer (user signs)
      tx.add({
        keys: [
          { pubkey: ownerSolAta, isSigner: false, isWritable: true },
          { pubkey: vaultSolAta, isSigner: false, isWritable: true },
          { pubkey: keypair.publicKey, isSigner: true, isWritable: false },
        ],
        programId: TOKEN_PROGRAM_ID,
        data: Buffer.from([3, ...new Uint8Array(new BigUint64Array([BigInt(lamports)]).buffer)]),
      });
      
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = keypair.publicKey;
      tx.sign(keypair);
      
      const sig = await connection.sendRawTransaction(tx.serialize());
      await connection.confirmTransaction(sig);
      
      setStatus(`✅ Funded ${amount} SOL (client-signed: ${sig.slice(0, 12)}...)`);
      await fetchBalances();
      await fetchVault();
    } catch (e: any) {
      setStatus(`❌ ${e.message}`);
    }
    setLoading(false);
  };

  // Create trader (USER SIGNS as vault owner)
  const createTrader = async () => {
    if (!keypair || !vault) return;
    setLoading(true);
    setStatus('Creating trader (user signs)...');
    try {
      // Get unsigned transaction from API
      const res = await fetch('/api/trader/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerPubkey: keypair.publicKey.toBase58(),
          allocationSol: parseFloat(allocAmount),
        }),
      });
      const data = await res.json();
      
      if (!data.success || !data.transaction) {
        setStatus(`❌ ${data.error || 'Failed to build transaction'}`);
        setLoading(false);
        return;
      }
      
      // Deserialize, sign, and send
      const txBuffer = Buffer.from(data.transaction, 'base64');
      const tx = Transaction.from(txBuffer);
      tx.sign(keypair);
      
      const sig = await connection.sendRawTransaction(tx.serialize());
      await connection.confirmTransaction(sig, 'confirmed');
      
      setStatus(`✅ Trader created (user-signed): ${sig.slice(0, 12)}...`);
      await fetchVault();
    } catch (e: any) {
      setStatus(`❌ ${e.message}`);
    }
    setLoading(false);
  };

  // Mark trader initialized (BACKEND SIGNS as authority)
  const markInitialized = async (traderAddress: string) => {
    if (!keypair) return;
    setLoading(true);
    setStatus('Marking trader initialized (backend signs)...');
    try {
      const res = await fetch('/api/trader/mark-initialized', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          traderStatePubkey: traderAddress,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setStatus(`✅ Trader initialized (backend-signed): ${traderAddress.slice(0, 12)}...`);
        await fetchVault();
      } else {
        setStatus(`❌ ${data.error}`);
      }
    } catch (e: any) {
      setStatus(`❌ ${e.message}`);
    }
    setLoading(false);
  };

  return (
    <div style={{
      padding: '2rem',
      maxWidth: '900px',
      margin: '0 auto',
      fontFamily: 'system-ui, sans-serif',
      backgroundColor: '#0a0a0a',
      minHeight: '100vh',
      color: '#e0e0e0',
    }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ color: '#fff', marginBottom: '0.5rem' }}>
          👤 User Test Console
        </h1>
        <div style={{
          padding: '0.75rem',
          backgroundColor: '#2a1a1a',
          border: '1px solid #5a2a2a',
          borderRadius: '8px',
          color: '#ff6b6b',
          fontSize: '0.85rem',
        }}>
          ⚠️ <strong>LOCALNET TEST WALLET</strong> — Keys stored in localStorage. DO NOT use on mainnet!
        </div>
      </div>

      {/* Status */}
      {status && (
        <div style={{
          padding: '0.75rem',
          backgroundColor: '#1a1a2e',
          border: '1px solid #333',
          borderRadius: '8px',
          marginBottom: '1.5rem',
          fontFamily: 'monospace',
          fontSize: '0.85rem',
        }}>
          {status}
        </div>
      )}

      {/* Wallet Panel */}
      <Section title="🔑 Test Wallet">
        {!keypair ? (
          <button onClick={generateWallet} style={buttonStyle}>
            Generate Test Wallet
          </button>
        ) : (
          <>
            <InfoRow label="Public Key" value={keypair.publicKey.toBase58()} />
            <InfoRow label="SOL Balance" value={`${solBalance.toFixed(4)} SOL`} />
            <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem' }}>
              <button onClick={generateWallet} style={buttonSecondaryStyle}>
                New Wallet
              </button>
              <button onClick={clearWallet} style={buttonDangerStyle}>
                Clear
              </button>
            </div>
          </>
        )}
      </Section>

      {/* Vault Panel */}
      {keypair && (
        <Section title="🏦 Vault Management">
          {!vault ? (
            <button onClick={createVault} style={buttonStyle} disabled={loading}>
              {loading ? 'Creating...' : 'Create Vault'}
            </button>
          ) : (
            <>
              <InfoRow label="Vault PDA" value={vault.address} />
              <InfoRow label="SOL Balance" value={`${vault.balances.sol.formatted} SOL`} />
              <InfoRow label="USDC Balance" value={`${vault.balances.usdc.formatted} USDC`} />
              
              <div style={{ marginTop: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: '#888' }}>
                  Fund Amount (SOL)
                </label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="number"
                    value={fundAmount}
                    onChange={(e) => setFundAmount(e.target.value)}
                    style={inputStyle}
                    step="0.1"
                  />
                  <button onClick={fundVault} style={buttonStyle} disabled={loading}>
                    {loading ? 'Funding...' : 'Fund Vault (User Signs)'}
                  </button>
                </div>
                <p style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.25rem' }}>
                  ✓ Client-side signing — user controls deposits
                </p>
              </div>
            </>
          )}
        </Section>
      )}

      {/* TraderState Panel */}
      {vault && (
        <Section title="📊 TraderState Management">
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#888' }}>
              Allocation Amount (SOL)
            </label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="number"
                value={allocAmount}
                onChange={(e) => setAllocAmount(e.target.value)}
                style={inputStyle}
                step="0.1"
              />
              <button onClick={createTrader} style={buttonStyle} disabled={loading}>
                {loading ? 'Creating...' : 'Create TraderState'}
              </button>
            </div>
          </div>

          {traders.length === 0 ? (
            <p style={{ color: '#666' }}>No traders yet</p>
          ) : (
            <div>
              {traders.map((t) => (
                <div key={t.address} style={{
                  padding: '1rem',
                  backgroundColor: '#111',
                  borderRadius: '8px',
                  marginBottom: '0.5rem',
                  border: t.isInitialized ? '1px solid #2a5a2a' : '1px solid #5a3a2a',
                }}>
                  <InfoRow label="TraderState" value={t.address} />
                  <InfoRow
                    label="Status"
                    value={t.isInitialized ? '✅ Initialized' : '⏳ Not initialized'}
                  />
                  <InfoRow
                    label="Input Balance"
                    value={`${t.balances.input.formatted} ${t.balances.input.symbol}`}
                  />
                  <InfoRow
                    label="Output Balance"
                    value={`${t.balances.output.formatted} ${t.balances.output.symbol}`}
                  />
                  {!t.isInitialized && (
                    <button
                      onClick={() => markInitialized(t.address)}
                      style={{ ...buttonStyle, marginTop: '0.5rem' }}
                      disabled={loading}
                    >
                      Mark Initialized
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      {/* Info Footer */}
      <div style={{
        marginTop: '2rem',
        padding: '1rem',
        backgroundColor: '#111',
        borderRadius: '8px',
        fontSize: '0.8rem',
        color: '#666',
      }}>
        <h4 style={{ color: '#888', marginBottom: '0.5rem' }}>Non-Custodial Model</h4>
        <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
          <li>Users sign <strong>vault creation</strong> and <strong>deposits</strong></li>
          <li>Users <strong>never sign swaps</strong> (backend automation)</li>
          <li>Funds in PDA, not backend wallet</li>
          <li>Backend cannot withdraw user funds</li>
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
      <h2 style={{ color: '#fff', fontSize: '1.1rem', marginBottom: '1rem' }}>{title}</h2>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginBottom: '0.5rem' }}>
      <span style={{ color: '#888', fontSize: '0.85rem' }}>{label}: </span>
      <span style={{ fontFamily: 'monospace', fontSize: '0.85rem', wordBreak: 'break-all' }}>
        {value}
      </span>
    </div>
  );
}

// Styles
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
  ...buttonStyle,
  backgroundColor: '#333',
};

const buttonDangerStyle: React.CSSProperties = {
  ...buttonStyle,
  backgroundColor: '#c62828',
};

const inputStyle: React.CSSProperties = {
  padding: '0.75rem',
  borderRadius: '6px',
  border: '1px solid #333',
  backgroundColor: '#0a0a0a',
  color: '#fff',
  width: '120px',
};
