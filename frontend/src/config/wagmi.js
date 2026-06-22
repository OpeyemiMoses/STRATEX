import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { mainnet, polygon, arbitrum, base } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'Stratex',
  projectId: '3c0e1ec6d09d9c40d705345bd3569b58',
  chains: [mainnet, polygon, arbitrum, base],
  ssr: false,
});