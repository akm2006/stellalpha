# 🔧 Configuring New DEXs in Stellalpha

This guide provides instructions for developers on how to extend the **Stellalpha agent's** capabilities by adding support for additional **Decentralized Exchanges (DEXs)**.  

The core logic for monitoring and executing copy-trades is located in:

```

app/api/agent/route.ts

````

All modifications will be made within this file.

---

## ⭐ Core Requirements & Limitations

Before adding a new DEX, please ensure you understand the following requirements:

### 1. 0xGasless Compatibility
The Stellalpha agent is powered by the **0xGasless Agentkit**.  
This means that any DEX you wish to add must operate on a blockchain that is supported by the **0xGasless infrastructure**.  
The agent relies on their `smart_swap` tool for executing trades.

### 2. Chain Consistency
The DEX and its router contract must be on the same blockchain network that is configured in your `.env` file.  

- `CHAIN_ID`  
- `AVALANCHE_RPC_URL` *(or the relevant RPC URL for your chosen chain)*  

These variables must match the network of the DEX you are adding.

### 3. ABI Compatibility
The current agent logic is specifically designed to parse transactions from DEX routers that follow a common pattern, using functions like:

- `swapExactTokensForTokens(...)`  
- `swapExactAVAXForTokens(...)` or `swapExactETHForTokens(...)`  

⚠️ Routers with fundamentally different architectures (e.g., Uniswap's UniversalRouter, which uses a generic execute(...) command) are not compatible with the current parsing logic and would require a significant rewrite of the handleNewBlock function.

However, integrating such routers is entirely possible in the future. It would involve developing a more advanced parser within the handleNewBlock function capable of decoding the Universal Router's commands byte string. This new logic would need to interpret these encoded instructions to extract the swap details (like the token path and amounts) before the agent could replicate the trade. We may implement this enhancement in a future version of Stellalpha.

---

## 🛠️ Step-by-Step Integration Guide

Follow these three steps to add a new compatible DEX to the agent.

---

### Step 1: Find the DEX Router Address & ABI
1. **Find the Router Address**  
   - Use a block explorer for the target chain (e.g., [Snowtrace](https://snowtrace.io) for Avalanche)  
   - Locate the official, verified router contract address (usually in the DEX docs).  

2. **Get the Full ABI**  
   - On the contract’s page in the explorer, go to the **Contract** tab.  
   - Copy the full JSON ABI.

---

### Step 2: Convert the ABI to a Human-Readable Array
To keep the codebase clean, we use a **simplified, human-readable ABI format** instead of the entire JSON object.  
You only need the signatures for the key swap functions.

#### Example Conversion

**Full JSON ABI snippet:**
```json
{
  "inputs": [
    { "internalType": "uint256", "name": "amountIn", "type": "uint256" },
    { "internalType": "uint256", "name": "amountOutMin", "type": "uint256" },
    { "internalType": "address[]", "name": "path", "type": "address[]" },
    { "internalType": "address", "name": "to", "type": "address" },
    { "internalType": "uint256", "name": "deadline", "type": "uint256" }
  ],
  "name": "swapExactTokensForTokens",
  "outputs": [
    { "internalType": "uint256[]", "name": "amounts", "type": "uint256[]" }
  ],
  "stateMutability": "nonpayable",
  "type": "function"
}
````

**Simplified format:**

```ts
"function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)"
```

> **Note:** For swaps involving the native asset (like AVAX), the function name might still be `swapExactETHForTokens` even on non-Ethereum chains.
> This is for **EVM compatibility** and works correctly.

---

### Step 3: Add the Configuration to `agent/route.ts`

1. **Define Constants**

```ts
// --- NEW: YourNewDEX Config ---
const YOUR_NEW_DEX_ROUTER_ADDRESS = "0x..."; // Replace with the actual address
const YOUR_NEW_DEX_ABI = [
  "function swapExactAVAXForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable",
  "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)"
];

const yourNewDexInterface = new ethers.Interface(YOUR_NEW_DEX_ABI);
```

2. **Update the `supportedDexes` Array**

```ts
// --- Supported DEXs Array ---
const supportedDexes = [
    {
        name: 'TraderJoe',
        address: TRADER_JOE_ROUTER_ADDRESS,
        interface: traderJoeInterface,
    },
    {
        name: 'SushiSwap',
        address: SUSHISWAP_ROUTER_ADDRESS,
        interface: sushiswapInterface
    },
    // Add your new DEX here
    {
        name: 'YourNewDEX', // A display name for logs
        address: YOUR_NEW_DEX_ROUTER_ADDRESS,
        interface: yourNewDexInterface,
    }
];
```

---

## ✅ Final Steps

1. **Restart Your Server**
   After saving the changes to `app/api/agent/route.ts`, restart your dev server.

2. **Test**

   * Activate the agent
   * Follow a "Star Trader" who trades on the newly added DEX
   * Watch your console for log messages confirming that trades were detected and copied.

---


