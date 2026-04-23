'use client';

export const SOLSCAN_LOGO_SRC = 'https://solscan.io/_next/static/media/solscan-logo-light.1410e164.svg';

interface SolscanLinkProps {
  signature: string;
  compact?: boolean;
}

export function SolscanLink({ signature, compact = false }: SolscanLinkProps) {
  return (
    <a
      href={`https://solscan.io/tx/${signature}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Open transaction on Solscan"
      title="Open on Solscan"
      className={`cyber-control inline-flex items-center justify-center border-cyan-300/35 transition hover:border-emerald-300/70 hover:bg-emerald-300/10 ${compact ? 'min-w-[30px] px-1.5 py-1' : 'min-w-[44px] px-2 py-1'}`}
    >
      <img
        src={SOLSCAN_LOGO_SRC}
        alt=""
        aria-hidden="true"
        className={compact ? 'h-3.5 w-auto max-w-[38px] object-contain' : 'h-3.5 w-auto max-w-[44px] object-contain'}
      />
      <span className="sr-only">Open on Solscan</span>
    </a>
  );
}
