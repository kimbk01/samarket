import type { CommunityMessengerReadReceipt } from "@/lib/community-messenger/types";

/**
 * Supabase Realtime `postgres_changes` 가 순서 뒤바뀌거나 재연결 시 오래된 participant 행이
 * 늦게 도착해도 `last_read_message_id` 가 역행하지 않게 한다.
 *
 * @see useMessengerRoomClientPhase1 `onParticipantPostgresForPeerRead`
 */
export function shouldAdvancePeerReadReceiptCursor(args: {
  prev: CommunityMessengerReadReceipt | null | undefined;
  nextMessageId: string | null;
  nextReadAt: string | null;
  /** 타임라인에서 확인 가능한 메시지 id → ISO created_at */
  messageCreatedAtById: Map<string, string>;
}): boolean {
  const { prev, nextMessageId, nextReadAt, messageCreatedAtById } = args;
  const nextMid = typeof nextMessageId === "string" && nextMessageId.trim() ? nextMessageId.trim() : null;
  const nextAt = typeof nextReadAt === "string" && nextReadAt.trim() ? nextReadAt.trim() : null;

  if (!nextMid && !nextAt) return false;

  if (!prev?.lastReadMessageId?.trim()) {
    return Boolean(nextMid || nextAt);
  }

  const prevMid = prev.lastReadMessageId.trim();

  if (nextMid && prevMid === nextMid) {
    if (nextAt && prev.lastReadAt) {
      return new Date(nextAt).getTime() >= new Date(prev.lastReadAt).getTime();
    }
    return false;
  }

  if (nextMid) {
    const ta = messageCreatedAtById.get(prevMid);
    const tb = messageCreatedAtById.get(nextMid);
    if (ta && tb) {
      const ca = new Date(ta).getTime();
      const cb = new Date(tb).getTime();
      if (cb > ca) return true;
      if (cb < ca) return false;
      return nextMid.localeCompare(prevMid) >= 0;
    }
  }

  if (nextAt && prev.lastReadAt) {
    return new Date(nextAt).getTime() >= new Date(prev.lastReadAt).getTime();
  }

  return true;
}
