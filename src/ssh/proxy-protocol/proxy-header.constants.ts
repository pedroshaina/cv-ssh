export const V2_SIGNATURE = Buffer.from('\r\n\r\n\0\r\nQUIT\n', 'latin1');
export const V2_FIXED_LENGTH = 16;
export const V1_PREFIX = Buffer.from('PROXY ', 'latin1');
/** Longest v1 line allowed by the spec, CRLF included. */
export const V1_MAX_LENGTH = 107;
