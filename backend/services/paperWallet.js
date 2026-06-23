import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, '../data/wallets.json');

const STARTING_BALANCE = 10000;
const RESET_THRESHOLD = STARTING_BALANCE * 0.01; // $100

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
    fs.writeFileSync(DATA_FILE, JSON.stringify(Object.fromEntries(wallets), null, 2));
  } catch (err) {
    console.error('Failed to save wallets.json:', err.message);
  }
};

const wallets = loadWallets();

export const getWallet = (address) => {
  if (!address) address = 'anonymous';
  if (!wallets.has(address)) {
    wallets.set(address, {
      balance: STARTING_BALANCE,
      equity: STARTING_BALANCE,
      totalPnl: 0, // persistent all-time P&L — never resets
    });
    saveWallets();
  }

  const wallet = wallets.get(address);

  // Backfill totalPnl for wallets created before this field existed
  if (wallet.totalPnl === undefined) {
    wallet.totalPnl = 0;
  }

  // Auto-reset available balance if wiped out — but totalPnl is untouched
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

// amount = margin returned + leveraged P&L (can be negative)
// dollarPnl = the actual leveraged profit/loss to accumulate into totalPnl
export const addBalance = (address, amount, dollarPnl = null) => {
  const wallet = getWallet(address);
  wallet.balance += amount;

  // If caller passes the explicit P&L figure, accumulate it permanently.
  // Falls back to inferring from amount vs positionValue if not provided
  // (for backward compat with any call sites that don't pass dollarPnl yet).
  if (dollarPnl !== null) {
    wallet.totalPnl = (wallet.totalPnl || 0) + dollarPnl;
  }

  saveWallets();
  return wallet.balance;
};

export const getBalance = (address) => getWallet(address).balance;