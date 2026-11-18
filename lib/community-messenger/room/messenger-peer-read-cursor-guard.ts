import type { CommunityMessengerReadReceipt } from "@/lib/community-messenger/types";
import {
  compareMessengerReadOrderKey,
  messengerReadOrderKey,
} from "@/lib/community-messenger/room/messenger-outbound-read-state";

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
    /**
     * F5 (설계 2026-11-18 PR-1): 판정(`resolveMessengerOutboundReadState`)과 같은 비교 하나 —
     * `compareMessengerReadOrderKey`(ms → µs → id). 예전 ms+localeCompare 는 같은 ms·다른 µs 에서 판정과 어긋났다.
     */
    const ka = messengerReadOrderKey(messageCreatedAtById.get(prevMid), prevMid);
    const kb = messengerReadOrderKey(messageCreatedAtById.get(nextMid), nextMid);
    if (ka && kb) return compareMessengerReadOrderKey(kb, ka) >= 0;
  }

  if (nextAt && prev.lastReadAt) {
    return new Date(nextAt).getTime() >= new Date(prev.lastReadAt).getTime();
  }

  return true;
}

/**
 * P1 B-2 #14 (appendix-P1-send-status-design.md S3-(e)): 실시간 상대 읽음 패치 적용.
 * 새 커서 id 가 화면·스냅샷 메시지에 없어 created_at 을 모르면 `lastReadMessageCreatedAt` 을 **비운다**(null) —
 * 예전에는 옛 created_at 을 그대로 둬 「새 id + 옛 시각」 조합으로 읽음 판정이 옛 시각 기준이 될 수 있었다.
 * F4 (설계 2026-11-18 PR-1): 비운 동안 화면 판정은 직전에 계산한 키(시각·id)를 그대로 쓴다
 * (`carryDirectPeerReadCursorKey`) — 체크2→체크1 역행 없음. 행이 도착하면 그 행의 created_at 으로 전진.
 * 같은 id 의 패치(읽은 시각만 전진)는 기존 created_at 을 유지한다.
 */
export function applyPeerReadReceiptRealtimePatch(
  prev: CommunityMessengerReadReceipt,
  patch: {
    lastReadMessageId: string | null;
    lastReadAt: string | null;
    /** 화면·스냅샷에서 찾은 새 커서 id 의 created_at — 못 찾으면 null */
    createdAtForCursor: string | null;
  }
): CommunityMessengerReadReceipt {
  const nextMid = patch.lastReadMessageId?.trim() || "";
  const nextAt = patch.lastReadAt?.trim() || "";
  const prevMid = prev.lastReadMessageId?.trim() || "";
  const idChanged = Boolean(nextMid) && nextMid !== prevMid;
  const nextCreatedAt =
    patch.createdAtForCursor != null
      ? patch.createdAtForCursor
      : idChanged
        ? null
        : (prev.lastReadMessageCreatedAt ?? null);
  return {
    ...prev,
    ...(nextMid ? { lastReadMessageId: nextMid } : {}),
    ...(nextAt ? { lastReadAt: nextAt } : {}),
    lastReadMessageCreatedAt: nextCreatedAt,
  };
}
