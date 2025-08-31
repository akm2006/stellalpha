<p align="center">
  <img src="public/stellalpha.png" alt="Stellalpha Logo" width="120"/>
</p>
<h1 align="center">Stellalpha</h1>

**Stellalpha** is an **autonomous, gasless copy-trading agent** and **interactive AI assistant** built for **EVM-compatible chains**, demonstrated on the **Avalanche network**.  

Welcome to Stellalpha!  
This project allows users to connect their MetaMask wallet, follow **"Star Traders"**, and have the Stellalpha agent automatically replicate their trades **gaslessly**.  

It also includes a powerful **on-chain AI assistant** that can perform wallet operations through **natural language commands**, making blockchain interactions as simple as chatting.  

---

## 🚀 Deployed App

🔗 **Live Demo**: [stellalpha.vercel.app](https://stellalpha.vercel.app)  

> ⚠️ **Note:** The chatbot functionality may not work in the deployed app due to lack of OpenRouter API credits. All other features (UI, wallet connection, etc.) are still accessible.

---
![WARNING](https://img.shields.io/badge/⚠️-CRITICAL_WARNING-red?style=for-the-badge)

## ⚠️ Important Notice  

This project is for **Hackathon and other development purposes only**.  

- The production-ready implementation will use **0xGasless Smart Accounts**, which do **not** require user private keys.  
- Users will fund their smart accounts, and the app will interact only with the **smart wallet**.  

For **testing and development**, we currently use:  
- **EOA (Externally Owned Accounts)**  
- **Avalanche Fuji Testnet**  

Although the app **can be run on Avalanche Mainnet** by changing the `CHAIN_ID` and `RPC_URL` in `.env`, it is **strongly discouraged** to use your **real private key**.  
👉 **Any use of your Mainnet private key is entirely at your own risk.**  

The purpose of this project is to demonstrate how the **0xGasless Agent** can power an **autonomous trading agent**.  

---

## ✨ Features

- **Autonomous Copy-Trading**  
  Monitor and replicate trades from *Star Traders* on Trader Joe DEX. The backend watches the chain for you, 24/7.

- **Gasless Transactions**  
  Powered by **0xGasless AgentKit**, trades are executed without requiring native tokens (e.g., AVAX) for gas fees.

- **EOA Agent Model (Development Only)**  
  Uses an **Externally Owned Account (EOA)** agent for development simplicity.  
  ⚠️ This is not the final implementation—production will rely on **0xGasless Smart Accounts**.

- **Interactive AI Assistant**  
  A chatbot that can check balances, transfer tokens, and perform swaps using **natural language commands**.

- **Live Activity Feed**  
  Real-time logs of all agent-executed trades for transparency and monitoring.

- **Portfolio Management**  
  Manage holdings, configure followed traders, and customize trade amounts.

- **Modern UI**  
  Dark theme + glassmorphism, built with **Next.js** + **Tailwind CSS** for a sleek and responsive design.

---

## 🛠️ Core Technologies

- **Framework**: Next.js & React  
- **Styling**: Tailwind CSS  
- **Blockchain Interaction**: Ethers.js  
- **Gasless Infra**: 0xGasless AgentKit SDK  
- **AI Chat**: LangChain.js + OpenRouter (GPT-4o)  
- **Database**: Upstash Redis  
- **Networks**: Avalanche Fuji Testnet & Mainnet  

---

## 🌐 Mainnet Usage

This app is **Mainnet-ready**, but only recommended for testing with **burner wallets**.  

To switch from Fuji Testnet to Avalanche Mainnet, update `.env.local`:  

```env
CHAIN_ID=43114
NEXT_PUBLIC_CHAIN_ID=43114
AVALANCHE_RPC_URL=YOUR_AVALANCHE_MAINNET_RPC_URL
````

---

## 🔒 Security Warning: Private Key Usage

To enable autonomous features, this app requires your wallet’s **private key**.

⚠️ **Critical Guidelines**:

* **NEVER** use your primary wallet or one with significant funds.
* **ALWAYS** use a dedicated **burner wallet**.
* While the private key is **not stored permanently**, sending it to a backend service is inherently risky.

You are **solely responsible** for the security of your keys and funds.

---

## 🚀 Getting Started

### Prerequisites

* Node.js (v18+)
* npm or yarn
* MetaMask wallet
* Testnet/Mainnet funds (depending on config)

### Installation

```bash
git clone <your-repo-url>
cd stellalpha-new
npm install
```

### Environment Setup

Create `.env.local` in the root folder:

```env
# Avalanche RPC (Fuji or Mainnet)
AVALANCHE_RPC_URL="YOUR_AVAX_RPC_URL"
NEXT_PUBLIC_AVALANCHE_RPC_URL="YOUR_AVAX_RPC_URL"

# 0xGasless API Key
OXGASLESS_API_KEY="YOUR_0XGASLESS_API_KEY"

# OpenRouter AI API Key
OPENROUTER_API_KEY="YOUR_OPENROUTER_API_KEY"

# Network (43113 = Fuji, 43114 = Mainnet)
CHAIN_ID="43113"
NEXT_PUBLIC_CHAIN_ID="43113"

# Upstash Redis
UPSTASH_REDIS_REST_URL="YOUR_UPSTASH_URL"
UPSTASH_REDIS_REST_TOKEN="YOUR_UPSTASH_TOKEN"
```

### Running Locally

```bash
npm run dev
```

---


