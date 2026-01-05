import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseSecretKey = process.env.SUPABASE_SECRET!;

// Server-side Supabase client with admin privileges
export const supabase = createClient(supabaseUrl, supabaseSecretKey);

export default supabase;
