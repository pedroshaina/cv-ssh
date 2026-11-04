/**
 * @param {number} availablePx
 * @param {number} charPx
 * @returns {number}
 */
export function columnsFor(availablePx, charPx) {
  return charPx > 0 ? Math.floor(availablePx / charPx) : 0;
}
