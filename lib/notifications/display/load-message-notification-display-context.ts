import type { SupabaseClient } from "@supabase/supabase-js";
import { parseCommunityMessengerRoomContextMeta } from "@/lib/community-messenger/room-context-meta";
import type { NotificationMessageRoomKind } from "@/lib/notifications/core/notification-event-types";
import { loadNotificationUserLanguage } from "@/lib/notifications/notification-user-language";
import { notifySafeT } from "@/lib/notifications/notify-safe-translate";
import {
  buildMessageNotificationDisplay,
  type MessageNotificationDisplayPayload,
} from "@/lib/notifications/display/build-message-notification-display";
import {
  resolveContextLabelFromMeta,
  resolveEffectiveRoomKind,
} from "@/lib/notifications/display/message-notification-room-kind";
import { POSTS_TABLE_READ } from "@/lib/posts/posts-db-tables";
import {
  MEMBER_IDENTITY_PROFILE_SELECT,
  resolvePublicMemberIdentity,
  type MemberIdentityProfileFields,
} from "@/lib/users/public-member-identity";

function trimText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function resolveSenderDisplayName(row: MemberIdentityProfileFields | null | undefined): string {
  const identity = resolvePublicMemberIdentity(row);
  return identity?.displayLabel?.trim() || "";
}

async function loadMessageRow(
  sb: SupabaseClient<any>,
  messageId: string,
  roomKind: NotificationMessageRoomKind
): Promise<{ messageType: string; textContent: string | null }> {
  const id = messageId.trim();
  if (!id) return { messageType: "text", textContent: null };

  if (roomKind === "trade_legacy") {
    const { data } = await sb
      .from("chat_messages")
      .select("message_type, body")
      .eq("id", id)
      .maybeSingle();
    const row = data as { message_type?: string; body?: string | null } | null;
    return {
      messageType: trimText(row?.message_type) || "text",
      textContent: trimText(row?.body) || null,
    };
  }

  const { data } = await sb
    .from("community_messenger_messages")
    .select("message_type, content, metadata")
    .eq("id", id)
    .maybeSingle();
  const row = data as { message_type?: string; content?: string | null; metadata?: unknown } | null;
  return {
    messageType: trimText(row?.message_type) || "text",
    textContent: trimText(row?.content) || null,
  };
}

type CmRoomRowForNotify = {
  title?: string | null;
  room_type?: string | null;
  direct_key?: string | null;
  summary?: string | null;
  chat_domain?: string | null;
  domain_identity_key?: string | null;
  domain_identity?: string | null;
};

type RoomContext = {
  name: string | null;
  contextLabel: string | null;
  roomType: string | null;
  directKey: string | null;
  chatDomain: string | null;
  domainIdentityKey: string | null;
};

const EMPTY_ROOM_CONTEXT: RoomContext = {
  name: null,
  contextLabel: null,
  roomType: null,
  directKey: null,
  chatDomain: null,
  domainIdentityKey: null,
};

async function loadCmRoomRowForNotify(sb: SupabaseClient<any>, roomId: string): Promise<CmRoomRowForNotify | null> {
  const id = roomId.trim();
  if (!id) return null;
  const { data: cmRoom } = await sb
    .from("community_messenger_rooms")
    .select("title, room_type, direct_key, summary, chat_domain, domain_identity_key, domain_identity")
    .eq("id", id)
    .maybeSingle();
  return (cmRoom as CmRoomRowForNotify | null) ?? null;
}

/** 방 행(있으면) → 표시 맥락. 행이 같으면 roomKind 에 따라 이름(그룹 대체 이름)만 달라지는 순수 변환. */
async function roomContextFromRow(
  sb: SupabaseClient<any>,
  roomId: string,
  row: CmRoomRowForNotify | null,
  roomKind: NotificationMessageRoomKind,
  language: Awaited<ReturnType<typeof loadNotificationUserLanguage>>
): Promise<RoomContext> {
  const id = roomId.trim();
  if (!id) return EMPTY_ROOM_CONTEXT;

  if (row) {
    const meta = parseCommunityMessengerRoomContextMeta(row.summary);
    const contextLabel = resolveContextLabelFromMeta(meta);
    const title = trimText(row.title);
    const name =
      roomKind === "group"
        ? title || notifySafeT(language, "notify_group_fallback")
        : title || null;
    return {
      name,
      contextLabel,
      roomType: trimText(row.room_type) || null,
      directKey: trimText(row.direct_key) || null,
      chatDomain: trimText(row.chat_domain) || null,
      domainIdentityKey:
        trimText(row.domain_identity_key) || trimText(row.domain_identity) || null,
    };
  }

  if (roomKind === "group") {
    // Product GROUP SSOT is community_messenger_rooms only.
    // Experimental group_rooms must never be a product notification authority.
    return {
      name: notifySafeT(language, "notify_group_fallback"),
      contextLabel: null,
      roomType: null,
      directKey: null,
      chatDomain: "group",
      domainIdentityKey: `group:${id}`,
    };
  }

  if (roomKind === "trade_legacy") {
    const { data: chatRoom } = await sb.from("chat_rooms").select("item_id").eq("id", id).maybeSingle();
    const itemId = trimText((chatRoom as { item_id?: string | null } | null)?.item_id);
    if (itemId) {
      const { data: post } = await sb.from(POSTS_TABLE_READ).select("title").eq("id", itemId).maybeSingle();
      const headline = trimText((post as { title?: string | null } | null)?.title);
      return {
        name: null,
        contextLabel: headline || null,
        roomType: "item_trade",
        directKey: null,
        chatDomain: "trade",
        domainIdentityKey: null,
      };
    }
  }

  return EMPTY_ROOM_CONTEXT;
}

async function loadRoomContext(
  sb: SupabaseClient<any>,
  roomId: string,
  roomKind: NotificationMessageRoomKind,
  language: Awaited<ReturnType<typeof loadNotificationUserLanguage>>
): Promise<RoomContext> {
  const row = await loadCmRoomRowForNotify(sb, roomId);
  return roomContextFromRow(sb, roomId, row, roomKind, language);
}

async function loadChatPreviewEnabledByUserIds(
  sb: SupabaseClient<any>,
  userIds: string[]
): Promise<Map<string, boolean>> {
  const ids = [...new Set(userIds.map((id) => id.trim()).filter(Boolean))];
  const out = new Map<string, boolean>();
  if (!ids.length) return out;
  const { data } = await sb.from("user_settings").select("user_id, chat_preview_enabled").in("user_id", ids);
  for (const row of (data ?? []) as { user_id?: string; chat_preview_enabled?: boolean | null }[]) {
    const uid = trimText(row.user_id);
    if (!uid) continue;
    out.set(uid, row.chat_preview_enabled !== false);
  }
  for (const uid of ids) {
    if (!out.has(uid)) out.set(uid, true);
  }
  return out;
}

export type BuildRecipientMessageNotificationDisplayInput = {
  roomId: string;
  messageId: string;
  senderUserId: string;
  recipientUserId: string;
  preview?: string;
  roomKind?: NotificationMessageRoomKind;
  directKey?: string | null;
};

export type MessageNotificationDisplaySharedContext = {
  resolvedRoomKind: NotificationMessageRoomKind;
  messageType: string;
  textContent: string | null;
  sender: { displayName: string; avatarUrl: string | null };
  room: { name: string | null; contextLabel: string | null };
  chatPreviewByUserId: Map<string, boolean>;
  chatDomain: string | null;
  domainIdentityKey: string | null;
};

export async function loadMessageNotificationDisplaySharedContext(
  sb: SupabaseClient<any>,
  input: {
    roomId: string;
    messageId: string;
    senderUserId: string;
    recipientUserIds: string[];
    preview?: string;
    roomKind?: NotificationMessageRoomKind;
    directKey?: string | null;
  }
): Promise<MessageNotificationDisplaySharedContext> {
  /**
   * P2: `trade_legacy` 가 아니면 메시지 행은 항상 `community_messenger_messages`(resolvedRoomKind 가 trade_legacy 로
   * 바뀌는 경우는 입력 roomKind 가 trade_legacy 일 때뿐) → 방 행·보낸 사람·메시지·미리보기 설정을 **1왕복**으로 읽고,
   * 방 맥락은 같은 방 행을 resolvedRoomKind 로 다시 변환한다(이전: 방 행을 순차 1회 + 병렬 1회 = 2왕복, 결과 동일).
   */
  if (input.roomKind !== "trade_legacy") {
    const [roomRow, { data: senderRowFast }, messageRowFast, chatPreviewFast] = await Promise.all([
      loadCmRoomRowForNotify(sb, input.roomId),
      sb
        .from("profiles")
        .select(`${MEMBER_IDENTITY_PROFILE_SELECT}`)
        .eq("id", input.senderUserId.trim())
        .maybeSingle(),
      loadMessageRow(sb, input.messageId, input.roomKind ?? "direct"),
      loadChatPreviewEnabledByUserIds(sb, input.recipientUserIds),
    ]);
    const bootstrapRoomFast = await roomContextFromRow(sb, input.roomId, roomRow, input.roomKind ?? "direct", "ko");
    const resolvedRoomKindFast = resolveEffectiveRoomKind({
      roomKind: input.roomKind,
      directKey: input.directKey ?? bootstrapRoomFast.directKey,
      roomType: bootstrapRoomFast.roomType,
      chatDomain: bootstrapRoomFast.chatDomain,
    });
    const roomFast =
      resolvedRoomKindFast === (input.roomKind ?? "direct")
        ? bootstrapRoomFast
        : await roomContextFromRow(sb, input.roomId, roomRow, resolvedRoomKindFast, "ko");
    const senderProfileFast = senderRowFast as MemberIdentityProfileFields | null;
    return {
      resolvedRoomKind: resolvedRoomKindFast,
      messageType: messageRowFast.messageType,
      textContent: messageRowFast.textContent ?? (trimText(input.preview) || null),
      sender: {
        displayName:
          resolveSenderDisplayName(senderProfileFast) ||
          notifySafeT("ko", "notify_peer_fallback"),
        avatarUrl: trimText(senderProfileFast?.avatar_url) || null,
      },
      room: {
        name: roomFast.name,
        contextLabel: roomFast.contextLabel,
      },
      chatPreviewByUserId: chatPreviewFast,
      chatDomain: roomFast.chatDomain ?? bootstrapRoomFast.chatDomain,
      domainIdentityKey: roomFast.domainIdentityKey ?? bootstrapRoomFast.domainIdentityKey,
    };
  }

  const bootstrapRoom = await loadRoomContext(sb, input.roomId, input.roomKind ?? "direct", "ko");
  const resolvedRoomKind = resolveEffectiveRoomKind({
    roomKind: input.roomKind,
    directKey: input.directKey ?? bootstrapRoom.directKey,
    roomType: bootstrapRoom.roomType,
    chatDomain: bootstrapRoom.chatDomain,
  });

  const [{ data: senderRow }, messageRow, chatPreviewByUserId, room] = await Promise.all([
    sb
      .from("profiles")
      .select(`${MEMBER_IDENTITY_PROFILE_SELECT}`)
      .eq("id", input.senderUserId.trim())
      .maybeSingle(),
    loadMessageRow(sb, input.messageId, resolvedRoomKind),
    loadChatPreviewEnabledByUserIds(sb, input.recipientUserIds),
    loadRoomContext(sb, input.roomId, resolvedRoomKind, "ko"),
  ]);

  const senderProfile = senderRow as MemberIdentityProfileFields | null;

  return {
    resolvedRoomKind,
    messageType: messageRow.messageType,
    textContent: messageRow.textContent ?? (trimText(input.preview) || null),
    sender: {
      displayName:
        resolveSenderDisplayName(senderProfile) ||
        notifySafeT("ko", "notify_peer_fallback"),
      avatarUrl: trimText(senderProfile?.avatar_url) || null,
    },
    room: {
      name: room.name,
      contextLabel: room.contextLabel,
    },
    chatPreviewByUserId,
    chatDomain: room.chatDomain ?? bootstrapRoom.chatDomain,
    domainIdentityKey: room.domainIdentityKey ?? bootstrapRoom.domainIdentityKey,
  };
}

export async function buildRecipientMessageNotificationDisplay(
  sb: SupabaseClient<any>,
  input: BuildRecipientMessageNotificationDisplayInput,
  shared?: MessageNotificationDisplaySharedContext,
  /** P2: 호출부가 다른 판정과 병렬로 미리 읽은 수신자 언어(없으면 여기서 읽음 — 기존 동작) */
  preloadedLanguage?: Awaited<ReturnType<typeof loadNotificationUserLanguage>>
): Promise<MessageNotificationDisplayPayload> {
  const ctx =
    shared ??
    (await loadMessageNotificationDisplaySharedContext(sb, {
      roomId: input.roomId,
      messageId: input.messageId,
      senderUserId: input.senderUserId,
      recipientUserIds: [input.recipientUserId],
      preview: input.preview,
      roomKind: input.roomKind,
      directKey: input.directKey,
    }));
  const language = preloadedLanguage ?? (await loadNotificationUserLanguage(sb, input.recipientUserId));
  const chatPreviewEnabled = ctx.chatPreviewByUserId.get(input.recipientUserId.trim()) !== false;

  return buildMessageNotificationDisplay({
    language,
    chatPreviewEnabled,
    roomKind: ctx.resolvedRoomKind,
    messageType: ctx.messageType,
    textContent: ctx.textContent,
    previewFallback: input.preview,
    sender: ctx.sender,
    room: ctx.room,
    roomId: input.roomId,
    chatDomain: ctx.chatDomain,
    domainIdentityKey: ctx.domainIdentityKey,
  });
}
