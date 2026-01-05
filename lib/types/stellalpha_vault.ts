/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/stellalpha_vault.json`.
 */
export type StellalphaVault = {
  "address": "64XogE2RvY7g4fDp8XxWZxFTycANjDK37n88GZizm5nx",
  "metadata": {
    "name": "stellalphaVault",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Stellalpha Vault Program"
  },
  "instructions": [
    {
      "name": "addAllowedMint",
      "discriminator": [
        114,
        83,
        166,
        247,
        86,
        17,
        220,
        147
      ],
      "accounts": [
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "mint",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "closeTraderAta",
      "docs": [
        "Phase 7.1: Close a non-base TraderState ATA to reclaim rent.",
        "Owner-only. Requires is_paused = true. ATA balance must be 0.",
        "Rent returned to owner."
      ],
      "discriminator": [
        160,
        93,
        240,
        189,
        121,
        32,
        244,
        188
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "traderState"
          ]
        },
        {
          "name": "traderState",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  97,
                  100,
                  101,
                  114,
                  95,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "trader_state.trader",
                "account": "traderState"
              }
            ]
          }
        },
        {
          "name": "traderTokenAccount",
          "docs": [
            "The token account to close. Must be owned by TraderState."
          ],
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "closeTraderState",
      "discriminator": [
        42,
        16,
        210,
        101,
        255,
        149,
        220,
        254
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "traderState"
          ]
        },
        {
          "name": "traderState",
          "writable": true
        },
        {
          "name": "vault",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  118,
                  49
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          },
          "relations": [
            "traderState"
          ]
        },
        {
          "name": "traderTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "traderState"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "vault.base_mint",
                "account": "userVault"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "vaultTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "vault.base_mint",
                "account": "userVault"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "closeVaultAta",
      "docs": [
        "Close a Vault Token Account (ATA) if its balance is zero.",
        "Only the owner can close, and rent is returned to owner."
      ],
      "discriminator": [
        148,
        47,
        170,
        34,
        91,
        173,
        95,
        46
      ],
      "accounts": [
        {
          "name": "vault",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  118,
                  49
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "vaultTokenAccount",
          "docs": [
            "The token account to close. Must be owned by vault and have zero balance."
          ],
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "createTraderAta",
      "docs": [
        "Phase 7A: Create additional token account for TraderState to hold non-base assets.",
        "Owner-only. No funds transferred."
      ],
      "discriminator": [
        101,
        234,
        117,
        235,
        103,
        71,
        89,
        176
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "traderState"
          ]
        },
        {
          "name": "traderState",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  97,
                  100,
                  101,
                  114,
                  95,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "trader_state.trader",
                "account": "traderState"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "traderTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "traderState"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "createTraderState",
      "discriminator": [
        54,
        83,
        114,
        42,
        92,
        167,
        73,
        77
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "trader"
        },
        {
          "name": "vault",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  118,
                  49
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "traderState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  97,
                  100,
                  101,
                  114,
                  95,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "trader"
              }
            ]
          }
        },
        {
          "name": "vaultTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "traderTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "traderState"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "depositSol",
      "discriminator": [
        108,
        81,
        78,
        117,
        125,
        155,
        56,
        200
      ],
      "accounts": [
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  118,
                  49
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "depositToken",
      "discriminator": [
        11,
        156,
        96,
        218,
        39,
        163,
        180,
        19
      ],
      "accounts": [
        {
          "name": "vault"
        },
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "ownerTokenAccount",
          "writable": true
        },
        {
          "name": "vaultTokenAccount",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "executeSwap",
      "discriminator": [
        56,
        182,
        124,
        215,
        155,
        140,
        157,
        102
      ],
      "accounts": [
        {
          "name": "globalConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "vault",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  118,
                  49
                ]
              },
              {
                "kind": "account",
                "path": "vault.owner",
                "account": "userVault"
              }
            ]
          }
        },
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "tokenAccountIn",
          "writable": true
        },
        {
          "name": "tokenAccountOut",
          "writable": true
        },
        {
          "name": "platformFeeAccount",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "jupiterProgram",
          "docs": [
            "We strictly enforce the Mainnet Jupiter ID or Devnet Memo ID here."
          ],
          "address": "Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo"
        },
        {
          "name": "sysvarInstructions",
          "address": "Sysvar1nstructions1111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amountIn",
          "type": "u64"
        },
        {
          "name": "minAmountOut",
          "type": "u64"
        }
      ]
    },
    {
      "name": "executeTraderSwap",
      "docs": [
        "Execute a swap on behalf of a TraderState via Jupiter CPI.",
        "amount_in: Total amount to spend, including platform fee.",
        "min_amount_out: Minimum amount to receive (slippage protection).",
        "data: Opaque data blob for Jupiter swap instruction."
      ],
      "discriminator": [
        129,
        230,
        174,
        191,
        180,
        66,
        1,
        230
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "vault",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  118,
                  49
                ]
              },
              {
                "kind": "account",
                "path": "trader_state.owner",
                "account": "traderState"
              }
            ]
          },
          "relations": [
            "traderState"
          ]
        },
        {
          "name": "traderState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  97,
                  100,
                  101,
                  114,
                  95,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "trader_state.owner",
                "account": "traderState"
              },
              {
                "kind": "account",
                "path": "trader_state.trader",
                "account": "traderState"
              }
            ]
          }
        },
        {
          "name": "inputTokenAccount",
          "writable": true
        },
        {
          "name": "outputTokenAccount",
          "writable": true
        },
        {
          "name": "platformFeeAccount",
          "writable": true
        },
        {
          "name": "globalConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "jupiterProgram"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "instructions",
          "address": "Sysvar1nstructions1111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amountIn",
          "type": "u64"
        },
        {
          "name": "minAmountOut",
          "type": "u64"
        },
        {
          "name": "data",
          "type": "bytes"
        }
      ]
    },
    {
      "name": "initVaultAta",
      "discriminator": [
        51,
        35,
        56,
        183,
        193,
        185,
        7,
        21
      ],
      "accounts": [
        {
          "name": "vault",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  118,
                  49
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "mint"
        },
        {
          "name": "vaultTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initializeGlobalConfig",
      "discriminator": [
        113,
        216,
        122,
        131,
        225,
        209,
        22,
        55
      ],
      "accounts": [
        {
          "name": "globalConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initializeVault",
      "discriminator": [
        48,
        191,
        163,
        44,
        71,
        129,
        63,
        164
      ],
      "accounts": [
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  118,
                  49
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "authority",
          "type": "pubkey"
        },
        {
          "name": "baseMint",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "markTraderInitialized",
      "docs": [
        "Phase 7D: Mark TraderState as initialized after portfolio sync.",
        "Can be called by owner OR backend authority (one-time only)."
      ],
      "discriminator": [
        7,
        242,
        142,
        140,
        121,
        194,
        159,
        236
      ],
      "accounts": [
        {
          "name": "signer",
          "writable": true,
          "signer": true
        },
        {
          "name": "vault",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  118,
                  49
                ]
              },
              {
                "kind": "account",
                "path": "trader_state.owner",
                "account": "traderState"
              }
            ]
          },
          "relations": [
            "traderState"
          ]
        },
        {
          "name": "traderState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  97,
                  100,
                  101,
                  114,
                  95,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "trader_state.owner",
                "account": "traderState"
              },
              {
                "kind": "account",
                "path": "trader_state.trader",
                "account": "traderState"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "pauseTraderState",
      "discriminator": [
        110,
        159,
        204,
        184,
        250,
        122,
        125,
        8
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "traderState"
          ]
        },
        {
          "name": "traderState",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "removeAllowedMint",
      "discriminator": [
        53,
        133,
        46,
        51,
        25,
        228,
        27,
        73
      ],
      "accounts": [
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "mint",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "resumeTraderState",
      "discriminator": [
        22,
        84,
        83,
        130,
        87,
        148,
        161,
        239
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "traderState"
          ]
        },
        {
          "name": "traderState",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "settleTraderState",
      "docs": [
        "settlement: Validate that TraderState holds only Base Asset and amount >= current_value.",
        "Locks the state as 'Settled' to enable withdrawal."
      ],
      "discriminator": [
        74,
        186,
        35,
        243,
        142,
        186,
        238,
        125
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "traderState"
          ]
        },
        {
          "name": "vault",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  118,
                  49
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          },
          "relations": [
            "traderState"
          ]
        },
        {
          "name": "traderState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  97,
                  100,
                  101,
                  114,
                  95,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "trader_state.trader",
                "account": "traderState"
              }
            ]
          }
        },
        {
          "name": "traderTokenAccount",
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "traderState"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "vault.base_mint",
                "account": "userVault"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        }
      ],
      "args": []
    },
    {
      "name": "toggleLegacyTrading",
      "docs": [
        "Toggle legacy trading enabled/disabled. Admin only."
      ],
      "discriminator": [
        112,
        113,
        5,
        68,
        239,
        251,
        145,
        241
      ],
      "accounts": [
        {
          "name": "globalConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "globalConfig"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "togglePause",
      "discriminator": [
        238,
        237,
        206,
        27,
        255,
        95,
        123,
        229
      ],
      "accounts": [
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "vault"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "withdrawSol",
      "discriminator": [
        145,
        131,
        74,
        136,
        65,
        137,
        42,
        38
      ],
      "accounts": [
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  118,
                  49
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "withdrawToken",
      "discriminator": [
        136,
        235,
        181,
        5,
        101,
        109,
        57,
        81
      ],
      "accounts": [
        {
          "name": "vault",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  118,
                  49
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "ownerTokenAccount",
          "writable": true
        },
        {
          "name": "vaultTokenAccount",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "withdrawTraderState",
      "docs": [
        "withdraw: Exit flow.",
        "Prerequisites: Paused && Settled.",
        "Flow: TraderState -> UserVault -> User Wallet.",
        "Closes TraderState and its ATA."
      ],
      "discriminator": [
        74,
        128,
        253,
        225,
        252,
        200,
        128,
        12
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "traderState"
          ]
        },
        {
          "name": "vault",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  118,
                  49
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          },
          "relations": [
            "traderState"
          ]
        },
        {
          "name": "traderState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  97,
                  100,
                  101,
                  114,
                  95,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "trader_state.trader",
                "account": "traderState"
              }
            ]
          }
        },
        {
          "name": "traderTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "traderState"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "vault.base_mint",
                "account": "userVault"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "vaultTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "vault.base_mint",
                "account": "userVault"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "ownerTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "vault.base_mint",
                "account": "userVault"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "globalConfig",
      "discriminator": [
        149,
        8,
        156,
        202,
        160,
        252,
        176,
        217
      ]
    },
    {
      "name": "traderState",
      "discriminator": [
        124,
        33,
        101,
        17,
        158,
        79,
        26,
        140
      ]
    },
    {
      "name": "userVault",
      "discriminator": [
        23,
        76,
        96,
        159,
        210,
        10,
        5,
        22
      ]
    }
  ],
  "events": [
    {
      "name": "legacyTradingToggled",
      "discriminator": [
        99,
        254,
        241,
        217,
        76,
        191,
        217,
        196
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "unauthorized",
      "msg": "You are not authorized to perform this action."
    },
    {
      "code": 6001,
      "name": "paused",
      "msg": "The vault is currently paused."
    },
    {
      "code": 6002,
      "name": "invalidSwapOutput",
      "msg": "Swap output did not result in an increase in the vault's output token balance."
    },
    {
      "code": 6003,
      "name": "tokenNotAllowed",
      "msg": "Token is not allowed in this vault (not Base Asset or Whitelisted)."
    },
    {
      "code": 6004,
      "name": "invalidSwapTopology",
      "msg": "Invalid topology: Swap must start or end with the Base Asset."
    },
    {
      "code": 6005,
      "name": "invalidFeeDestination",
      "msg": "Invalid Fee Destination. Platform fee wallet mismatch."
    },
    {
      "code": 6006,
      "name": "slippageExceeded",
      "msg": "Slippage Exceeded. Amount received is less than min_amount_out."
    },
    {
      "code": 6007,
      "name": "feeEvasion",
      "msg": "Fee Evasion Detected. Actual amount spent > declared amount_in."
    },
    {
      "code": 6008,
      "name": "invalidInstructionData",
      "msg": "Instruction data too short for arguments + logic."
    },
    {
      "code": 6009,
      "name": "traderNotPaused",
      "msg": "TraderState must be paused to close."
    },
    {
      "code": 6010,
      "name": "traderPaused",
      "msg": "TraderState must be active to swap."
    },
    {
      "code": 6011,
      "name": "notSettled",
      "msg": "Funds must be fully settled in Base Asset before withdrawal."
    },
    {
      "code": 6012,
      "name": "insufficientFunds",
      "msg": "Funds held are less than current value. Insolvency risk or logic error."
    },
    {
      "code": 6013,
      "name": "mintMismatch",
      "msg": "Mint mismatch. TraderState must hold Base Asset to settle."
    },
    {
      "code": 6014,
      "name": "legacyTradingDisabled",
      "msg": "Legacy trading is disabled. Use TraderState execution."
    },
    {
      "code": 6015,
      "name": "nonZeroBalance",
      "msg": "Cannot close account with non-zero balance."
    },
    {
      "code": 6016,
      "name": "invalidTokenAccountOwner",
      "msg": "Token account not owned by TraderState."
    },
    {
      "code": 6017,
      "name": "traderNotInitialized",
      "msg": "TraderState not initialized. Complete portfolio sync first."
    },
    {
      "code": 6018,
      "name": "alreadyInitialized",
      "msg": "TraderState already initialized."
    }
  ],
  "types": [
    {
      "name": "globalConfig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "platformFeeBps",
            "type": "u16"
          },
          {
            "name": "performanceFeeBps",
            "type": "u16"
          },
          {
            "name": "legacyTradingEnabled",
            "docs": [
              "If false, legacy execute_swap is disabled. Default: false."
            ],
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "legacyTradingToggled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "enabled",
            "type": "bool"
          },
          {
            "name": "admin",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "traderState",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "docs": [
              "The user who owns this allocation and the funds."
            ],
            "type": "pubkey"
          },
          {
            "name": "trader",
            "docs": [
              "The trader being followed (Strategy Identifier)."
            ],
            "type": "pubkey"
          },
          {
            "name": "vault",
            "docs": [
              "Reference to the UserVault this allocation is associated with."
            ],
            "type": "pubkey"
          },
          {
            "name": "bump",
            "docs": [
              "PDA Bump."
            ],
            "type": "u8"
          },
          {
            "name": "currentValue",
            "docs": [
              "Current Value (Allocated Capital)."
            ],
            "type": "u64"
          },
          {
            "name": "highWaterMark",
            "docs": [
              "High Water Mark for performance fee calculation."
            ],
            "type": "u64"
          },
          {
            "name": "cumulativeProfit",
            "docs": [
              "Net realized PnL. Can be negative.",
              "Used for analytics and reporting."
            ],
            "type": "i64"
          },
          {
            "name": "isPaused",
            "docs": [
              "Safety switch for this specific allocation."
            ],
            "type": "bool"
          },
          {
            "name": "isSettled",
            "docs": [
              "True only when all TraderState funds are confirmed to be in base_mint.",
              "Required before withdrawal."
            ],
            "type": "bool"
          },
          {
            "name": "isInitialized",
            "docs": [
              "True after initial portfolio sync is complete.",
              "Required for ongoing trading (Phase 7)."
            ],
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "userVault",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "isPaused",
            "type": "bool"
          },
          {
            "name": "tradeAmountLamports",
            "type": "u64"
          },
          {
            "name": "baseMint",
            "type": "pubkey"
          },
          {
            "name": "allowedMints",
            "type": {
              "vec": "pubkey"
            }
          }
        ]
      }
    }
  ]
};
