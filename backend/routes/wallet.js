import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

const ALCHEMY_BASE_URL = 'https://base-mainnet.g.alchemy.com/v2';
const ALCHEMY_ETH_URL = 'https://eth-mainnet.g.alchemy.com/v2';

// USDT contract addresses
const USDT_ETH = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const USDT_BASE = '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2';

const ERC20_BALANCE_ABI = '0x70a08231';

const getTokenBalance = async (rpcUrl, walletAddress, tokenAddress) => {
  try {
    const paddedAddress = walletAddress.slice(2).padStart(64, '0');
    const data = ERC20_BALANCE_ABI + paddedAddress;
    const response = await axios.post(rpcUrl, {
      jsonrpc: '2.0',
      method: 'eth_call',
      params: [{ to: tokenAddress, data }, 'latest'],
      id: 1,
    });
    const hex = response.data.result;
    const balance = parseInt(hex, 16) / 1e6; // USDT has 6 decimals
    return balance;
  } catch {
    return 0;
  }
};

const getNativeBalance = async (rpcUrl, walletAddress) => {
  try {
    const response = await axios.post(rpcUrl, {
      jsonrpc: '2.0',
      method: 'eth_getBalance',
      params: [walletAddress, 'latest'],
      id: 1,
    });
    const hex = response.data.result;
    const balance = parseInt(hex, 16) / 1e18;
    return balance;
  } catch {
    return 0;
  }
};

router.get('/:address', async (req, res) => {
  const { address } = req.params;

  if (!address || !address.startsWith('0x')) {
    return res.status(400).json({ error: 'Invalid address' });
  }

  try {
    const ethRpc = `${ALCHEMY_ETH_URL}/${process.env.ALCHEMY_API_KEY || 'demo'}`;
    const baseRpc = `${ALCHEMY_BASE_URL}/${process.env.ALCHEMY_API_KEY || 'demo'}`;

    const [
      usdtEth,
      usdtBase,
      ethBalance,
      baseEthBalance,
    ] = await Promise.all([
      getTokenBalance(ethRpc, address, USDT_ETH),
      getTokenBalance(baseRpc, address, USDT_BASE),
      getNativeBalance(ethRpc, address),
      getNativeBalance(baseRpc, address),
    ]);

    res.json({
      address,
      ethereum: {
        usdt: usdtEth.toFixed(2),
        eth: ethBalance.toFixed(4),
      },
      base: {
        usdt: usdtBase.toFixed(2),
        eth: baseEthBalance.toFixed(4),
      },
      totalUsdt: (usdtEth + usdtBase).toFixed(2),
    });
  } catch (error) {
    console.error('Wallet balance error:', error.message);
    res.status(500).json({ error: 'Failed to fetch wallet balance' });
  }
});

export default router;