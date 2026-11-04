import { DEFAULT_WEB_COLUMNS, MAX_WEB_COLUMNS, MIN_WEB_COLUMNS } from './web.constants.js';

/** The `cols` query parameter: clamped, so a visitor can't ask for an arbitrarily large render. */
export function parseColumns(raw: string | null): number | undefined {
  if (raw === null) return DEFAULT_WEB_COLUMNS;
  if (!/^\d{1,4}$/.test(raw)) return undefined;
  return Math.max(MIN_WEB_COLUMNS, Math.min(Number(raw), MAX_WEB_COLUMNS));
}
