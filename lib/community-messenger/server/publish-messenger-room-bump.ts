import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";
import { isChatDomain } from "@/lib/chat-domain/realtime/domain-realtime-envelope";
import { serializeCommunityMessengerMessageForBump } from "@/lib/community-messenger/realtime/community-messenger-room-bump-message-snapshot";
import { publishCommunityMessengerRoomBumpFromServer } from "@/lib/community-messenger/realtime/room-bump-broadcast-server";
import { invalidateRoomBootstrapRouteCacheForRoom } from "@/lib/community-messenger/server/room-bootstrap-route-cache";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { bumpMessengerRoomTargetsForRecipients } from "@/lib/notifications/notification-target-messenger-bridge";

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
}): Promise<void> {
  const raw = args.rawRouteRoomId.trim();
  const canon = args.canonicalRoomId.trim();
  if (!canon || !args.fromUserId.trim()) return;
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
      sbForBadge.from("community_messenger_participants").select("user_id").eq("room_id", canon),
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
    recipientUserIds = (participantRows ?? [])
      .map((row) =>
        row && typeof row === "object" && typeof (row as { user_id?: unknown }).user_id === "string"
          ? (row as { user_id: string }).user_id.trim()
          : ""
      )
      .filter(Boolean);
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

  try {
    const { publishConversationUpsertAfterTipWrite } = await import(
      "@/lib/community-messenger/conversation-engine/publish-conversation-upsert"
    );
    const snap = args.messageForBump;
    const previewText =
      (snap && typeof snap.content === "string" && snap.content.trim()) || "새 메시지";
    const mt = snap?.messageType ?? "text";
    const previewKind =
      mt === "call_stub"
        ? "call"
        : mt === "image" ||
            mt === "file" ||
            mt === "system" ||
            mt === "voice" ||
            mt === "sticker" ||
            mt === "community_post_share"
          ? mt
          : "text";
    const lastActivityAt =
      args.messageCreatedAt?.trim() ||
      (snap && typeof snap.createdAt === "string" ? snap.createdAt : "") ||
      new Date().toISOString();
    const eventId = args.messageId?.trim() || `tip:${canon}:${lastActivityAt}`;
    await publishConversationUpsertAfterTipWrite({
      roomId: canon,
      eventId,
      lastActivityAt,
      previewText,
      previewKind,
      messageId: args.messageId ?? null,
    });
  } catch {
    /* conversation upsert best-effort */
  }

  if (!sbForBadge) return;
  if (args.skipBadgeTargetBump === true) return;
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
}
