import { MAX_TEXT_WIDTH, MIN_TEXT_WIDTH, PADDING_X } from '../layout.constants.js';

/** Columns for wrapped text in a terminal this wide: side padding off, then clamped. */
export function textWidthFor(columns: number): number {
  return Math.max(MIN_TEXT_WIDTH, Math.min(columns - 2 * PADDING_X, MAX_TEXT_WIDTH));
}
