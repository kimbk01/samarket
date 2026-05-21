/**
 * PATCH mark_read `flushOpen` without cursor — 짧은 TTL·singleflight·중복 응답 재사용.
 * unread 0·동일 open_tail 반복 시 RPC·SELECT·broadcast 부하를 줄인다.
 */

export const MARK_READ_OPEN_TAIL_COALESCE_TTL_MS = (() => {
  const n = Number(process.env.SAMARKET_MARK_READ_OPEN_TAIL_COALESCE_MS);
  if (Number.isFinite(n) && n >= 80 && n <= 2000) return Math.floor(n);
  return 220;
})();

export type MarkReadOpenTailCoalesceSnapshot = {
  lastReadAt: string | null;
  lastReadMessageId: string | null;
  expiresAt: number;
};

const openTailCoalesceUntil = new Map<string, number>();
const openTailLastSuccess = new Map<string, MarkReadOpenTailCoalesceSnapshot>();

function baseKey(userId: string, roomId: string): string {
  return `${userId.trim()}\x00${roomId.trim().toLowerCase()}`;
}

export function markReadOpenTailCoalesceKey(userId: string, roomId: string): string {
  return `${baseKey(userId, roomId)}\x02open_tail`;
}

export function probeMarkReadOpenTailCoalesce(
  userId: string,
  roomId: string,
  opts: { flushOpen: boolean; requestedLastReadMessageId: string }
): { ack_coalesce_hit: 0 | 1; snapshot: MarkReadOpenTailCoalesceSnapshot | null } {
  if (!opts.flushOpen || opts.requestedLastReadMessageId.trim()) {
    return { ack_coalesce_hit: 0, snapshot: null };
  }
  const key = markReadOpenTailCoalesceKey(userId, roomId);
  const now = Date.now();
  const until = openTailCoalesceUntil.get(key);
  if (until === undefined || now >= until) {
    return { ack_coalesce_hit: 0, snapshot: null };
  }
  const snap = openTailLastSuccess.get(key);
  if (!snap || snap.expiresAt <= now) {
    return { ack_coalesce_hit: 1, snapshot: null };
  }
  return { ack_coalesce_hit: 1, snapshot: snap };
}

export function rememberMarkReadOpenTailCoalesce(
  userId: string,
  roomId: string,
  lastReadAt: string | null,
  lastReadMessageId: string | null
): void {
  const key = markReadOpenTailCoalesceKey(userId, roomId);
  const exp = Date.now() + MARK_READ_OPEN_TAIL_COALESCE_TTL_MS;
  openTailCoalesceUntil.set(key, exp);
  openTailLastSuccess.set(key, {
    lastReadAt,
    lastReadMessageId,
    expiresAt: exp,
  });
}
