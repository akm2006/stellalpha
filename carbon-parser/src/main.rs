use anyhow::Result;
use clap::{Parser, Subcommand};
use std::path::PathBuf;

mod carbon_decoders;
mod carbon_registry;
mod constants;
mod domain;
mod envelope;
mod fixtures;
mod parser;
mod replay;
mod serialized;
mod stream;

use crate::replay::{inspect_signature, run_replay};

#[derive(Debug, Parser)]
#[command(author, version, about = "Offline replay harness for the Stellalpha Carbon parser")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Debug, Subcommand)]
enum Commands {
    Replay {
        #[arg(long)]
        raw_captures: PathBuf,
        #[arg(long)]
        truth: PathBuf,
        #[arg(long)]
        output: Option<PathBuf>,
    },
    Inspect {
        #[arg(long)]
        raw_captures: PathBuf,
        #[arg(long)]
        truth: PathBuf,
        #[arg(long)]
        signature: String,
    },
    Stream,
}

fn main() -> Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Commands::Replay {
            raw_captures,
            truth,
            output,
        } => {
            let report = run_replay(&raw_captures, &truth, output.as_deref())?;
            println!("{}", serde_json::to_string_pretty(&report.summary)?);
        }
        Commands::Inspect {
            raw_captures,
            truth,
            signature,
        } => {
            let report = inspect_signature(&raw_captures, &truth, &signature)?;
            println!("{}", serde_json::to_string_pretty(&report)?);
        }
        Commands::Stream => {
            stream::run_stream()?;
        }
    }

    Ok(())
}
