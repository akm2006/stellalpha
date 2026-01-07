import { NextRequest, NextResponse } from 'next/server';
import { getTokensMetadata } from '@/lib/jupiter-tokens';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mintsParam = searchParams.get('mints');
  
  if (!mintsParam) {
    return NextResponse.json({});
  }
  
  const mints = mintsParam.split(',').filter(m => m.length > 0);
  
  if (mints.length === 0) {
    return NextResponse.json({});
  }
  
  try {
    const metadata = await getTokensMetadata(mints);
    return NextResponse.json(metadata);
  } catch (error) {
    console.error('Failed to fetch token metadata:', error);
    return NextResponse.json({ error: 'Failed to fetch metadata' }, { status: 500 });
  }
}
