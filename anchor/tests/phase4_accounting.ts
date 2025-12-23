import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { StellalphaVault } from "../target/types/stellalpha_vault";
import { assert } from "chai";
import { 
  createMint, 
  createAccount, 
  mintTo, 
  getAccount, 
  TOKEN_PROGRAM_ID, 
  ASSOCIATED_TOKEN_PROGRAM_ID, 
  getAssociatedTokenAddressSync
} from "@solana/spl-token";
import * as fs from "fs";
import * as os from "os";

describe("Phase 4: TraderState Accounting", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.StellalphaVault as Program<StellalphaVault>;

  const walletPath = os.homedir() + "/.config/solana/devnet-wallet.json";
  const rawKey = JSON.parse(fs.readFileSync(walletPath, "utf-8"));
  const payer = anchor.web3.Keypair.fromSecretKey(Uint8Array.from(rawKey));

  const vaultOwner = anchor.web3.Keypair.generate();
  const trader = anchor.web3.Keypair.generate(); 
  
  let baseMint: anchor.web3.PublicKey;
  let quoteMint: anchor.web3.PublicKey; // Secondary token for swap testing
  let ownerTokenAccount: anchor.web3.PublicKey; 
  let vaultPda: anchor.web3.PublicKey;
  let vaultTokenAccount: anchor.web3.PublicKey;
  let traderStatePda: anchor.web3.PublicKey;
  let traderBaseAccount: anchor.web3.PublicKey; // Input/Output (Base)
  let traderQuoteAccount: anchor.web3.PublicKey; // Output/Input (Quote)

  const FUNDING_AMOUNT = new anchor.BN(1_000_000); 
  const SWAP_AMOUNT_IN = new anchor.BN(500_000);   
  const MIN_AMOUNT_OUT_QUOTE = new anchor.BN(400_000);   
  const MEMO_PROGRAM_ID = new anchor.web3.PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcQb");

  before(async () => {
    console.log("Setting up Phase 4 test environment...");
    
    // Fund Vault Owner
    const transferTx = new anchor.web3.Transaction().add(
        anchor.web3.SystemProgram.transfer({
            fromPubkey: payer.publicKey,
            toPubkey: vaultOwner.publicKey,
            lamports: 100_000_000 
        })
    );
    await anchor.web3.sendAndConfirmTransaction(provider.connection, transferTx, [payer]);

    // Setup Mints
    baseMint = await createMint(provider.connection, payer, payer.publicKey, null, 6);
    // Mock: Quote Mint needs to be same as Base Mint for Memo-transfer-simulation?
    // OR if we use different mints, Memo simulation WONT transfer tokens.
    // Result: Balance checks fail if slippage > 0.
    // If we want to simulate Token -> Base swap and verify `amount_received`, we need tokens to move.
    // For Phase 3, we used "Mint In == Mint Out" check to allow Memo transfer.
    // For Phase 4, we want "Base -> Token" (Mint != Base) and "Token -> Base" (Mint == Base).
    // If output_mint == base_mint is key, then for the second test, output IS base_mint.
    // But input is NOT base mint. So Input != Output.
    // My Memo mock code only transfers if Input == Output.
    // So if I run Token -> Base, no transfer happens. `amount_received` = 0.
    // `current_value` = 0?
    // If I want to verify update, I need `amount_received` > 0.
    // Option A: Update Mock in `lib.rs` to allow cross-mint "minting" (unsafe/hard).
    // Option B: Manually fund the output account in the test BEFORE assert?
    // But `execute_trader_swap` checks balances *internally* and returns error if slippage exceeded.
    // So the `execute_trader_swap` call will fail on `SlippageExceeded` if mock doesn't move funds.
    // Unless I set `min_amount_out` to 0. 
    // And I manually fund the output account asynchronously during the CPI? Impossible.
    
    // Hack for Devnet Testing without Jupiter: 
    // We already have `input_mint == output_mint` check in `lib.rs`.
    // We can fool the "Base -> Token" check by making BOTH mints == BaseMint but calling one "Quote"?
    // If `input_mint == base_mint` (Base -> Base) -> `current_value` updates?
    // Instruction logic: `if output_mint == base_mint`.
    // Test 1: Base -> Base (simulating Base -> Token logic failure? No).
    // Test 1 Goal: Check `current_value` usage.
    // If I swap Base -> Base, output IS base. So it updates.
    // I need a case where output is NOT base.
    // Can I make `output_mint` NOT base, but somehow satisfy slippage?
    // If `output_mint` != `base_mint` and `input_mint` == `base_mint` (Base -> Quote).
    // `lib.rs` Mock won't transfer. `amount_received` = 0.
    // `min_amount_out` = 0.
    // `execute_trader_swap` succeeds (0 >= 0).
    // Check `current_value`. It should represent "Unchanged". 
    // Since `output_mint` != `base_mint` (it is Quote), logic block skipped. Correct.
    
    // Test 2: Quote -> Base.
    // `input_mint` = Quote. `output_mint` = Base.
    // Mock won't transfer. `amount_received` = 0.
    // `current_value` becomes 0.
    // This verifies the UPDATE happened (from 1,000,000 to 0).
    // But is strictly 0 indistinguishable from "Not Updated" if we don't know start?
    // Start is 1,000,000. So 0 is a change.
    // So testing with 0 is valid to prove the logic branch executed.
    
    // Quote Mint (Real distinct mint)
    quoteMint = await createMint(provider.connection, payer, payer.publicKey, null, 6);

    ownerTokenAccount = await createAccount(provider.connection, payer, baseMint, payer.publicKey);
    await mintTo(provider.connection, payer, baseMint, ownerTokenAccount, payer.publicKey, 10_000_000);

    // Initialize Config & Vault
     // 2. Initialize Global Config (if needed)
    const [globalConfigPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("global_config")],
      program.programId
    );
    try {
        await program.methods
          .initializeGlobalConfig()
          .accounts({
            globalConfig: globalConfigPda,
            admin: payer.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([payer]) 
          .rpc();
    } catch (e) {}

    [vaultPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("user_vault_v1"), vaultOwner.publicKey.toBuffer()],
        program.programId
    );
    await program.methods.initializeVault(vaultOwner.publicKey, baseMint)
        .accounts({ vault: vaultPda, owner: vaultOwner.publicKey, systemProgram: anchor.web3.SystemProgram.programId })
        .signers([vaultOwner]).rpc();

    vaultTokenAccount = getAssociatedTokenAddressSync(baseMint, vaultPda, true);
    await program.methods.initVaultAta().accounts({
        vault: vaultPda, owner: vaultOwner.publicKey, mint: baseMint,
        vaultTokenAccount: vaultTokenAccount, tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, systemProgram: anchor.web3.SystemProgram.programId
    }).signers([vaultOwner]).rpc();

    const vaultOwnerAta = await createAccount(provider.connection, payer, baseMint, vaultOwner.publicKey);
    await mintTo(provider.connection, payer, baseMint, vaultOwnerAta, payer.publicKey, 5_000_000);
    await program.methods.depositToken(new anchor.BN(5_000_000)).accounts({
        vault: vaultPda, owner: vaultOwner.publicKey, ownerTokenAccount: vaultOwnerAta,
        vaultTokenAccount: vaultTokenAccount, tokenProgram: TOKEN_PROGRAM_ID
    }).signers([vaultOwner]).rpc();

    [traderStatePda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("trader_state"), vaultOwner.publicKey.toBuffer(), trader.publicKey.toBuffer()],
        program.programId
    );
    traderBaseAccount = getAssociatedTokenAddressSync(baseMint, traderStatePda, true);
    
    // Create Quote Account for Trader
    // Provide explicit keypair to avoid createAccount defaulting to ATA logic (which fails on off-curve owner)
    const quoteAccountKeypair = anchor.web3.Keypair.generate();
    traderQuoteAccount = await createAccount(
        provider.connection, 
        payer, 
        quoteMint, 
        traderStatePda,
        quoteAccountKeypair
    );

    await program.methods.createTraderState(FUNDING_AMOUNT).accounts({
        owner: vaultOwner.publicKey, trader: trader.publicKey, vault: vaultPda,
        traderState: traderStatePda, vaultTokenAccount: vaultTokenAccount,
        traderTokenAccount: traderBaseAccount, mint: baseMint,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID
    }).signers([vaultOwner]).rpc();

    // Phase 7: Mark TraderState as initialized to satisfy invariant
    await program.methods
        .markTraderInitialized()
        .accounts({
            signer: vaultOwner.publicKey,
            vault: vaultPda,
            traderState: traderStatePda,
        })
        .signers([vaultOwner])
        .rpc();
  });

  it("Does NOT update current_value when swapping Base -> Token", async () => {
    // Initial State
    const initialAccount = await program.account.traderState.fetch(traderStatePda);
    assert.equal(initialAccount.currentValue.toString(), FUNDING_AMOUNT.toString());

    // Swap Base -> Quote
    // Output Mint = Quote != Base. Logic should SKIP update.
    // min_amount_out = 0 (Mock won't transfer).
    
    const [globalConfigPda] = anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("global_config")], program.programId);

    // Need to fund Quote account manually? No, swap creates output? No, created in before().
    // We just execute.
    
    await program.methods.executeTraderSwap(SWAP_AMOUNT_IN, new anchor.BN(0), Buffer.from("MEMO"))
        .accounts({
            authority: vaultOwner.publicKey,
            vault: vaultPda,
            traderState: traderStatePda,
            inputTokenAccount: traderBaseAccount, // Base
            outputTokenAccount: traderQuoteAccount, // Quote (Not Base)
            platformFeeAccount: ownerTokenAccount, // Admin (Base matches input)
            globalConfig: globalConfigPda,
            jupiterProgram: MEMO_PROGRAM_ID,
            tokenProgram: TOKEN_PROGRAM_ID,
            instructions: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .signers([vaultOwner])
        .rpc();

    const postAccount = await program.account.traderState.fetch(traderStatePda);
    // Should be unchanged
    assert.equal(postAccount.currentValue.toString(), FUNDING_AMOUNT.toString());
  });

  it("Updates current_value when swapping Token -> Base", async () => {
    // Swap Quote -> Base
    // First, we need Quote tokens in Input Account.
    // Mint some mock Quote tokens to traderQuoteAccount (bypass vault for test setup).
    await mintTo(provider.connection, payer, quoteMint, traderQuoteAccount, payer.publicKey, 1_000_000);

    const amountIn = new anchor.BN(100_000); // Quote
    // Fee logic: 10bps of Quote. Destination must be Admin Quote Account.
    // Setup Admin Quote Account.
    const adminQuoteAccount = await createAccount(provider.connection, payer, quoteMint, payer.publicKey);

    // Execute Swap
    // Input: Quote. Output: Base.
    // Output Mint == Base. Logic SHOULD update.
    // Mock won't transfer. `amount_received` = 0.
    // Expect `current_value` -> 0.
    
    // NOTE: `execute_trader_swap` expects `platform_fee_account` to match Input Mint.
    
    const [globalConfigPda] = anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("global_config")], program.programId);

    await program.methods.executeTraderSwap(amountIn, new anchor.BN(0), Buffer.from("MEMO"))
        .accounts({
            authority: vaultOwner.publicKey,
            vault: vaultPda,
            traderState: traderStatePda,
            inputTokenAccount: traderQuoteAccount, // Quote
            outputTokenAccount: traderBaseAccount, // Base
            platformFeeAccount: adminQuoteAccount, // match input mint
            globalConfig: globalConfigPda,
            jupiterProgram: MEMO_PROGRAM_ID,
            tokenProgram: TOKEN_PROGRAM_ID,
            instructions: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .signers([vaultOwner])
        .rpc();

    const postAccount = await program.account.traderState.fetch(traderStatePda);
    // Should be updated to 0 (amount_received)
    // Start was 1,000,000.
    assert.equal(postAccount.currentValue.toString(), "0");
  });
});
