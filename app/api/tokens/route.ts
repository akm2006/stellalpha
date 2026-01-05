import { NextRequest, NextResponse } from 'next/server';
import { getTokensMetadata } from '@/lib/jupiter-tokens';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mints = searchParams.get('mints')?.split(',').filter(Boolean) || [];
  
  if (mints.length === 0) {
    return NextResponse.json({ error: 'No mints provided' }, { status: 400 });
  }
  
  try {
    const metadata = await getTokensMetadata(mints);
    return NextResponse.json({ tokens: metadata });
  } catch (error) {
    console.error('Error fetching token metadata:', error);
    return NextResponse.json({ error: 'Failed to fetch metadata' }, { status: 500 });
  }
}
