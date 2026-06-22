import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, '../data/wallets.json');

const STARTING_BALANCE = 10000;
const RESET_THRESHOLD = STARTING_BALANCE * 0.01; // $100 — reset if balance falls below this

const loadWallets = () => {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const obj = JSON.parse(raw);
      return new Map(Object.entries(obj));
    }
  } catch (err) {
    console.error('Failed to load wallets.json:', err.message);
  }
  return new Map();
};

const saveWallets = () => {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const obj = Object.fromEntries(wallets);
    fs.writeFileSync(DATA_FILE, JSON.stringify(obj, null, 2));
  } catch (err) {
    console.error('Failed to save wallets.json:', err.message);
  }
};

const wallets = loadWallets();

export const getWallet = (address) => {
  if (!address) address = 'anonymous';
  if (!wallets.has(address)) {
    wallets.set(address, { balance: STARTING_BALANCE, equity: STARTING_BALANCE });
    saveWallets();
  }
  const wallet = wallets.get(address);

  // Auto-reset if balance has been wiped out
  if (wallet.balance < RESET_THRESHOLD) {
    wallet.balance = STARTING_BALANCE;
    wallet.equity = STARTING_BALANCE;
    wallet.wasReset = true;
    saveWallets();
  }

  return wallet;
};

export const deductBalance = (address, amount) => {
  const wallet = getWallet(address);
  wallet.balance -= amount;
  saveWallets();
  return wallet.balance;
};

export const addBalance = (address, amount) => {
  const wallet = getWallet(address);
  wallet.balance += amount;
  saveWallets();
  return wallet.balance;
};

export const getBalance = (address) => {
  return getWallet(address).balance;
};