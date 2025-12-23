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

describe("Phase 3: Execute Trader Swap", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.StellalphaVault as Program<StellalphaVault>;

  // Main wallet (Payer / Backend Agent / Admin for GlobalConfig)
  const walletPath = os.homedir() + "/.config/solana/devnet-wallet.json";
  const rawKey = JSON.parse(fs.readFileSync(walletPath, "utf-8"));
  const payer = anchor.web3.Keypair.fromSecretKey(Uint8Array.from(rawKey));

  // Ephemeral Vault Owner (User) to ensure fresh PDA/Mint
  const vaultOwner = anchor.web3.Keypair.generate();
  const trader = anchor.web3.Keypair.generate(); 
  
  let baseMint: anchor.web3.PublicKey;
  let ownerTokenAccount: anchor.web3.PublicKey; // Payer's ATA (as platform fee dest)
  let vaultPda: anchor.web3.PublicKey;
  let vaultTokenAccount: anchor.web3.PublicKey;
  let traderStatePda: anchor.web3.PublicKey;
  let traderTokenAccount: anchor.web3.PublicKey; // Input
  let traderOutputAccount: anchor.web3.PublicKey; // Output

  const FUNDING_AMOUNT = new anchor.BN(1_000_000); 
  const SWAP_AMOUNT_IN = new anchor.BN(500_000);   
  const MIN_AMOUNT_OUT = new anchor.BN(400_000);   

  const MEMO_PROGRAM_ID = new anchor.web3.PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcQb");

  before(async () => {
    console.log("Setting up Phase 3 test environment...");
    console.log("Payer:", payer.publicKey.toString());
    console.log("Vault Owner (Ephemeral):", vaultOwner.publicKey.toString());

    // 0. Fund Vault Owner from Payer
    const transferTx = new anchor.web3.Transaction().add(
        anchor.web3.SystemProgram.transfer({
            fromPubkey: payer.publicKey,
            toPubkey: vaultOwner.publicKey,
            lamports: 100_000_000 // 0.1 SOL
        })
    );
    await anchor.web3.sendAndConfirmTransaction(provider.connection, transferTx, [payer]);
    
    // 1. Setup Base Mint and Payer Tokens
    baseMint = await createMint(
      provider.connection,
      payer, 
      payer.publicKey,
      null,
      6
    );

    ownerTokenAccount = await createAccount(
        provider.connection,
        payer, 
        baseMint,
        payer.publicKey
    );
    await mintTo(
        provider.connection,
        payer, 
        baseMint,
        ownerTokenAccount,
        payer.publicKey,
        10_000_000 
    );

    // 2. Initialize Global Config (Idempotent - usually owned by payer)
    // We assume it might be initialized. If not, initialize with Payer as Admin.
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
        console.log("Global Config Initialized");
    } catch (e) {
        // If initialized with different admin, we might fail fee checks?
        // Phase 1 test init with payer.publicKey (provider.wallet).
        // So global_config.admin SHOULD be payer.publicKey.
        // We verify this.
        const gc = await program.account.globalConfig.fetch(globalConfigPda);
        if (!gc.admin.equals(payer.publicKey)) {
            console.warn("WARNING: GlobalConfig admin mismatch. Fee tests may fail.");
            // We can't change it easily without admin key. 
            // Assume single-user Devnet environment.
        }
    }

    // 3. Initialize UserVault (Fresh Owner)
    [vaultPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("user_vault_v1"), vaultOwner.publicKey.toBuffer()],
        program.programId
    );
    await program.methods
        .initializeVault(vaultOwner.publicKey, baseMint)
        .accounts({
            vault: vaultPda,
            owner: vaultOwner.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([vaultOwner]) // Owner signs, pays (funded above)
        .rpc();
    console.log("Vault Initialized");

    // 4. Fund Vault (User funds their vault)
    // Actually in Binance model, User funds Vault, then allocates to Trader.
    // We need vaultTokenAccount.
    vaultTokenAccount = getAssociatedTokenAddressSync(baseMint, vaultPda, true);
    await program.methods.initVaultAta().accounts({
        vault: vaultPda, owner: vaultOwner.publicKey, mint: baseMint,
        vaultTokenAccount: vaultTokenAccount, tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, systemProgram: anchor.web3.SystemProgram.programId
    }).signers([vaultOwner]).rpc();
    
    // User needs tokens to fund vault? 
    // We minted to `ownerTokenAccount` (Payer). 
    // Transfer from Payer to Vault directly (Deposit).
    // Note: Deposit takes `ownerTokenAccount`. User must own it.
    // `vaultOwner` is fresh. 
    // Transfer tokens from Payer to `vaultOwner` ATA first.
    const vaultOwnerAta = await createAccount(provider.connection, payer, baseMint, vaultOwner.publicKey);
    await mintTo(provider.connection, payer, baseMint, vaultOwnerAta, payer.publicKey, 5_000_000);

    await program.methods.depositToken(new anchor.BN(5_000_000)).accounts({
        vault: vaultPda, owner: vaultOwner.publicKey, ownerTokenAccount: vaultOwnerAta,
        vaultTokenAccount: vaultTokenAccount, tokenProgram: TOKEN_PROGRAM_ID
    }).signers([vaultOwner]).rpc();

    // 5. Create TraderState
    [traderStatePda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("trader_state"), vaultOwner.publicKey.toBuffer(), trader.publicKey.toBuffer()],
        program.programId
    );
    traderTokenAccount = getAssociatedTokenAddressSync(baseMint, traderStatePda, true);
    
    traderOutputAccount = await createAccount(
        provider.connection,
        payer, // Payer pays rent
        baseMint,
        traderStatePda, // Owned by TraderState
        anchor.web3.Keypair.generate() 
    );

    // Initial funding
    await program.methods.createTraderState(FUNDING_AMOUNT).accounts({
        owner: vaultOwner.publicKey, trader: trader.publicKey, vault: vaultPda,
        traderState: traderStatePda, vaultTokenAccount: vaultTokenAccount,
        traderTokenAccount: traderTokenAccount, mint: baseMint,
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

  it("Executes Trader Swap (Happy Path)", async () => {
    // 1. Calculate Expected Fee
    // Config: 10 bps. 500,000 * 10 / 10000 = 500.
    // Swap Amount = 499,500.
    
    const [globalConfigPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("global_config")],
      program.programId
    );
    
    const balanceInBefore = (await getAccount(provider.connection, traderTokenAccount)).amount;
    const feeBalanceBefore = (await getAccount(provider.connection, ownerTokenAccount)).amount;

    await program.methods.executeTraderSwap(SWAP_AMOUNT_IN, MIN_AMOUNT_OUT, Buffer.from("MEMO"))
        .accounts({
            authority: vaultOwner.publicKey, // Vault Authority (Backend Agent)
            vault: vaultPda,
            traderState: traderStatePda,
            inputTokenAccount: traderTokenAccount,
            outputTokenAccount: traderOutputAccount,
            platformFeeAccount: ownerTokenAccount, // Admin Wallet ATA (owned by Payer)
            globalConfig: globalConfigPda,
            jupiterProgram: MEMO_PROGRAM_ID,
            tokenProgram: TOKEN_PROGRAM_ID,
            instructions: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .signers([vaultOwner]) // Authority
        .rpc();
        
    const balanceInAfter = (await getAccount(provider.connection, traderTokenAccount)).amount;
    const balanceOutAfter = (await getAccount(provider.connection, traderOutputAccount)).amount;
    const feeBalanceAfter = (await getAccount(provider.connection, ownerTokenAccount)).amount;

    // Verify Fee
    const expectedFee = BigInt(500);
    assert.equal(feeBalanceAfter - feeBalanceBefore, expectedFee, "Fee should be paid to admin");

    // Verify Swap
    const swapAmount = BigInt(SWAP_AMOUNT_IN.toString()) - expectedFee; // 499,500
    // Input account decreases by AmountIn (Fee + Swap)
    assert.equal(balanceInBefore - balanceInAfter, BigInt(SWAP_AMOUNT_IN.toString()), "Input should decrease by Amount In");
    
    // Output account increases by SwapAmount
    assert.equal(balanceOutAfter, swapAmount, "Output should receive Swap Amount (Simulated)");
  });

  it("Fails if Paused", async () => {
    await program.methods.pauseTraderState().accounts({
        owner: vaultOwner.publicKey, 
        traderState: traderStatePda
    }).signers([vaultOwner]).rpc();

    try {
        await program.methods.executeTraderSwap(SWAP_AMOUNT_IN, MIN_AMOUNT_OUT, Buffer.from("MEMO"))
        .accounts({
            authority: vaultOwner.publicKey,
            vault: vaultPda,
            traderState: traderStatePda,
            inputTokenAccount: traderTokenAccount,
            outputTokenAccount: traderOutputAccount,
            platformFeeAccount: ownerTokenAccount,
            globalConfig: anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("global_config")], program.programId)[0],
            jupiterProgram: MEMO_PROGRAM_ID,
            tokenProgram: TOKEN_PROGRAM_ID,
            instructions: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .signers([vaultOwner])
        .rpc();
        assert.fail("Should have failed");
    } catch (e) {
        assert.include(e.message, "TraderState must be active");
    }

    // Cleanup: Resume
    await program.methods.resumeTraderState().accounts({
        owner: vaultOwner.publicKey, 
        traderState: traderStatePda
    }).signers([vaultOwner]).rpc();
  });
});
