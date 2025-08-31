
# Stellalpha

**Stellalpha** is an autonomous, gasless copy-trading agent and interactive AI assistant built for EVM-compatible chains, demonstrated on the Avalanche network.  

Welcome to Stellalpha!  
This project allows users to connect their MetaMask wallet, follow **"Star" traders**, and have the Stellalpha agent automatically replicate their trades in a gasless manner.  

It also features a powerful on-chain AI assistant that can perform wallet operations through natural language commands, making complex blockchain interactions as simple as having a conversation.  
![WARNING](https://img.shields.io/badge/⚠️-WARNING-red?style=for-the-badge)

The actual implemenation will use 0xgasless smart-account which will not require user private key.The user can fund their smart-accont and the app will only interact with the smart wallet.But for testing and development we are using EOA(Externaly Owned Account) and FUJI TESTNET. While app can be used in AVALANCHE MAINNET by chainging the CHAIN-ID and RPC URL in .env file and is fully funcional to execute copy-trades, but **USE PRIVATE KEY OF MAINNET WALLET AT YOUR OWN RISK**. Main purpose of this project is to explain the usage of 0xgasless agent to make a autonomous trading agent.

---

## Features

- **Autonomous Copy-Trading**:  
  Automatically monitor and execute the same trades as followed *Star* wallets when they interact with the Trader Joe DEX. Our backend service watches the chain for you, 24/7.

- **Gasless Transactions**:  
  Powered by the **0xGasless AgentKit**, all trades are executed without requiring the user to hold native tokens (like AVAX) for gas fees. This removes a major barrier to entry for new users.

- **EOA Agent Model**:  
  Utilizes a secure **Externally Owned Account (EOA)** agent on the backend to perform actions. This is a direct wallet-to-wallet operation and does not use the 0xGasless Smart Account model, offering a simpler and more direct approach to automation JUST FOR DEVELOPMENT.

- **Interactive AI Assistant**:  
  A built-in chatbot that can check balances, transfer tokens, and perform swaps using natural language. It's designed to understand your intent and execute complex on-chain actions on your command.

- **Live Activity Feed**:  
  A real-time log of all trades executed by the agent, providing transparency and instant feedback on the agent's performance.

- **Portfolio Management**:  
  A comprehensive command center to view current holdings , manage your list of followed stars, and configure trade settings like the amount to be used per trade.

- **Modern UI**:  
  A sleek, futuristic interface with a dark theme and glassmorphism effects, built with **Next.js** and **Tailwind CSS** for a responsive and visually appealing experience.

---

## Core Technologies

- **Framework**: Next.js & React  
- **Styling**: Tailwind CSS  
- **Blockchain Interaction**: Ethers.js  
- **Gasless Infrastructure**: 0xGasless AgentKit SDK  
- **AI Chat**: LangChain.js with OpenRouter (GPT-4o)  
- **Database**: Upstash Redis for session and state management  
- **Network**: Avalanche Fuji Testnet & Mainnet compatible  

---

## Mainnet Functionality

This application is fully functional on the Avalanche Mainnet.  
To switch from the default Fuji Testnet to Mainnet, update the following environment variables:

```env
CHAIN_ID=43114
NEXT_PUBLIC_CHAIN_ID=43114
AVALANCHE_RPC_URL=Your_Avalanche_Mainnet_RPC_URL
````

---

## ⚠️ Security Warning: Private Key Usage

To enable the autonomous features, this application requires you to provide your wallet's **private key**.

* **NEVER** use your primary wallet or a wallet with significant funds.
* **ALWAYS** use a *burner wallet* created specifically for this application.

The private key is sent to the backend to initialize the agent for the current session. While it is **not stored permanently**, exposing your private key online is inherently risky.

You are solely responsible for the security of your private keys and funds.

---

## Getting Started

### Prerequisites

* Node.js (v18 or higher)
* npm or yarn
* A MetaMask wallet
* Testnet or Mainnet funds, depending on your configuration

---

### Installation

1. **Clone the repository**:

   ```bash
   git clone <your-repo-url>
   cd stellalpha-new
   ```

2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Set up environment variables**:
   Create a file named `.env.local` in the root of your project and add:

   ```env
   # Your private RPC URL for the Avalanche Fuji Testnet or Mainnet
   AVALANCHE_RPC_URL="YOUR_AVAX_RPC_URL"
   NEXT_PUBLIC_AVALANCHE_RPC_URL="YOUR_AVAX_RPC_URL"

   # Your 0xGasless API Key from the 0xGasless dashboard
   OXGASLESS_API_KEY="YOUR_0XGASLESS_API_KEY"

   # Your API key from OpenRouter.ai for the chat agent
   OPENROUTER_API_KEY="YOUR_OPENROUTER_API_KEY"

   # Chain ID for the target network (43113 for Fuji, 43114 for Mainnet)
   CHAIN_ID="43113"
   NEXT_PUBLIC_CHAIN_ID="43113"

   # Upstash Redis connection details
   UPSTASH_REDIS_REST_URL="YOUR_UPSTASH_URL"
   UPSTASH_REDIS_REST_TOKEN="YOUR_UPSTASH_TOKEN"
   ```

---

### Running the Application

Start the development server:

```bash
npm run dev
```



