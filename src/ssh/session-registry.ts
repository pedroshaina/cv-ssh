import type { CvSession } from '../cv-session/cv-session.types.js';

export interface SessionLimits {
  /** Concurrent CV sessions across all visitors. */
  maxSessions: number;
  /** Concurrent CV sessions per client IP; 0 disables the check. */
  maxSessionsPerIp: number;
}

export type RefusalReason = 'shutting-down' | 'server-full' | 'ip-limit';

/** One CV session's place, held from admission until the session ends. */
export interface SessionSlot {
  /** Records the session holding the slot, so shutdown can end it. */
  hold(session: CvSession): void;
  /** Frees the slot; calling it again does nothing. */
  release(): void;
}

export type Admission = { ok: true; slot: SessionSlot } | { ok: false; reason: RefusalReason };

interface HeldSlot {
  clientIp: string;
  session?: CvSession;
}

/** Every open CV session: who may start one, and ending them all on shutdown. */
export class SessionRegistry {
  private readonly heldSlots = new Set<HeldSlot>();
  private shuttingDown = false;

  constructor(private readonly limits: SessionLimits) {}

  tryAdmit(clientIp: string): Admission {
    if (this.shuttingDown) return { ok: false, reason: 'shutting-down' };
    if (this.heldSlots.size >= this.limits.maxSessions) return { ok: false, reason: 'server-full' };
    const { maxSessionsPerIp } = this.limits;
    if (maxSessionsPerIp > 0 && this.sessionCountFrom(clientIp) >= maxSessionsPerIp) {
      return { ok: false, reason: 'ip-limit' };
    }

    const heldSlot: HeldSlot = { clientIp };
    this.heldSlots.add(heldSlot);
    return {
      ok: true,
      slot: {
        hold: (session) => (heldSlot.session = session),
        release: () => this.heldSlots.delete(heldSlot),
      },
    };
  }

  /** Stops admitting sessions and ends every open one. */
  endAll(): void {
    this.shuttingDown = true;
    for (const heldSlot of this.heldSlots) heldSlot.session?.end('shutdown');
  }

  get isShuttingDown(): boolean {
    return this.shuttingDown;
  }

  get activeSessionCount(): number {
    return this.heldSlots.size;
  }

  private sessionCountFrom(clientIp: string): number {
    let count = 0;
    for (const heldSlot of this.heldSlots) if (heldSlot.clientIp === clientIp) count++;
    return count;
  }
}
