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
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";

import * as fs from "fs";
import * as os from "os";

describe("Phase 2B: TraderState Lifecycle", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.StellalphaVault as Program<StellalphaVault>;

  // Load wallet explicitly (Payer for transaction fees)
  const walletPath = os.homedir() + "/.config/solana/devnet-wallet.json";
  const rawKey = JSON.parse(fs.readFileSync(walletPath, "utf-8"));
  const payer = anchor.web3.Keypair.fromSecretKey(Uint8Array.from(rawKey));

  // Ephemeral Vault Owner to avoid stale Devnet state collisions
  const vaultOwner = anchor.web3.Keypair.generate();
  const trader = anchor.web3.Keypair.generate(); 
  
  let baseMint: anchor.web3.PublicKey;
  let ownerTokenAccount: anchor.web3.PublicKey;
  let vaultPda: anchor.web3.PublicKey;
  let vaultTokenAccount: anchor.web3.PublicKey;
  let traderStatePda: anchor.web3.PublicKey;
  let traderTokenAccount: anchor.web3.PublicKey;

  const FUNDING_AMOUNT = new anchor.BN(1_000_000); // 1.0 USDC


  before(async () => {
    console.log("Starting setup...");
    console.log("Vault Owner (Ephemeral):", vaultOwner.publicKey.toBase58());

    // 0. Fund Vault Owner from Payer
    const transferTx = new anchor.web3.Transaction().add(
        anchor.web3.SystemProgram.transfer({
            fromPubkey: payer.publicKey,
            toPubkey: vaultOwner.publicKey,
            lamports: 100_000_000 // 0.1 SOL
        })
    );
    await anchor.web3.sendAndConfirmTransaction(provider.connection, transferTx, [payer]);

    // 1. Setup Base Mint and Owner Tokens
    console.log("Creating Mint...");
    baseMint = await createMint(
      provider.connection,
      payer, // Payer pays
      payer.publicKey,
      null,
      6
    );
    console.log("Mint created:", baseMint.toString());

    console.log("Creating Token Account...");
    ownerTokenAccount = await createAccount(
        provider.connection,
        payer, // Payer pays
        baseMint,
        vaultOwner.publicKey // Owner owns
    );
    console.log("Token Account created:", ownerTokenAccount.toString());

    console.log("Minting tokens...");
    await mintTo(
        provider.connection,
        payer, // Payer authority
        baseMint,
        ownerTokenAccount,
        payer.publicKey,
        10_000_000 // 10 USDC
    );
    console.log("Tokens minted.");

    // 2. Initialize UserVault
    [vaultPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("user_vault_v1"), vaultOwner.publicKey.toBuffer()],
        program.programId
    );
    console.log("Initializing Vault...");
    await program.methods
        .initializeVault(vaultOwner.publicKey, baseMint)
        .accounts({
            vault: vaultPda,
            owner: vaultOwner.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([vaultOwner])
        .rpc();
    console.log("Vault initialized.");

    // 3. Create Vault ATA and Fund it
    console.log("Creating Vault ATA...");
    vaultTokenAccount = getAssociatedTokenAddressSync(
        baseMint,
        vaultPda,
        true // allowOwnerOffCurve
    );
    await program.methods
        .initVaultAta()
        .accounts({
            vault: vaultPda,
            owner: vaultOwner.publicKey,
            mint: baseMint,
            vaultTokenAccount: vaultTokenAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([vaultOwner])
        .rpc();
        
    console.log("Funding Vault...");
    await program.methods
        .depositToken(new anchor.BN(5_000_000))
        .accounts({
            vault: vaultPda,
            owner: vaultOwner.publicKey,
            ownerTokenAccount: ownerTokenAccount,
            vaultTokenAccount: vaultTokenAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([vaultOwner])
        .rpc();
    console.log("Vault funded.");
  });


  it("Creates TraderState and Funds it", async () => {
    [traderStatePda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("trader_state"), vaultOwner.publicKey.toBuffer(), trader.publicKey.toBuffer()],
        program.programId
    );
    
    traderTokenAccount = getAssociatedTokenAddressSync(
        baseMint,
        traderStatePda,
        true
    );

    const vaultBalanceBefore = (await getAccount(provider.connection, vaultTokenAccount)).amount;

    await program.methods
        .createTraderState(FUNDING_AMOUNT)
        .accounts({
            owner: vaultOwner.publicKey,
            trader: trader.publicKey,
            vault: vaultPda,
            traderState: traderStatePda,
            vaultTokenAccount: vaultTokenAccount,
            traderTokenAccount: traderTokenAccount, // Init in instruction
            mint: baseMint,
            systemProgram: anchor.web3.SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([vaultOwner])
        .rpc();

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

    // Verify State
    const account = await program.account.traderState.fetch(traderStatePda);
    assert.ok(account.currentValue.eq(FUNDING_AMOUNT));
    assert.ok(account.highWaterMark.eq(FUNDING_AMOUNT));
    assert.ok(account.isPaused === false);
    assert.ok(account.isInitialized === true); // Phase 7: Verify initialized
    assert.ok(account.owner.equals(vaultOwner.publicKey));
    assert.ok(account.trader.equals(trader.publicKey));

    // Verify Balances
    const traderBalance = (await getAccount(provider.connection, traderTokenAccount)).amount;
    const vaultBalanceAfter = (await getAccount(provider.connection, vaultTokenAccount)).amount;

    assert.equal(traderBalance.toString(), FUNDING_AMOUNT.toString());
    assert.equal(vaultBalanceAfter.toString(), (vaultBalanceBefore - BigInt(FUNDING_AMOUNT.toString())).toString());
  });

  it("Pauses and Resumes TraderState", async () => {
    await program.methods
        .pauseTraderState()
        .accounts({
            owner: vaultOwner.publicKey,
            traderState: traderStatePda,
        })
        .signers([vaultOwner])
        .rpc();
    
    let account = await program.account.traderState.fetch(traderStatePda);
    assert.ok(account.isPaused === true);

    await program.methods
        .resumeTraderState()
        .accounts({
            owner: vaultOwner.publicKey,
            traderState: traderStatePda,
        })
        .signers([vaultOwner])
        .rpc();
    
    account = await program.account.traderState.fetch(traderStatePda);
    assert.ok(account.isPaused === false);
  });

  it("Fails to Close if Not Paused", async () => {
    try {
        await program.methods
            .closeTraderState()
            .accounts({
                owner: vaultOwner.publicKey,
                traderState: traderStatePda,
                vault: vaultPda,
                traderTokenAccount: traderTokenAccount,
                vaultTokenAccount: vaultTokenAccount,
                tokenProgram: TOKEN_PROGRAM_ID,
            })
            .signers([vaultOwner])
            .rpc();
        assert.fail("Should have failed");
    } catch (e) {
        assert.include(e.message, "TraderState must be paused");
    }
  });

  it("Closes TraderState and Refunds", async () => {
    // 1. Pause first
    await program.methods.pauseTraderState().accounts({ owner: vaultOwner.publicKey, traderState: traderStatePda }).signers([vaultOwner]).rpc();

    const vaultBalanceBefore = (await getAccount(provider.connection, vaultTokenAccount)).amount;

    // 2. Close
    await program.methods
        .closeTraderState()
        .accounts({
            owner: vaultOwner.publicKey,
            traderState: traderStatePda,
            vault: vaultPda,
            traderTokenAccount: traderTokenAccount,
            vaultTokenAccount: vaultTokenAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([vaultOwner])
        .rpc();

    // 3. Verify Refund
    const vaultBalanceAfter = (await getAccount(provider.connection, vaultTokenAccount)).amount;
    assert.equal(
        vaultBalanceAfter.toString(), 
        (vaultBalanceBefore + BigInt(FUNDING_AMOUNT.toString())).toString(),
        "Vault should receive refund"
    );

    // 4. Verify Account Closed
    try {
        await program.account.traderState.fetch(traderStatePda);
        assert.fail("Account should be closed");
    } catch (e) {
        assert.include(e.message, "Account does not exist");
    }
    
    // 5. Verify ATA Closed - Trying to fetch it should fail or check owner if not closed? 
    // close_account instruction closes the token account so it shouldn't exist or rent should be reclaimed
    try {
       await getAccount(provider.connection, traderTokenAccount);
       assert.fail("ATA should be closed");
    } catch(e) {
        // Expected
    }
  });
});
