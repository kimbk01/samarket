/**
 * Heal derived messenger badge projection from canonical participant unread.
 *
 * DO NOT delete messages / rooms / read cursors.
 * Only adjusts:
 * - community_messenger_participants.unread_count phantom → 0
 * - notification_targets chat_room is_unread to match active GD/group unread set
 * - notification_events chat/group messages for left rooms → read
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { MESSENGER_CHAT_ROOM_UNREAD_TARGET_TYPE } from "@/lib/messenger/contracts/chat-room-unread-from-notification-targets";
import { loadMessengerUnreadRoomFactsFromParticipants } from "@/lib/notifications/load-messenger-unread-room-facts-from-participants";
import {
  bumpNotificationTarget,
  clearNotificationTarget,
} from "@/lib/notifications/notification-targets";

export type MessengerBadgeHealResult = Readonly<{
  phantomUnreadCleared: number;
  targetsBumped: number;
  targetsCleared: number;
  leftRoomEventsMarkedRead: number;
  canonicalGd: number;
  canonicalGroup: number;
}>;

export async function healMessengerBadgeDerivedFromParticipants(
  sb: SupabaseClient,
  userId: string
): Promise<MessengerBadgeHealResult> {
  const uid = userId.trim();
  const empty: MessengerBadgeHealResult = {
    phantomUnreadCleared: 0,
    targetsBumped: 0,
    targetsCleared: 0,
    leftRoomEventsMarkedRead: 0,
    canonicalGd: 0,
    canonicalGroup: 0,
  };
  if (!uid) return empty;

  // 1) Phantom: unread_count>0, left_at null, empty last_message → unread_count=0
  const { data: parts } = await sb
    .from("community_messenger_participants")
    .select("room_id, unread_count, left_at")
    .eq("user_id", uid)
    .gt("unread_count", 0)
    .is("left_at", null);
  const partIds = [
    ...new Set((parts ?? []).map((p) => String(p.room_id ?? "").trim()).filter(Boolean)),
  ];
  let phantomUnreadCleared = 0;
  if (partIds.length > 0) {
    const { data: rooms } = await sb
      .from("community_messenger_rooms")
      .select("id, chat_domain, last_message, deleted_at")
      .in("id", partIds);
    const phantoms = (rooms ?? []).filter((r) => {
      const domain = String(r.chat_domain ?? "").trim();
      if (domain !== "general_direct" && domain !== "group") return false;
      if (r.deleted_at) return false;
      return !String(r.last_message ?? "").trim();
    });
    for (const room of phantoms) {
      const rid = String(room.id ?? "").trim();
      if (!rid) continue;
      const { error } = await sb
        .from("community_messenger_participants")
        .update({ unread_count: 0 })
        .eq("user_id", uid)
        .eq("room_id", rid)
        .gt("unread_count", 0);
      if (!error) phantomUnreadCleared += 1;
    }
  }

  const facts = await loadMessengerUnreadRoomFactsFromParticipants(sb, uid);
  const canonical = new Set([
    ...facts.generalDirectUnreadRoomIds,
    ...facts.groupUnreadRoomIds,
  ]);

  // 2) Targets: bump missing/false for canonical; clear true outside canonical (incl. left)
  const { data: targetRows } = await sb
    .from("notification_targets")
    .select("target_id, chat_domain, is_unread")
    .eq("user_id", uid)
    .eq("target_type", MESSENGER_CHAT_ROOM_UNREAD_TARGET_TYPE)
    .eq("scope", "consumer")
    .in("chat_domain", ["general_direct", "group"]);

  let targetsBumped = 0;
  let targetsCleared = 0;
  const existingUnread = new Set<string>();
  for (const row of targetRows ?? []) {
    const id = String(row.target_id ?? "").trim();
    if (!id) continue;
    if (row.is_unread === true) {
      existingUnread.add(id);
      if (!canonical.has(id)) {
        await clearNotificationTarget(sb, {
          userId: uid,
          targetType: MESSENGER_CHAT_ROOM_UNREAD_TARGET_TYPE,
          targetId: id,
        });
        targetsCleared += 1;
      }
    }
  }

  for (const roomId of canonical) {
    if (existingUnread.has(roomId)) continue;
    await bumpNotificationTarget(sb, {
      userId: uid,
      targetType: MESSENGER_CHAT_ROOM_UNREAD_TARGET_TYPE,
      targetId: roomId,
      scope: "consumer",
      roomId,
    });
    targetsBumped += 1;
  }

  // 3) Bell chat/group events for rooms the viewer has left → mark read
  const { data: leftParts } = await sb
    .from("community_messenger_participants")
    .select("room_id")
    .eq("user_id", uid)
    .not("left_at", "is", null);
  const leftIds = [
    ...new Set((leftParts ?? []).map((p) => String(p.room_id ?? "").trim()).filter(Boolean)),
  ];
  let leftRoomEventsMarkedRead = 0;
  if (leftIds.length > 0) {
    const now = new Date().toISOString();
    const { data: evs } = await sb
      .from("notification_events")
      .select("id")
      .eq("user_id", uid)
      .eq("unread", true)
      .is("read_at", null)
      .in("category", ["chat_message", "group_message", "chat", "group"])
      .in("room_id", leftIds);
    const ids = (evs ?? []).map((e) => String(e.id ?? "").trim()).filter(Boolean);
    if (ids.length > 0) {
      const { error } = await sb
        .from("notification_events")
        .update({ unread: false, read_at: now })
        .in("id", ids)
        .eq("user_id", uid);
      if (!error) leftRoomEventsMarkedRead = ids.length;
    }
  }

  return {
    phantomUnreadCleared,
    targetsBumped,
    targetsCleared,
    leftRoomEventsMarkedRead,
    canonicalGd: facts.domainUnreadRooms.general_direct,
    canonicalGroup: facts.domainUnreadRooms.group,
  };
}
