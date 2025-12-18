import React from 'react';
import { PrivyProvider } from '@privy-io/react-auth';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { base } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Wagmi config for Base Mainnet
const wagmiConfig = createConfig({
  chains: [base],
  transports: {
    [base.id]: http(),
  },
});

const queryClient = new QueryClient();

// Privy App ID - get from dashboard.privy.io
const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID || 'clxxxxxxxxxxxxxxxxxx';

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        // Login methods - Email, Google, Twitter, Discord + Wallets
        loginMethods: ['email', 'google', 'twitter', 'discord', 'wallet'],

        // Appearance
        appearance: {
          theme: 'dark',
          accentColor: '#3b82f6', // Primary blue
          logo: '/logo.png',
          showWalletLoginFirst: false, // Show social/email first
        },

        // Embedded wallets config
        embeddedWallets: {
          ethereum: {
            createOnLogin: 'users-without-wallets', // Auto-create for non-crypto users
          },
        },

        // Default chain
        defaultChain: base,
        supportedChains: [base],

        // Legal
        legal: {
          termsAndConditionsUrl: 'https://vrwx.io/terms',
          privacyPolicyUrl: 'https://vrwx.io/privacy',
        },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          {children}
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
};

// Export Privy hooks
export { usePrivy, useWallets } from '@privy-io/react-auth';
export { useAccount, useWriteContract, useReadContract } from 'wagmi';

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
