import { NextRequest, NextResponse } from 'next/server';
import { getTokensMetadata } from '@/lib/jupiter-tokens';

const MAX_TOKEN_METADATA_MINTS = 150;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mintsParam = searchParams.get('mints');
  
  if (!mintsParam) {
    return NextResponse.json({});
  }
  
  const mints = [...new Set(mintsParam.split(',').filter(m => m.length > 0))]
    .slice(0, MAX_TOKEN_METADATA_MINTS);
  
  if (mints.length === 0) {
    return NextResponse.json({});
  }
  
  try {
    const metadata = await getTokensMetadata(mints);
    return NextResponse.json(metadata, {
      headers: {
        'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
      },
    });
  } catch (error) {
    console.error('Failed to fetch token metadata:', error);
    return NextResponse.json({ error: 'Failed to fetch metadata' }, { status: 500 });
  }
}
