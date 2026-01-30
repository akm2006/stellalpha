-- Migration: Add Safe Boost columns to demo_trades
-- Run this in your Supabase SQL Editor

ALTER TABLE demo_trades 
ADD COLUMN IF NOT EXISTS boost_tier TEXT,
ADD COLUMN IF NOT EXISTS boost_multiplier NUMERIC;

COMMENT ON COLUMN demo_trades.boost_tier IS 'Safe Boost tier classification (e.g., Micro Dust, Deep Value)';
COMMENT ON COLUMN demo_trades.boost_multiplier IS 'Multiplier applied to the copy ratio (e.g., 15, 10, 5, 2, 1)';
