/**
 * Messenger inbox (general_direct + group) List unread SSOT = notification_targets
 * (target_type=chat_room, scope=consumer, target_id=room_id) — same axis as hub-bundle
 * chat_domain_general_direct / chat_domain_group.
 *
 * DO NOT use community_messenger_participants.unread_count alone for list badges:
 * stale counters remain after targets clear (measured GD room d3867e4c: list 20, targets 0).
 *
 * Match key: room_id (== target_id). NOT orderId (buyer_order-only).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const MESSENGER_CHAT_ROOM_UNREAD_TARGET_TYPE = "chat_room" as const;

export type MessengerChatRoomUnreadDomain = "general_direct" | "group";

/** Binary presence from targets; when present keep message magnitude from participant. */
export function resolveMessengerChatRoomListUnreadCount(input: {
  roomId: string;
  unreadTargetRoomIds: ReadonlySet<string>;
  participantUnreadCount?: number | null;
}): number {
  const roomId = input.roomId.trim();
  if (!roomId || !input.unreadTargetRoomIds.has(roomId)) return 0;
  const n = Math.max(0, Math.floor(Number(input.participantUnreadCount) || 0));
  return Math.max(1, n);
}

export function buildMessengerChatRoomUnreadTargetRoomIds(
  rows: ReadonlyArray<{
    target_id?: string | null;
    chat_domain?: string | null;
    target_type?: string | null;
    is_unread?: boolean | null;
  }>,
  domains: ReadonlyArray<MessengerChatRoomUnreadDomain>
): ReadonlySet<string> {
  const allow = new Set(domains);
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.is_unread === false) continue;
    if (row.target_type && row.target_type !== MESSENGER_CHAT_ROOM_UNREAD_TARGET_TYPE) continue;
    const domain = String(row.chat_domain ?? "").trim();
    if (!allow.has(domain as MessengerChatRoomUnreadDomain)) continue;
    const id = String(row.target_id ?? "").trim();
    if (id) ids.add(id);
  }
  return ids;
}

export async function loadMessengerChatRoomUnreadTargetRoomIds(
  sb: SupabaseClient,
  input: {
    viewerUserId: string;
    domains: ReadonlyArray<MessengerChatRoomUnreadDomain>;
  }
): Promise<ReadonlySet<string>> {
  const uid = input.viewerUserId.trim();
  if (!uid || input.domains.length === 0) return new Set();
  const { data, error } = await sb
    .from("notification_targets")
    .select("target_id, chat_domain, target_type, is_unread")
    .eq("user_id", uid)
    .eq("target_type", MESSENGER_CHAT_ROOM_UNREAD_TARGET_TYPE)
    .eq("is_unread", true)
    .eq("scope", "consumer")
    .in("chat_domain", [...input.domains]);
  if (error) {
    console.warn("[loadMessengerChatRoomUnreadTargetRoomIds]", error.message);
    return new Set();
  }
  return buildMessengerChatRoomUnreadTargetRoomIds(
    (data ?? []) as Array<{
      target_id: string | null;
      chat_domain: string | null;
      target_type: string | null;
      is_unread: boolean | null;
    }>,
    input.domains
  );
}
