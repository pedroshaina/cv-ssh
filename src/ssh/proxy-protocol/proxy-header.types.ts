export interface ProxySource {
  address: string;
  port: number;
}

export type ProxyHeader =
  /** More bytes needed. */
  | { kind: 'incomplete' }
  | { kind: 'invalid'; reason: string }
  /**
   * `length` bytes of header, followed by the SSH stream. No `source` means
   * the relay connected on its own behalf (a health check, v2 LOCAL or v1
   * UNKNOWN): keep the socket's own address.
   */
  | { kind: 'header'; length: number; source?: ProxySource };

/** A complete header read off a socket, with the SSH bytes that arrived after it. */
export type ProxyHeaderReadResult =
  | { kind: 'header'; source?: ProxySource; remainingBytes: Buffer }
  | { kind: 'invalid'; reason: string };
