import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";
import { isChatDomain } from "@/lib/chat-domain/realtime/domain-realtime-envelope";
import { serializeCommunityMessengerMessageForBump } from "@/lib/community-messenger/realtime/community-messenger-room-bump-message-snapshot";
import { publishCommunityMessengerRoomBumpFromServer } from "@/lib/community-messenger/realtime/room-bump-broadcast-server";
import { invalidateRoomBootstrapSnapshotCache } from "@/lib/community-messenger/room-bootstrap-snapshot-cache";
import { invalidateRoomBootstrapRouteCacheForRoom } from "@/lib/community-messenger/server/room-bootstrap-route-cache";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { bumpMessengerRoomTargetsForRecipients } from "@/lib/notifications/notification-target-messenger-bridge";

function dedupeParticipantUserIds(fromUserId: string, recipientUserIds: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of [fromUserId, ...recipientUserIds]) {
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** 메시지·미디어 변경 후 부트스트랩 캐시 무효화 + 원장 방 기준 Broadcast bump(거래 URL id 와 CM uuid 가 다를 때 둘 다 무효화). */
export async function publishMessengerRoomBumpAfterMutation(args: {
  rawRouteRoomId: string;
  canonicalRoomId: string;
  fromUserId: string;
  messageId?: string;
  messageCreatedAt?: string;
  /** 있으면 bump 페이로드에 실어 수신 측이 HTTP 전에 목록에 반영 가능 */
  messageForBump?: CommunityMessengerMessage | null;
  /**
   * Caller already awaited bumpMessengerRoomTargetsForRecipients before ACK.
   * Skip post-response target write so mark_read cannot race a second bump.
   */
  skipBadgeTargetBump?: boolean;
  /** Soft-delete hub eviction — no message tip */
  listAction?: "remove";
  reason?: "group_deleted";
  /** Realtime REST 타임아웃 — `publishMessengerRoomBumpBounded` 가 시도별 예산을 넘긴다 */
  timeoutMs?: number;
}): Promise<{ ok: boolean; status: number }> {
  const raw = args.rawRouteRoomId.trim();
  const canon = args.canonicalRoomId.trim();
  if (!canon || !args.fromUserId.trim()) return { ok: false, status: 0 };
  invalidateRoomBootstrapRouteCacheForRoom(canon);
  if (raw && raw !== canon) {
    invalidateRoomBootstrapRouteCacheForRoom(raw);
  }
  const fromUserId = args.fromUserId.trim();
  const rawTagged = raw && raw.toLowerCase() !== canon.toLowerCase() ? raw : "";
  const messageSnapshot =
    args.messageForBump != null ? serializeCommunityMessengerMessageForBump(args.messageForBump) : null;

  let roomMeta: {
    room_type?: unknown;
    direct_key?: unknown;
    chat_domain?: unknown;
    domain_identity?: unknown;
  } | null = null;
  let recipientUserIds: string[] = [];
  let sbForBadge: ReturnType<typeof getSupabaseServer> | null = null;
  try {
    sbForBadge = getSupabaseServer();
    const [{ data: roomRow }, { data: participantRows }] = await Promise.all([
      sbForBadge
        .from("community_messenger_rooms")
        .select("room_type, direct_key, chat_domain, domain_identity")
        .eq("id", canon)
        .maybeSingle(),
      sbForBadge.from("community_messenger_participants").select("user_id, left_at").eq("room_id", canon),
    ]);
    roomMeta =
      roomRow && typeof roomRow === "object"
        ? (roomRow as {
            room_type?: unknown;
            direct_key?: unknown;
            chat_domain?: unknown;
            domain_identity?: unknown;
          })
        : null;
    const roomType = typeof roomMeta?.room_type === "string" ? roomMeta.room_type.trim() : "";
    const isGroupRoom = roomType === "private_group" || roomType === "open_group";
    if (isGroupRoom) {
      const { listActiveGroupRecipientUserIds } = await import(
        "@/lib/community-messenger/group/group-active-membership-gate"
      );
      const activeIds = await listActiveGroupRecipientUserIds({
        roomId: canon,
        roomType,
        supabase: sbForBadge,
      });
      recipientUserIds = activeIds ?? [];
    } else {
      recipientUserIds = (participantRows ?? [])
        .map((row) =>
          row && typeof row === "object" && typeof (row as { user_id?: unknown }).user_id === "string"
            ? (row as { user_id: string }).user_id.trim()
            : ""
        )
        .filter(Boolean);
    }
    invalidateRoomBootstrapSnapshotCache(canon, dedupeParticipantUserIds(fromUserId, recipientUserIds));
  } catch {
    /* domain/badge meta best-effort */
  }

  const chatDomainRaw = typeof roomMeta?.chat_domain === "string" ? roomMeta.chat_domain.trim() : "";
  const domainIdentity =
    typeof roomMeta?.domain_identity === "string" ? roomMeta.domain_identity.trim() : "";
  const chatDomain = isChatDomain(chatDomainRaw) ? chatDomainRaw : null;
  const domainFields =
    chatDomain && domainIdentity
      ? { chatDomain, domainIdentity, eventId: args.messageId?.trim() || null }
      : {};

  /** canonical + raw 토픽을 REST 1회로 묶는다 — 이전에는 순차 2회(타임아웃 최대 2배) */
  const published = await publishCommunityMessengerRoomBumpFromServer({
    channelRoomId: canon,
    extraChannelRoomIds: rawTagged ? [raw] : undefined,
    canonicalRoomId: canon,
    fromUserId,
    messageId: args.messageId,
    messageCreatedAt: args.messageCreatedAt,
    rawRouteRoomId: rawTagged || null,
    messageSnapshot,
    listAction: args.listAction,
    reason: args.reason,
    timeoutMs: args.timeoutMs,
    ...domainFields,
  });
  const publishResult = { ok: published.ok, status: published.status };

  if (!sbForBadge) return publishResult;
  if (args.skipBadgeTargetBump === true) return publishResult;
  try {
    await bumpMessengerRoomTargetsForRecipients(sbForBadge, { roomId: canon, fromUserId });
    void import("@/lib/notifications/engine/adapters/legacy-target-bump-adapter").then((mod) =>
      mod
        .runLegacyTargetBumpNotificationEngineAdapter(sbForBadge!, {
          roomId: canon,
          fromUserId,
          recipientUserIds,
          messageId: args.messageId,
          messageCreatedAt: args.messageCreatedAt,
          roomType: typeof roomMeta?.room_type === "string" ? roomMeta.room_type : null,
          directKey: typeof roomMeta?.direct_key === "string" ? roomMeta.direct_key : null,
        })
        .catch(() => {})
    );
  } catch {
    /* badge target bump best-effort */
  }
  return publishResult;
}

export type MessengerRoomBumpBoundedResult = { ok: boolean; attempts: number; status: number };

/** M-1·M-9: 시도별 예산(ms) — 합계 ≤ 1.5s (재시도 대기 100ms 포함) */
export const MESSENGER_ROOM_BUMP_BOUNDED_ATTEMPT_TIMEOUTS_MS = [700, 600] as const;
const BOUNDED_RETRY_GAP_MS = 100;

/**
 * 메시지 저장(커밋) 성공 뒤 ACK 전에 await 하는 실시간 bump — **저장 성공/실패와 분리된 결과**.
 * - 최대 2회(700ms + 600ms), 2xx 가 아니면 1회 재시도. 절대 throw 하지 않는다.
 * - 실패해도 호출자는 200 ACK 를 보낸다(클라 실패 표시·재전송·중복 금지). 수신측은
 *   postgres_changes → 다음 bump after= → 재합류·화면 복귀 따라잡기로 회복한다.
 */
export async function publishMessengerRoomBumpBounded(
  args: Omit<Parameters<typeof publishMessengerRoomBumpAfterMutation>[0], "timeoutMs">,
  deps: {
    publish?: typeof publishMessengerRoomBumpAfterMutation;
    sleep?: (ms: number) => Promise<void>;
  } = {}
): Promise<MessengerRoomBumpBoundedResult> {
  const publish = deps.publish ?? publishMessengerRoomBumpAfterMutation;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let status = 0;
  const timeouts = MESSENGER_ROOM_BUMP_BOUNDED_ATTEMPT_TIMEOUTS_MS;
  for (let i = 0; i < timeouts.length; i += 1) {
    if (i > 0) await sleep(BOUNDED_RETRY_GAP_MS);
    try {
      /** 배지 target bump 는 첫 시도에서 이미 실행됨 — 재시도는 Realtime 발행만 (미읽음 이중 증가 방지) */
      const r = await publish({ ...args, ...(i > 0 ? { skipBadgeTargetBump: true } : {}), timeoutMs: timeouts[i] });
      status = r.status;
      if (r.ok) return { ok: true, attempts: i + 1, status };
    } catch {
      status = 0;
    }
  }
  return { ok: false, attempts: timeouts.length, status };
}
