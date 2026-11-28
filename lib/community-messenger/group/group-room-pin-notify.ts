import type { SupabaseClient } from "@supabase/supabase-js";
import { groupRoomIdentity } from "@/lib/chat-domain/room-identity";
import { createNotificationEvent } from "@/lib/notifications/core/notification-event-repository";
import { categoryForEventType } from "@/lib/notifications/core/notification-policy";
import { dispatchNotificationPushIfAllowed } from "@/lib/notifications/pipeline/notify-push-dispatcher";
import { notifySafeT } from "@/lib/notifications/notify-safe-translate";
import { loadNotificationUserLanguage } from "@/lib/notifications/notification-user-language";
import { notificationCopyMeta } from "@/lib/notifications/notification-stored-copy";

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

  // Same GROUP domain authority as working group_message notify path.
  const domain = groupRoomIdentity(roomId);

  const { data: participants } = await (sb as any)
    .from("community_messenger_participants")
    .select("user_id, is_muted")
    .eq("room_id", roomId)
    .is("left_at", null)
    .is("blocked_hidden_at", null);
  /**
   * 방 알림을 끈 사람 = 메시지 알림과 같은 규칙 (모임 R5 A23): 알림함 행은 만들고 푸시·소리는 끈다
   * (`mutedSnapshot:true` · `muted_room` · 푸시 발송 안 함). 같은 조회에 열만 더해 요청 수는 그대로다.
   */
  const recipients = ((participants ?? []) as Array<{ user_id?: string; is_muted?: boolean | null }>)
    .map((r) => ({ userId: trimText(r.user_id), muted: r.is_muted === true }))
    .filter((r) => r.userId && r.userId !== actorUserId);

  for (const { userId: recipientUserId, muted } of recipients) {
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
      mutedSnapshot: muted,
      pushSuppressedReason: muted ? "muted_room" : null,
      soundSuppressedReason: muted ? "muted_room" : null,
      unread: true,
      chatDomain: domain.domain,
      domainIdentityKey: domain.identityKey,
      /** 알림함이 보는 사람 언어로 다시 그리는 키(설계 §4-3) — 목적지·분류 필드는 넣지 않는다 */
      displayPayload: {
        legacyMeta: notificationCopyMeta({
          titleKey: "notify_group_pin_message_title",
          messageKey: input.pinned ? "notify_group_pin_message_body_pinned" : "notify_group_pin_message_body_unpinned",
        }),
      },
    });
    if (created.ok && created.row && !muted) {
      await dispatchNotificationPushIfAllowed(sb, created.row).catch(() => {});
    }
  }
}
