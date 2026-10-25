import type { Admission } from './admission.types.js';

/** Counts live CV sessions, globally and per client IP. */
export class SessionLimiter {
  private sessionCount = 0;
  private readonly sessionsPerIp = new Map<string, number>();

  constructor(
    private readonly maxSessions: number,
    private readonly maxSessionsPerIp: number,
  ) {}

  tryAcquire(clientIp: string): Admission {
    const sessionsFromIp = this.sessionsPerIp.get(clientIp) ?? 0;
    if (this.sessionCount >= this.maxSessions) return { ok: false, reason: 'server-full' };
    if (this.maxSessionsPerIp > 0 && sessionsFromIp >= this.maxSessionsPerIp) return { ok: false, reason: 'ip-limit' };

    this.sessionCount++;
    this.sessionsPerIp.set(clientIp, sessionsFromIp + 1);

    let isReleased = false;
    const release = () => {
      if (isReleased) return;
      isReleased = true;
      this.sessionCount--;
      const remainingFromIp = (this.sessionsPerIp.get(clientIp) ?? 1) - 1;
      if (remainingFromIp > 0) this.sessionsPerIp.set(clientIp, remainingFromIp);
      else this.sessionsPerIp.delete(clientIp);
    };
    return { ok: true, release };
  }

  get activeSessionCount(): number {
    return this.sessionCount;
  }
}
