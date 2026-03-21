-- Migration: add batched demo trade stats function
-- Run this in your Supabase SQL Editor

create or replace function public.get_demo_trade_stats(p_trader_state_ids uuid[])
returns table (
  trader_state_id uuid,
  total_count bigint,
  completed_count bigint,
  failed_count bigint,
  avg_latency_ms numeric,
  total_realized_pnl numeric,
  profitable_count bigint,
  loss_count bigint,
  profit_factor numeric
)
language sql
stable
as $$
  with filtered as (
    select
      trader_state_id,
      status,
      latency_diff_ms,
      coalesce(realized_pnl, 0)::numeric as realized_pnl
    from public.demo_trades
    where trader_state_id = any(p_trader_state_ids)
  ),
  aggregated as (
    select
      trader_state_id,
      count(*)::bigint as total_count,
      count(*) filter (where status = 'completed')::bigint as completed_count,
      count(*) filter (where status = 'failed')::bigint as failed_count,
      avg(latency_diff_ms) filter (where status = 'completed' and latency_diff_ms is not null) as avg_latency_ms,
      coalesce(sum(realized_pnl) filter (where status = 'completed'), 0)::numeric as total_realized_pnl,
      count(*) filter (where status = 'completed' and realized_pnl > 0)::bigint as profitable_count,
      count(*) filter (where status = 'completed' and realized_pnl < 0)::bigint as loss_count,
      coalesce(sum(realized_pnl) filter (where status = 'completed' and realized_pnl > 0), 0)::numeric as total_profit,
      coalesce(sum(abs(realized_pnl)) filter (where status = 'completed' and realized_pnl < 0), 0)::numeric as total_loss
    from filtered
    group by trader_state_id
  )
  select
    trader_state_id,
    total_count,
    completed_count,
    failed_count,
    coalesce(avg_latency_ms, 0)::numeric as avg_latency_ms,
    total_realized_pnl,
    profitable_count,
    loss_count,
    case
      when total_loss > 0 then total_profit / total_loss
      when total_profit > 0 then 999::numeric
      else 0::numeric
    end as profit_factor
  from aggregated;
$$;
