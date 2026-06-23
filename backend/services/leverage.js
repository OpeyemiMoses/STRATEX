/**
 * Leverage math for futures-style simulated positions.
 *
 * Key distinction this module enforces everywhere it's used:
 * - MARGIN = what's actually deducted from the paper wallet balance (positionSize% of balance)
 * - EXPOSURE = margin × leverage = the notional size the P&L percentage is applied to
 *
 * Without this distinction, leverage would just be a cosmetic multiplier with no
 * real risk — the liquidation mechanic is what makes it meaningful.
 */

/**
 * @param {number} entryPrice
 * @param {string} side - 'long' or 'short'
 * @param {number} leverage - e.g. 5 for 5x. 1 = no leverage (spot-equivalent).
 * @returns {number} the price at which this position would be liquidated
 */
export const calculateLiquidationPrice = (entryPrice, side, leverage) => {
  if (!leverage || leverage <= 1) return null; // no leverage = no liquidation risk
  const liqFraction = 1 / leverage;
  return side === 'short'
    ? entryPrice * (1 + liqFraction)
    : entryPrice * (1 - liqFraction);
};

/**
 * @param {number} margin - the actual USDT deducted from wallet (positionSize% of balance)
 * @param {number} leverage
 * @returns {number} exposure - the notional position size P&L is calculated against
 */
export const calculateExposure = (margin, leverage) => margin * (leverage || 1);

/**
 * @param {number} entryPrice
 * @param {number} currentPrice
 * @param {string} side
 * @param {number} margin
 * @param {number} leverage
 * @returns {{ pnl: number, pnlPercent: number, exposure: number }}
 *   pnlPercent here is relative to MARGIN (not exposure) — i.e. this is the
 *   percentage return on the trader's actual capital at risk, which is the
 *   number that matters for display and matches how leverage is normally quoted.
 */
export const calculateLeveragedPnl = (entryPrice, currentPrice, side, margin, leverage) => {
  const lev = leverage || 1;
  const exposure = calculateExposure(margin, lev);
  const priceMovePercent =
    side === 'short'
      ? ((entryPrice - currentPrice) / entryPrice) * 100
      : ((currentPrice - entryPrice) / entryPrice) * 100;

  const pnl = exposure * (priceMovePercent / 100);
  // pnlPercent relative to margin, since leverage amplifies the return on margin,
  // not on exposure (exposure-relative % would always just equal priceMovePercent)
  const pnlPercent = margin > 0 ? (pnl / margin) * 100 : 0;

  return { pnl, pnlPercent, exposure };
};

/**
 * @param {number} currentPrice
 * @param {number} liquidationPrice - null if no leverage
 * @param {string} side
 * @returns {boolean}
 */
export const isLiquidated = (currentPrice, liquidationPrice, side) => {
  if (liquidationPrice === null || liquidationPrice === undefined) return false;
  return side === 'short' ? currentPrice >= liquidationPrice : currentPrice <= liquidationPrice;
};