import type { SupabaseClient } from "@supabase/supabase-js";
import { createNotificationEvent } from "@/lib/notifications/core/notification-event-repository";
import { categoryForEventType } from "@/lib/notifications/core/notification-policy";
import { dispatchNotificationPushIfAllowed } from "@/lib/notifications/pipeline/notify-push-dispatcher";
import { notifySafeT } from "@/lib/notifications/notify-safe-translate";
import { loadNotificationUserLanguage } from "@/lib/notifications/notification-user-language";

function trimText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export async function notifyGroupPinMessage(
  sb: SupabaseClient<any>,
  input: { roomId: string; actorUserId: string; messageId: string; pinned: boolean }
): Promise<void> {
  const roomId = trimText(input.roomId);
  const messageId = trimText(input.messageId);
  const actorUserId = trimText(input.actorUserId);
  if (!roomId || !messageId || !actorUserId) return;

  const { data: participants } = await (sb as any)
    .from("community_messenger_participants")
    .select("user_id")
    .eq("room_id", roomId)
    .is("left_at", null)
    .is("blocked_hidden_at", null);
  const recipients = ((participants ?? []) as Array<{ user_id?: string }>)
    .map((r) => trimText(r.user_id))
    .filter((id) => id && id !== actorUserId);

  for (const recipientUserId of recipients) {
    const language = await loadNotificationUserLanguage(sb, recipientUserId);
    const title = notifySafeT(language, "notify_group_pin_message_title");
    const body = input.pinned
      ? notifySafeT(language, "notify_group_pin_message_body_pinned")
      : notifySafeT(language, "notify_group_pin_message_body_unpinned");
    const dedupeKey = `pin:${roomId}:${messageId}:${input.pinned ? "on" : "off"}:${recipientUserId}`;
    const created = await createNotificationEvent(sb, {
      userId: recipientUserId,
      type: "pin_message",
      category: categoryForEventType("pin_message"),
      roomId,
      messageId,
      actorUserId,
      title,
      body,
      dedupeKey,
      mutedSnapshot: false,
      pushSuppressedReason: null,
      soundSuppressedReason: null,
      unread: true,
    });
    if (created.ok && created.row) {
      await dispatchNotificationPushIfAllowed(sb, created.row).catch(() => {});
    }
  }
}
