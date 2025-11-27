import { create } from 'zustand';

type Network = 'devnet' | 'mainnet';

interface NetworkState {
  network: Network;
  rpc: string;
  setNetwork: (network: Network) => void;
}

export const RPC_ENDPOINTS = {
  devnet: "https://api.devnet.solana.com",
  mainnet: "https://mainnet.helius-rpc.com/?api-key=84c389f5-ef3b-4164-ae33-57f6253ecc4f",
};

export const useNetwork = create<NetworkState>((set) => ({
  network: 'devnet',
  rpc: RPC_ENDPOINTS.devnet,
  setNetwork: (network: Network) => set({ 
    network, 
    rpc: RPC_ENDPOINTS[network] 
  }),
}));
