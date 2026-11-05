/** For everything the page loads: no inline scripts or styles, nothing from other origins. */
export const PAGE_HEADERS = {
  'content-security-policy':
    "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'x-content-type-options': 'nosniff',
  'cache-control': 'no-cache',
} as const;
