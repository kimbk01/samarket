import { communityMessengerRoomResourcePath } from "@/lib/community-messenger/messenger-room-bootstrap";
import { isUuidLikeString } from "@/lib/shared/uuid-string";

export type MessengerCatchUpAnchorMessage = {
  id?: string | null;
  createdAt?: string | null;
  pending?: boolean;
};

/** 시간상 최신 확정 UUID — `after=` catch-up 앵커. 배열 끝/가상화 순서에 의존하지 않는다. */
export function selectNewestConfirmedMessageAnchor(
  messages: MessengerCatchUpAnchorMessage[]
): string | null {
  let anchorId: string | null = null;
  let bestTime = -Infinity;
  let bestIdForTie = "";
  for (const m of messages) {
    if (m.pending) continue;
    const mid = String(m?.id ?? "").trim();
    if (!mid || mid.startsWith("pending:") || !isUuidLikeString(mid)) continue;
    const t = new Date(String(m.createdAt ?? "")).getTime();
    if (!Number.isFinite(t)) continue;
    if (t > bestTime || (t === bestTime && mid > bestIdForTie)) {
      bestTime = t;
      anchorId = mid;
      bestIdForTie = mid;
    }
  }
  return anchorId;
}

export function buildCommunityMessengerMessagesAfterPath(
  roomId: string,
  afterMessageId: string,
  limit = 80
): string {
  const id = roomId.trim();
  const after = afterMessageId.trim();
  return `${communityMessengerRoomResourcePath(id)}/messages?after=${encodeURIComponent(after)}&limit=${limit}`;
}

const catchUpInflight = new Map<string, Promise<boolean>>();

/** Same room+cursor concurrent catch-up shares one GET. */
export function runMessengerRoomCatchUpSingleFlight(
  roomId: string,
  afterMessageId: string,
  run: () => Promise<boolean>
): Promise<boolean> {
  const key = `${roomId.trim()}:${afterMessageId.trim()}`;
  const existing = catchUpInflight.get(key);
  if (existing) return existing;
  const pending = run().finally(() => {
    if (catchUpInflight.get(key) === pending) catchUpInflight.delete(key);
  });
  catchUpInflight.set(key, pending);
  return pending;
}
