import type { SupabaseClient } from "@supabase/supabase-js";
import { cmStoreOrderHeadline } from "@/lib/community-messenger/cm-home-list-copy";
import { parseCommunityMessengerRoomContextMeta } from "@/lib/community-messenger/room-context-meta";
import type { NotificationMessageRoomKind } from "@/lib/notifications/core/notification-event-types";
import { loadNotificationUserLanguage } from "@/lib/notifications/notification-user-language";
import { notifySafeT } from "@/lib/notifications/notify-safe-translate";
import {
  buildMessageNotificationDisplay,
  type MessageNotificationDisplayPayload,
} from "@/lib/notifications/display/build-message-notification-display";
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

function resolveEffectiveRoomKind(input: {
  roomKind?: NotificationMessageRoomKind;
  directKey?: string | null;
  roomType?: string | null;
  chatDomain?: string | null;
}): NotificationMessageRoomKind {
  const domain = trimText(input.chatDomain);
  if (domain === "general_direct") return "direct";
  if (domain === "group") return "group";
  if (domain === "trade") return "trade";
  if (domain === "store_order") return "store_order";
  if (input.roomKind) return input.roomKind;
  const roomType = trimText(input.roomType);
  if (roomType === "private_group" || roomType === "open_group") return "group";
  const dk = trimText(input.directKey);
  if (dk.startsWith("trade_pc:") || dk.startsWith("trade_item:")) return "trade";
  if (dk.startsWith("store_order:") || dk.startsWith("trade_order:")) return "store_order";
  return "direct";
}

function resolveContextLabelFromMeta(
  meta: ReturnType<typeof parseCommunityMessengerRoomContextMeta>
): string | null {
  if (!meta) return null;
  if (meta.kind === "trade") {
    return trimText(meta.headline) || null;
  }
  if (meta.kind === "delivery") {
    const store = trimText(meta.storeDisplayName);
    const orderNo = trimText(meta.orderNo);
    if (store) return cmStoreOrderHeadline(store, orderNo);
    return trimText(meta.headline) || null;
  }
  return trimText(meta.headline) || null;
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

async function loadRoomContext(
  sb: SupabaseClient<any>,
  roomId: string,
  roomKind: NotificationMessageRoomKind,
  language: Awaited<ReturnType<typeof loadNotificationUserLanguage>>
): Promise<{
  name: string | null;
  contextLabel: string | null;
  roomType: string | null;
  directKey: string | null;
  chatDomain: string | null;
  domainIdentityKey: string | null;
}> {
  const id = roomId.trim();
  if (!id) {
    return {
      name: null,
      contextLabel: null,
      roomType: null,
      directKey: null,
      chatDomain: null,
      domainIdentityKey: null,
    };
  }

  const { data: cmRoom } = await sb
    .from("community_messenger_rooms")
    .select("title, room_type, direct_key, summary, chat_domain, domain_identity_key, domain_identity")
    .eq("id", id)
    .maybeSingle();
  const row = cmRoom as {
    title?: string | null;
    room_type?: string | null;
    direct_key?: string | null;
    summary?: string | null;
    chat_domain?: string | null;
    domain_identity_key?: string | null;
    domain_identity?: string | null;
  } | null;

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
    const { data: groupRoom } = await sb.from("group_rooms").select("title").eq("id", id).maybeSingle();
    const title = trimText((groupRoom as { title?: string | null } | null)?.title);
    return {
      name: title || notifySafeT(language, "notify_group_fallback"),
      contextLabel: null,
      roomType: "private_group",
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

  return {
    name: null,
    contextLabel: null,
    roomType: null,
    directKey: null,
    chatDomain: null,
    domainIdentityKey: null,
  };
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
  shared?: MessageNotificationDisplaySharedContext
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
  const language = await loadNotificationUserLanguage(sb, input.recipientUserId);
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
