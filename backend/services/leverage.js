
/**
 * @param {number} entryPrice
 * @param {string} side - 'long' or 'short'
 * @param {number|string} leverage - e.g. 5 for 5x. 1 = no leverage (spot-equivalent).
 * @returns {number} the price at which this position would be liquidated
 */
export const calculateLiquidationPrice = (entryPrice, side, leverage) => {
  const lev = parseFloat(leverage) || 1;
  if (lev <= 1) return null; // no leverage = no liquidation risk
  const liqFraction = 1 / lev;
  return side === 'short'
    ? entryPrice * (1 + liqFraction)
    : entryPrice * (1 - liqFraction);
};

/**
 * @param {number} margin - the actual USDT deducted from wallet (positionSize% of balance)
 * @param {number|string} leverage
 * @returns {number} exposure - the notional position size dollar P&L is calculated against
 */
export const calculateExposure = (margin, leverage) => {
  const lev = parseFloat(leverage) || 1;
  return margin * lev;
};

/**
 * @param {number} entryPrice
 * @param {number} currentPrice
 * @param {string} side
 * @param {number} margin
 * @param {number|string} leverage
 * @returns {{ pnl: number, pnlPercent: number, exposure: number }}
 *   pnlPercent is the raw price move % — leverage is NOT applied to it.
 *   pnl (dollar amount) IS leveraged — calculated against exposure (margin × leverage).
 *   Example: 0.419% price move with 5x leverage → pnlPercent stays 0.419%,
 *   but pnl is calculated against 5x the margin (i.e. the dollar amount scales with leverage,
 *   the percent does not).
 */
export const calculateLeveragedPnl = (entryPrice, currentPrice, side, margin, leverage) => {
  const lev = parseFloat(leverage) || 1;
  const exposure = calculateExposure(margin, lev);

  const priceMovePercent =
    side === 'short'
      ? ((entryPrice - currentPrice) / entryPrice) * 100
      : ((currentPrice - entryPrice) / entryPrice) * 100;

  // Dollar P&L is against full exposure (margin × leverage)
  const pnl = exposure * (priceMovePercent / 100);

  // Percent shown is the raw price move — NOT leverage-amplified
  const pnlPercent = priceMovePercent;

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
  return side === 'short'
    ? currentPrice >= liquidationPrice
    : currentPrice <= liquidationPrice;
};