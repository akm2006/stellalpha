import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { StellalphaVault } from "../target/types/stellalpha_vault";
import { assert } from "chai";
import { 
  createMint, 
  mintTo, 
  getAccount, 
  TOKEN_PROGRAM_ID, 
  ASSOCIATED_TOKEN_PROGRAM_ID, 
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount
} from "@solana/spl-token";
import * as fs from "fs";
import * as os from "os";

describe("Phase 5: Settlement & Withdrawals", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.StellalphaVault as Program<StellalphaVault>;

  const walletPath = os.homedir() + "/.config/solana/devnet-wallet.json";
  const rawKey = JSON.parse(fs.readFileSync(walletPath, "utf-8"));
  const payer = anchor.web3.Keypair.fromSecretKey(Uint8Array.from(rawKey));

  const vaultOwner = anchor.web3.Keypair.generate();
  const trader = anchor.web3.Keypair.generate(); 
  
  let baseMint: anchor.web3.PublicKey;
  let ownerTokenAccount: anchor.web3.PublicKey; 
  let vaultPda: anchor.web3.PublicKey;
  let vaultTokenAccount: anchor.web3.PublicKey;
  let traderStatePda: anchor.web3.PublicKey;
  let traderTokenAccount: anchor.web3.PublicKey;

  const FUNDING_AMOUNT = new anchor.BN(1_000_000); 

  before(async () => {
    console.log("Setting up Phase 5 test environment...");
    console.log("Vault Owner (Ephemeral):", vaultOwner.publicKey.toBase58());
    
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
    console.log("Base Mint:", baseMint.toBase58());

    // Create owner token account using getOrCreateAssociatedTokenAccount (idempotent)
    const ownerAtaInfo = await getOrCreateAssociatedTokenAccount(
        provider.connection, 
        payer, 
        baseMint, 
        vaultOwner.publicKey
    );
    ownerTokenAccount = ownerAtaInfo.address;
    await mintTo(provider.connection, payer, baseMint, ownerTokenAccount, payer.publicKey, 10_000_000);

    // Config & Vault
    const [globalConfigPda] = anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("global_config")], program.programId);
    try {
        await program.methods.initializeGlobalConfig().accounts({
            globalConfig: globalConfigPda, admin: payer.publicKey, systemProgram: anchor.web3.SystemProgram.programId
        }).signers([payer]).rpc();
    } catch(e) {}

    [vaultPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("user_vault_v1"), vaultOwner.publicKey.toBuffer()],
        program.programId
    );
    await program.methods.initializeVault(vaultOwner.publicKey, baseMint)
        .accounts({ vault: vaultPda, owner: vaultOwner.publicKey, systemProgram: anchor.web3.SystemProgram.programId })
        .signers([vaultOwner]).rpc();
    console.log("Vault Initialized:", vaultPda.toBase58());

    vaultTokenAccount = getAssociatedTokenAddressSync(baseMint, vaultPda, true);
    await program.methods.initVaultAta().accounts({
        vault: vaultPda, owner: vaultOwner.publicKey, mint: baseMint,
        vaultTokenAccount: vaultTokenAccount, tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, systemProgram: anchor.web3.SystemProgram.programId
    }).signers([vaultOwner]).rpc();

    // Fund Vault (Deposit) - Use the owner ATA we just created
    await mintTo(provider.connection, payer, baseMint, ownerTokenAccount, payer.publicKey, 5_000_000);
    await program.methods.depositToken(new anchor.BN(5_000_000)).accounts({
        vault: vaultPda, owner: vaultOwner.publicKey, ownerTokenAccount: ownerTokenAccount,
        vaultTokenAccount: vaultTokenAccount, tokenProgram: TOKEN_PROGRAM_ID
    }).signers([vaultOwner]).rpc();

    [traderStatePda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("trader_state"), vaultOwner.publicKey.toBuffer(), trader.publicKey.toBuffer()],
        program.programId
    );
    traderTokenAccount = getAssociatedTokenAddressSync(baseMint, traderStatePda, true);

    await program.methods.createTraderState(FUNDING_AMOUNT).accounts({
        owner: vaultOwner.publicKey, trader: trader.publicKey, vault: vaultPda,
        traderState: traderStatePda, vaultTokenAccount: vaultTokenAccount,
        traderTokenAccount: traderTokenAccount, mint: baseMint,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID
    }).signers([vaultOwner]).rpc();
    console.log("TraderState Created:", traderStatePda.toBase58());
  });

  it("Fails to Settle if Not Paused", async () => {
    try {
        await program.methods.settleTraderState().accounts({
            owner: vaultOwner.publicKey, // Renamed from authority
            vault: vaultPda,
            traderState: traderStatePda,
            traderTokenAccount: traderTokenAccount
        }).signers([vaultOwner]).rpc();
        assert.fail("Should have failed");
    } catch (e) {
        assert.include(e.message, "TraderState must be paused to close"); // Reusing TraderNotPaused code validation
    }
  });

  it("Pauses and Settles Correctly", async () => {
    // 1. Pause
    await program.methods.pauseTraderState().accounts({
        owner: vaultOwner.publicKey, traderState: traderStatePda
    }).signers([vaultOwner]).rpc();

    // 2. Settle
    await program.methods.settleTraderState().accounts({
        owner: vaultOwner.publicKey,
        vault: vaultPda,
        traderState: traderStatePda,
        traderTokenAccount: traderTokenAccount
    }).signers([vaultOwner]).rpc();
    
    const account = await program.account.traderState.fetch(traderStatePda);
    assert.isTrue(account.isSettled);
  });

  it("Fails to Withdraw if Not Settled", async () => {
    // Need a NEW un-settled trader state to test this failure, or just assume the previous test settled it.
    // Previous test settled it. So this test is moot unless I create another one.
    // Skipping mandatory requirement: "Fail: Withdraw without settlement". I should create a second trader state for this.
    
    // Create Trader 2
    const trader2 = anchor.web3.Keypair.generate();
    const [ts2] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("trader_state"), vaultOwner.publicKey.toBuffer(), trader2.publicKey.toBuffer()],
        program.programId
    );
    const ta2 = getAssociatedTokenAddressSync(baseMint, ts2, true);
    
    await program.methods.createTraderState(FUNDING_AMOUNT).accounts({
        owner: vaultOwner.publicKey, trader: trader2.publicKey, vault: vaultPda,
        traderState: ts2, vaultTokenAccount: vaultTokenAccount,
        traderTokenAccount: ta2, mint: baseMint,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID
    }).signers([vaultOwner]).rpc();

    // Pause but Don't Settle
    await program.methods.pauseTraderState().accounts({
        owner: vaultOwner.publicKey, traderState: ts2
    }).signers([vaultOwner]).rpc();

    try {
        await program.methods.withdrawTraderState().accounts({
            owner: vaultOwner.publicKey,
            vault: vaultPda,
            traderState: ts2,
            traderTokenAccount: ta2,
            vaultTokenAccount: vaultTokenAccount,
            ownerTokenAccount: ownerTokenAccount, // Destination
            tokenProgram: TOKEN_PROGRAM_ID
        }).signers([vaultOwner]).rpc();
        assert.fail("Should have failed NotSettled");
    } catch (e) {
        assert.include(e.message, "Funds must be fully settled");
    }
  });

  it("Withdraws Successfully (Atomic Exit)", async () => {
    // Using the first TraderState which IS settled.
    
    const balanceBefore = (await getAccount(provider.connection, ownerTokenAccount)).amount;

    await program.methods.withdrawTraderState().accounts({
        owner: vaultOwner.publicKey,
        vault: vaultPda,
        traderState: traderStatePda,
        traderTokenAccount: traderTokenAccount,
        vaultTokenAccount: vaultTokenAccount,
        ownerTokenAccount: ownerTokenAccount, // Destination
        tokenProgram: TOKEN_PROGRAM_ID
    }).signers([vaultOwner]).rpc();

    const balanceAfter = (await getAccount(provider.connection, ownerTokenAccount)).amount;

    // Verify Funds Arrived
    // Amount = FUNDING_AMOUNT (1_000_000)
    assert.equal(balanceAfter - balanceBefore, BigInt(FUNDING_AMOUNT.toString()), "User should receive full refund");

    // Verify Account Closed
    try {
        await program.account.traderState.fetch(traderStatePda);
        assert.fail("TraderState Account should be closed");
    } catch (e) {
        assert.include(e.message, "Account does not exist");
    }
  });

});
