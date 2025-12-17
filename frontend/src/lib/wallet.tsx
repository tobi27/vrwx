import '@rainbow-me/rainbowkit/styles.css';
import { getDefaultConfig, RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import { WagmiProvider } from 'wagmi';
import { base } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Configure for Base Mainnet
const config = getDefaultConfig({
  appName: 'VRWX',
  projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || 'vrwx-demo', // Get from cloud.walletconnect.com
  chains: [base],
  ssr: false,
});

const queryClient = new QueryClient();

// Custom dark theme matching VRWX design
const vrwxTheme = darkTheme({
  accentColor: '#3b82f6', // primary blue
  accentColorForeground: 'white',
  borderRadius: 'medium',
  fontStack: 'system',
});

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={vrwxTheme} modalSize="compact">
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
};

// Export hooks for use in components
export { useAccount, useConnect, useDisconnect, useBalance, useWriteContract, useReadContract } from 'wagmi';
export { ConnectButton } from '@rainbow-me/rainbowkit';

// USDC contract on Base
export const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;
export const JOB_ESCROW_ADDRESS = '0x40Ba424ee54607cFb7A4fEe5DB46533Cc8c52fd3' as const;

// USDC ABI (just what we need)
export const USDC_ABI = [
  {
    name: 'approve',
    type: 'function',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'allowance',
    type: 'function',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
] as const;
