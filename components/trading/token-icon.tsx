'use client';

import { useState } from 'react';

interface TokenIconProps {
  symbol: string;
  logoURI?: string | null;
  className?: string;
}

export function TokenIcon({ symbol, logoURI, className = 'w-7 h-7' }: TokenIconProps) {
  const [imgError, setImgError] = useState(false);

  if (logoURI && !imgError) {
    return (
      <img
        src={logoURI}
        alt={symbol}
        className={`${className} rounded-full`}
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <div
      className={`${className} flex items-center justify-center rounded-full text-xs font-bold`}
      style={{ backgroundColor: '#262626', color: '#fff' }}
    >
      {symbol?.charAt(0) || '?'}
    </div>
  );
}
