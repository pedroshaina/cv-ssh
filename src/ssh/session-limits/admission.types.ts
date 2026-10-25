export type RefusalReason = 'server-full' | 'ip-limit';

export type Admission = { ok: true; release: () => void } | { ok: false; reason: RefusalReason };
