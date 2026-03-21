-- Migration: add star trader stats aggregation function
-- Run this in your Supabase SQL Editor

create or replace function public.get_star_trader_stats(p_wallets text[])
returns table (
  wallet text,
  total_pnl numeric,
  pnl_7d numeric,
  pnl_7d_percent numeric,
  win_rate integer,
  wins bigint,
  losses bigint,
  trades_count bigint,
  follower_count bigint,
  total_allocated numeric,
  total_volume numeric,
  profit_factor numeric,
  last_trade_time bigint
)
language sql
stable
as $$
  with wallet_list as (
    select unnest(p_wallets) as wallet
  ),
  ranked_trades as (
    select
      t.wallet,
      coalesce(t.usd_value, 0)::numeric as usd_value,
      t.realized_pnl::numeric as realized_pnl,
      t.block_timestamp,
      row_number() over (
        partition by t.wallet
        order by t.block_timestamp desc
      ) as row_num
    from public.trades t
    where t.wallet = any(p_wallets)
  ),
  limited_trades as (
    select *
    from ranked_trades
    where row_num <= 1000
  ),
  trade_agg as (
    select
      wallet,
      count(*)::bigint as trades_count,
      coalesce(sum(usd_value), 0)::numeric as total_volume,
      coalesce(sum(realized_pnl) filter (where realized_pnl is not null), 0)::numeric as total_pnl,
      coalesce(
        sum(realized_pnl) filter (
          where realized_pnl is not null
            and to_timestamp(block_timestamp) >= now() - interval '7 days'
        ),
        0
      )::numeric as pnl_7d,
      coalesce(
        sum(usd_value) filter (
          where realized_pnl is not null
            and to_timestamp(block_timestamp) >= now() - interval '7 days'
        ),
        0
      )::numeric as volume_7d,
      count(*) filter (where realized_pnl > 0)::bigint as wins,
      count(*) filter (where realized_pnl < 0)::bigint as losses,
      coalesce(sum(realized_pnl) filter (where realized_pnl > 0), 0)::numeric as total_gross_profit,
      coalesce(sum(abs(realized_pnl)) filter (where realized_pnl < 0), 0)::numeric as total_gross_loss,
      coalesce(max(block_timestamp) filter (where realized_pnl is not null), 0)::bigint * 1000 as last_trade_time
    from limited_trades
    group by wallet
  ),
  follower_agg as (
    select
      star_trader as wallet,
      count(*)::bigint as follower_count,
      coalesce(sum(allocated_usd), 0)::numeric as total_allocated
    from public.demo_trader_states
    where star_trader = any(p_wallets)
    group by star_trader
  ),
  combined as (
    select
      wl.wallet,
      coalesce(ta.total_pnl, 0)::numeric as total_pnl,
      coalesce(ta.pnl_7d, 0)::numeric as pnl_7d,
      coalesce(ta.volume_7d, 0)::numeric as volume_7d,
      coalesce(ta.wins, 0)::bigint as wins,
      coalesce(ta.losses, 0)::bigint as losses,
      coalesce(ta.trades_count, 0)::bigint as trades_count,
      coalesce(fa.follower_count, 0)::bigint as follower_count,
      coalesce(fa.total_allocated, 0)::numeric as total_allocated,
      coalesce(ta.total_volume, 0)::numeric as total_volume,
      coalesce(ta.total_gross_profit, 0)::numeric as total_gross_profit,
      coalesce(ta.total_gross_loss, 0)::numeric as total_gross_loss,
      coalesce(ta.last_trade_time, 0)::bigint as last_trade_time
    from wallet_list wl
    left join trade_agg ta on ta.wallet = wl.wallet
    left join follower_agg fa on fa.wallet = wl.wallet
  )
  select
    wallet,
    total_pnl,
    pnl_7d,
    greatest(
      -100::numeric,
      least(
        500::numeric,
        case
          when volume_7d > 0 then (pnl_7d / volume_7d) * 100
          when total_allocated > 0 then (pnl_7d / total_allocated) * 100
          else 0::numeric
        end
      )
    ) as pnl_7d_percent,
    case
      when wins + losses > 0 then round((wins::numeric / (wins + losses)::numeric) * 100)::integer
      else 0
    end as win_rate,
    wins,
    losses,
    trades_count,
    follower_count,
    total_allocated,
    total_volume,
    greatest(
      0::numeric,
      least(
        50::numeric,
        case
          when total_gross_loss > 0 then total_gross_profit / total_gross_loss
          when total_gross_profit > 0 and wins + losses > 0 then
            case
              when wins + losses < 5 then least((1 + wins + losses)::numeric, total_gross_profit / 100)
              when wins + losses < 10 then least(10::numeric, total_gross_profit / 50)
              else least(50::numeric, total_gross_profit / 10)
            end
          else 0::numeric
        end
      )
    ) as profit_factor,
    last_trade_time
  from combined;
$$;
