const MIN_SWIPE_PX = 60;
/** How much more horizontal than vertical a drag must be to count as a swipe. */
const HORIZONTAL_RATIO = 1.5;

/**
 * Section change for a finished touch drag: 1 next, -1 previous, 0 none (it was a scroll or a tap).
 * @param {number} dx
 * @param {number} dy
 * @returns {-1 | 0 | 1}
 */
export function swipeDelta(dx, dy) {
  if (Math.abs(dx) < MIN_SWIPE_PX || Math.abs(dx) <= HORIZONTAL_RATIO * Math.abs(dy)) return 0;
  return dx < 0 ? 1 : -1;
}
