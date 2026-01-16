import { createClient } from '@supabase/supabase-js';

// NOTE: This client should ONLY be used in server-side API routes.
// It bypasses Row Level Security (RLS) if the Service Role Key is used.

const supabaseUrl = process.env.SUPABASE_URL!;
// Try SERVICE_ROLE_KEY first (standard), fall back to SECRET (legacy in this project)
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET!;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase URL or Service Role Key');
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
