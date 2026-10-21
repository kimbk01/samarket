import {
  CM_ROOM_BUMP_BROADCAST_EVENT,
  communityMessengerRoomBumpChannelName,
} from "@/lib/community-messenger/realtime/community-messenger-room-bump-channel";
import { publishMessengerPrivateBroadcastFromServer } from "@/lib/community-messenger/realtime/private-broadcast-server";
import type { RealtimeRestBroadcastResult } from "@/lib/supabase/realtime-broadcast-rest";

/**
 * 발행 경로: 서비스 롤 **REST broadcast + private 토픽** (`private-broadcast-server`).
 * - 이전: 방마다 WS 채널 join(최대 8s 대기) 후 send, join 실패 시 빈 catch 로 조용히 drop.
 * - 현재: join 불필요 · 실패는 status 와 함께 로그 · 수신은 `realtime.messages` SELECT 정책(방 접근 가능자)만.
 */

/**
 * 메시지가 서버에서 확정된 직후 — 서비스 롤 Realtime 로 상대 클라이언트에 bump 전달.
 * (postgres_changes publication 이 없거나 느릴 때도 UI 가 따라잡게 하는 **영속 보강 경로**)
 *
 * `messageId`·`messageCreatedAt`·선택 `message` 는 **저지연 힌트(v2)** — 수신 측은 `message` 를
 * `fromUserId`·canonical 방 id 와 교차 검증한 뒤 즉시 병합할 수 있고, 이후 HTTP 로 정합을 맞출 수 있다.
 */
export async function publishCommunityMessengerRoomBumpFromServer(args: {
  /** Realtime 채널 접미사(구독 키). canonical 과 거래·레거시 URL id 가 다르면 둘 다 쓸 수 있다. */
  channelRoomId: string;
  /** 같은 페이로드를 함께 보낼 추가 채널(예: raw 라우트 id) — REST 1회 요청에 묶는다 (M-1 지연 예산) */
  extraChannelRoomIds?: string[];
  /** REST 타임아웃(ms) — 기본은 transport 기본값. bounded 발행은 짧은 값을 쓴다. */
  timeoutMs?: number;
  canonicalRoomId: string;
  fromUserId: string;
  messageId?: string;
  messageCreatedAt?: string;
  /** canonical 과 다른 라우트 id — 수신 측 매칭·거래 URL 구독용 */
  rawRouteRoomId?: string | null;
  /** 서비스 롤 전용 — 클라 broadcast 와 혼동되므로 수신 측에서 반드시 검증 */
  messageSnapshot?: Record<string, unknown> | null;
  /** Phase E — optional Domain envelope fields (omit when unknown / not dual-written yet). */
  chatDomain?: string | null;
  domainIdentity?: string | null;
  eventId?: string | null;
  /**
   * P3-a limited C — carry identity/generation on the wire for a future coordinator.
   * DO NOT change RT subscribe flow or consume these fields in this PR.
   */
  eventIdentity?: string | null;
  badgeGeneration?: number | null;
  /** Soft-delete: hub list remove (no message tip) */
  listAction?: "remove" | null;
  reason?: "group_deleted" | null;
}): Promise<RealtimeRestBroadcastResult> {
  const channelKey = args.channelRoomId.trim();
  const canonicalRoomId = args.canonicalRoomId.trim();
  const fromUserId = args.fromUserId.trim();
  if (!channelKey || !canonicalRoomId || !fromUserId) return { ok: false, status: 0, error: "invalid_args" };

  const messageId = typeof args.messageId === "string" ? args.messageId.trim() : "";
  const messageCreatedAt = typeof args.messageCreatedAt === "string" ? args.messageCreatedAt.trim() : "";
  const rawTagged = typeof args.rawRouteRoomId === "string" ? args.rawRouteRoomId.trim() : "";
  const atIso = new Date().toISOString();
  const payload: Record<string, unknown> = {
    v: 2,
    roomId: canonicalRoomId,
    canonicalRoomId,
    fromUserId,
    at: atIso,
  };
  if (args.listAction === "remove") {
    payload.listAction = "remove";
  }
  if (args.reason === "group_deleted") {
    payload.reason = "group_deleted";
  }
  if (rawTagged && rawTagged.toLowerCase() !== canonicalRoomId.toLowerCase()) {
    payload.rawRouteRoomId = rawTagged;
  }
  if (messageId) {
    payload.messageId = messageId;
    if (messageCreatedAt) payload.messageCreatedAt = messageCreatedAt;
  }
  const snap = args.messageSnapshot;
  if (snap && typeof snap === "object" && snap !== null && Object.keys(snap).length > 0) {
    payload.message = snap;
  }
  const chatDomain = typeof args.chatDomain === "string" ? args.chatDomain.trim() : "";
  const domainIdentity = typeof args.domainIdentity === "string" ? args.domainIdentity.trim() : "";
  const explicitEventId = typeof args.eventId === "string" ? args.eventId.trim() : "";
  if (chatDomain && domainIdentity) {
    payload.chatDomain = chatDomain;
    payload.domainIdentity = domainIdentity;
    const eventId = explicitEventId || messageId || atIso;
    if (eventId) payload.eventId = eventId;
  }

  // P3-a limited C: always attach identity + generation for future dedupe (unused this PR).
  const eventIdentity =
    (typeof args.eventIdentity === "string" && args.eventIdentity.trim()) ||
    explicitEventId ||
    messageId ||
    `${canonicalRoomId}:${atIso}`;
  payload.eventIdentity = eventIdentity;
  const badgeGeneration =
    typeof args.badgeGeneration === "number" && Number.isFinite(args.badgeGeneration)
      ? Math.max(0, Math.floor(args.badgeGeneration))
      : Date.now();
  payload.badgeGeneration = badgeGeneration;
  payload.projectionVersionMs = badgeGeneration;

  const channelKeys = [channelKey];
  for (const extra of args.extraChannelRoomIds ?? []) {
    const k = extra.trim();
    if (k && !channelKeys.some((c) => c.toLowerCase() === k.toLowerCase())) channelKeys.push(k);
  }
  return publishMessengerPrivateBroadcastFromServer({
    scope: "room_bump",
    timeoutMs: args.timeoutMs,
    messages: channelKeys.map((key) => ({
      topic: communityMessengerRoomBumpChannelName(key),
      event: CM_ROOM_BUMP_BROADCAST_EVENT,
      payload,
    })),
  });
}
