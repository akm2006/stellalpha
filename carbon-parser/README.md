# Stellalpha Carbon Parser

Self-owned Rust parser that classifies Solana DEX trades from raw Yellowstone gRPC stream data. It is the primary trade detection engine for the Stellalpha worker, replacing external API dependency (SHYFT/Helius) for real-time transaction parsing.

## What it does

Given a raw Yellowstone transaction and a tracked wallet address, the parser performs **wallet-scoped economic reconstruction** to determine:

- Whether the transaction is a **buy**, **sell**, or **no_trade** for that wallet
- The token mint, base amount (SOL/USDC), and token amount involved
- Pre/post balances for accurate PnL tracking

Classification is sub-millisecond per transaction.

## Supported DEX protocols

| Protocol | Program | Decoder |
|----------|---------|---------|
| Pump.fun | `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P` | carbon-pumpfun-decoder |
| PumpSwap | `pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA` | carbon-pump-swap-decoder |
| Jupiter | `JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4` | carbon-jupiter-swap-decoder |
| Raydium CPMM | `CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C` | carbon-raydium-cpmm-decoder |
| Orca Whirlpool | `whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc` | carbon-orca-whirlpool-decoder |
| Meteora DLMM | `LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo` | carbon-meteora-dlmm-decoder |
| Meteora DAMM v2 | `cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG` | carbon-meteora-damm-v2-decoder |
| Meteora DBC | `dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN` | carbon-meteora-dbc-decoder |

Transactions involving only infrastructure programs (System, Token, Token-2022, ATA, Compute Budget, Pump Fees) are classified as `no_trade` without external calls.

## Integration with the worker

The parser runs as a **long-lived child process** of the Node.js Yellowstone worker. Communication uses line-delimited JSON over stdin/stdout:

```
Worker (Node.js)                    Carbon Parser (Rust)
     │                                     │
     │── JSON line (stdin) ───────────────>│
     │   { signature, wallet, slot,        │
     │     transactionUpdate, ... }        │
     │                                     │── parse
     │<── JSON line (stdout) ──────────────│
     │   { status: "trade"|"no_trade"|     │
     │     "unknown", trade: {...} }       │
```

The bridge is managed by `lib/ingestion/carbon-bridge.ts`. Results flow:
- **trade** → orchestrator directly (skips SHYFT API)
- **no_trade** → cached, done
- **unknown** → falls back to SHYFT/Helius API

## Build

Requires Rust 1.82+ (pinned in `rust-toolchain.toml`).

```bash
# Production build
cargo build --release

# The binary is at target/release/stellalpha-carbon-parser
```

For Docker deployment, `Dockerfile.yellowstone` at the repo root handles the multi-stage Rust + Node.js build automatically.

## Offline corpus validation

The parser is validated against a ground truth corpus of 2537 transactions parsed by SHYFT:

```
total:          2537
exact_matches:  2537
mismatches:     0
```

Replay is run from the `experiments/yellowstone-parser/carbon-parser/` dev workspace using `.cmd` scripts that set up the MSVC toolchain on Windows.

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `CARBON_PARSER_ENABLED` | `false` | Kill switch — set to `true` to activate Carbon parsing |
| `CARBON_PARSER_BINARY` | Auto-detected | Absolute path override for the parser binary |

## Source structure

```
src/
  main.rs           CLI entry point (replay, inspect, stream modes)
  stream.rs         Runtime stdin/stdout streaming mode
  replay.rs         Offline corpus replay CLI
  parser.rs         Wallet-scoped economic reconstruction + classification
  envelope.rs       Canonical envelope builder from raw Yellowstone data
  carbon_decoders.rs  Pump.fun / PumpSwap Carbon decoder extraction
  carbon_registry.rs  Program ID → Carbon decoder mapping
  domain.rs         Core types (ParseDecision, EngineTrade, CanonicalEnvelope)
  constants.rs      SOL mint addresses, known stablecoins
  serialized.rs     Serialization helpers
  fixtures.rs       Corpus loading types
  lib.rs            Library root
```
