export type Admission = { ok: true; release: () => void } | { ok: false; reason: 'server-full' | 'ip-limit' };

/** Counts live CV sessions, globally and per client IP. */
export class SessionLimiter {
  private total = 0;
  private readonly perIp = new Map<string, number>();

  constructor(
    private readonly maxSessions: number,
    private readonly maxSessionsPerIp: number,
  ) {}

  tryAcquire(ip: string): Admission {
    const fromIp = this.perIp.get(ip) ?? 0;
    if (this.total >= this.maxSessions) return { ok: false, reason: 'server-full' };
    if (this.maxSessionsPerIp > 0 && fromIp >= this.maxSessionsPerIp) return { ok: false, reason: 'ip-limit' };

    this.total++;
    this.perIp.set(ip, fromIp + 1);

    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      this.total--;
      const remaining = (this.perIp.get(ip) ?? 1) - 1;
      if (remaining > 0) this.perIp.set(ip, remaining);
      else this.perIp.delete(ip);
    };
    return { ok: true, release };
  }

  get active(): number {
    return this.total;
  }
}
