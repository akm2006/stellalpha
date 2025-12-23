import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { StellalphaVault } from "../target/types/stellalpha_vault";
import { assert } from "chai";

describe("Phase 1: Global Config", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.StellalphaVault as Program<StellalphaVault>;

  const admin = provider.wallet;

  it("Is initialized!", async () => {
    // 1. Derive Global Config PDA
    const [globalConfigPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("global_config")],
      program.programId
    );

    // 2. Initialize
    try {
        await program.methods
          .initializeGlobalConfig()
          .accounts({
            globalConfig: globalConfigPda,
            admin: admin.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();
    } catch (e) {
        console.log("Global Config might be already initialized");
    }

    // 3. Verify State
    const account = await program.account.globalConfig.fetch(globalConfigPda);
    
    console.log("Global Config Admin:", account.admin.toBase58());
    console.log("Platform Fee BPS:", account.platformFeeBps);
    console.log("Performance Fee BPS:", account.performanceFeeBps);

    assert.ok(account.admin.equals(admin.publicKey), "Admin matches signer");
    assert.ok(account.platformFeeBps === 10, "Platform fee is 10 bps");
    assert.ok(account.performanceFeeBps === 2000, "Performance fee is 2000 bps");
  });

  it("Enforces Singleton (Cannot Initialize Twice)", async () => {
    const [globalConfigPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("global_config")],
      program.programId
    );

    try {
      await program.methods
        .initializeGlobalConfig()
        .accounts({
          globalConfig: globalConfigPda,
          admin: admin.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      assert.fail("Should have failed to initialize twice");
    } catch (e) {
      assert.include(e.message, "already in use", "Expected 'already in use' error");
    }
  });
});
