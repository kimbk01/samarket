import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";
import { isChatDomain } from "@/lib/chat-domain/realtime/domain-realtime-envelope";
import { serializeCommunityMessengerMessageForBump } from "@/lib/community-messenger/realtime/community-messenger-room-bump-message-snapshot";
import { publishCommunityMessengerRoomBumpFromServer } from "@/lib/community-messenger/realtime/room-bump-broadcast-server";
import { invalidateRoomBootstrapSnapshotCache } from "@/lib/community-messenger/room-bootstrap-snapshot-cache";
import { invalidateRoomBootstrapRouteCacheForRoom } from "@/lib/community-messenger/server/room-bootstrap-route-cache";
import { publishMessengerRoomBumpAfterMutation } from "@/lib/community-messenger/server/publish-messenger-room-bump";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

/**
 * P2 — 텍스트 전송(`POST /rooms/[roomId]/messages`) 전용 방 bump.
 *
 * 전송 RPC 반환(`room_type`·`chat_domain`·`domain_identity`·`recipient_user_ids`)을 그대로 써서
 * `publishMessengerRoomBumpAfterMutation` 의 방·참가자 재조회(1~2왕복)를 없앤다. 그 외 동작은 같다:
 * - 라우트·부트스트랩 캐시 무효화(같은 대상)
 * - 답장이고 받는 사람 중 기록 하한(`cleared_at`)이 있으면 스냅샷 없이 발행(S-2 H — 답장일 때만 참가자 1회 조회)
 * - 발행은 공용 발행기 `publishCommunityMessengerRoomBumpFromServer` **호출만**(수정 없음)
 * - target bump 는 호출부가 응답 전에 이미 했다(skipBadgeTargetBump 와 같음)
 *
 * RPC 필드가 없으면(마이그레이션 미적용·dedupe 응답) 기존 `publishMessengerRoomBumpAfterMutation` 으로 폴백.
 * `publish-messenger-room-bump.ts`(통화 기록 경로 공유)는 수정하지 않는다(I7).
 */
export async function publishTextSendRoomBump(args: {
  rawRouteRoomId: string;
  canonicalRoomId: string;
  fromUserId: string;
  messageId?: string;
  messageCreatedAt?: string;
  messageForBump?: CommunityMessengerMessage | null;
  /** 전송 RPC 반환 — 하나라도 없으면 폴백 */
  prefetched?: {
    roomType: string | null;
    chatDomain: string | null;
    domainIdentity: string | null;
    recipientUserIds: string[] | null;
  } | null;
}): Promise<"fast" | "fallback" | "skipped"> {
  const raw = args.rawRouteRoomId.trim();
  const canon = args.canonicalRoomId.trim();
  const fromUserId = args.fromUserId.trim();
  if (!canon || !fromUserId) return "skipped";
  const pre = args.prefetched;
  const roomType = typeof pre?.roomType === "string" ? pre.roomType.trim() : "";
  if (!pre || !roomType || !Array.isArray(pre.recipientUserIds)) {
    await publishMessengerRoomBumpAfterMutation({
      rawRouteRoomId: args.rawRouteRoomId,
      canonicalRoomId: args.canonicalRoomId,
      fromUserId: args.fromUserId,
      messageId: args.messageId,
      messageCreatedAt: args.messageCreatedAt,
      messageForBump: args.messageForBump ?? null,
      skipBadgeTargetBump: true,
    });
    return "fallback";
  }

  invalidateRoomBootstrapRouteCacheForRoom(canon);
  if (raw && raw !== canon) invalidateRoomBootstrapRouteCacheForRoom(raw);
  const rawTagged = raw && raw.toLowerCase() !== canon.toLowerCase() ? raw : "";
  let messageSnapshot =
    args.messageForBump != null ? serializeCommunityMessengerMessageForBump(args.messageForBump) : null;

  const recipientUserIds = pre.recipientUserIds.map((id) => String(id ?? "").trim()).filter(Boolean);
  invalidateRoomBootstrapSnapshotCache(canon, [...new Set([fromUserId, ...recipientUserIds])]);

  /** S-2 H: 답장 + 받는 사람 기록 하한 → 인용 원문 스냅샷을 보내지 않는다(받는 쪽은 HTTP 로 정합) */
  if (messageSnapshot && String(args.messageForBump?.replyToMessageId ?? "").trim()) {
    try {
      const sb = getSupabaseServer();
      const { data: participantRows } = await sb
        .from("community_messenger_participants")
        .select("user_id, cleared_at")
        .eq("room_id", canon);
      const anyCleared = (participantRows ?? []).some(
        (row) =>
          row &&
          typeof row === "object" &&
          (row as { user_id?: unknown }).user_id !== fromUserId &&
          typeof (row as { cleared_at?: unknown }).cleared_at === "string" &&
          String((row as { cleared_at?: string }).cleared_at).trim() !== ""
      );
      if (anyCleared) messageSnapshot = null;
    } catch {
      /** 판정 불가 → 보수적으로 스냅샷 없이 발행 */
      messageSnapshot = null;
    }
  }

  const chatDomainRaw = typeof pre.chatDomain === "string" ? pre.chatDomain.trim() : "";
  const domainIdentity = typeof pre.domainIdentity === "string" ? pre.domainIdentity.trim() : "";
  const chatDomain = isChatDomain(chatDomainRaw) ? chatDomainRaw : null;
  const domainFields =
    chatDomain && domainIdentity ? { chatDomain, domainIdentity, eventId: args.messageId?.trim() || null } : {};

  await publishCommunityMessengerRoomBumpFromServer({
    channelRoomId: canon,
    canonicalRoomId: canon,
    fromUserId,
    messageId: args.messageId,
    messageCreatedAt: args.messageCreatedAt,
    rawRouteRoomId: rawTagged || null,
    messageSnapshot,
    ...domainFields,
  });
  if (rawTagged) {
    await publishCommunityMessengerRoomBumpFromServer({
      channelRoomId: raw,
      canonicalRoomId: canon,
      fromUserId,
      messageId: args.messageId,
      messageCreatedAt: args.messageCreatedAt,
      rawRouteRoomId: rawTagged,
      messageSnapshot,
      ...domainFields,
    });
  }
  return "fast";
}
