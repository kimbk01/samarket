"use client";

import { playIncomingFriendRequestInAppAlert } from "@/lib/community-messenger/incoming-friend-request-inapp-alert";
import { useIncomingFriendRequestPopupStore } from "@/lib/community-messenger/stores/incoming-friend-request-popup-store";

function normalizeNotificationMeta(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      const o = JSON.parse(raw) as unknown;
      return typeof o === "object" && o !== null ? (o as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  if (typeof raw === "object") return raw as Record<string, unknown>;
  return null;
}

/** `useSupabaseNotificationsRealtime` 전용 — 소셜 알림(meta.kind) 행을 전역 팝업 스토어에 반영 */
function coalesceStr(...vals: unknown[]): string {
  for (const v of vals) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return "";
}

export function upsertIncomingFriendRequestPopupFromNotificationInsertRow(row: Record<string, unknown>): void {
  const meta = normalizeNotificationMeta(row.meta);
  if (!meta) return;

  if (meta.kind === "community_group_invite") {
    const roomId = coalesceStr(meta.room_id, (meta as { roomId?: unknown }).roomId);
    const uid = coalesceStr(row.user_id);
    if (!roomId || !uid) return;
    const notificationId = coalesceStr(row.id) || `group_invite:${roomId}`;
    const inviterUserId = coalesceStr(
      meta.inviter_user_id,
      (meta as { inviterUserId?: unknown }).inviterUserId
    );
    const inviterLabel = coalesceStr(meta.inviter_label, (meta as { inviterLabel?: unknown }).inviterLabel);
    const roomTitle = coalesceStr(meta.room_title, (meta as { roomTitle?: unknown }).roomTitle);
    const createdAt = typeof row.created_at === "string" ? row.created_at : new Date().toISOString();
    const store = useIncomingFriendRequestPopupStore.getState();
    store.upsertGroupInvite({
      id: notificationId,
      roomId,
      roomTitle,
      inviterUserId,
      inviterLabel,
      createdAt,
    });
    return;
  }

  if (meta.kind !== "friend_request") return;

  const requestId = coalesceStr(
    meta.request_id,
    (meta as { requestId?: unknown }).requestId
  );
  const uid = coalesceStr(row.user_id);
  if (!requestId || !uid) return;

  const requesterId = coalesceStr(meta.requester_user_id, (meta as { requesterUserId?: unknown }).requesterUserId);
  const requesterLabel = coalesceStr(meta.requester_label, (meta as { requesterLabel?: unknown }).requesterLabel);
  const createdAt = typeof row.created_at === "string" ? row.created_at : new Date().toISOString();

  const store = useIncomingFriendRequestPopupStore.getState();
  const alreadyListed = store.incomingList.some((r) => r.id === requestId);
  store.upsertIncoming({
    id: requestId,
    requesterId,
    requesterLabel,
    addresseeId: uid,
    addresseeLabel: "",
    status: "pending",
    direction: "incoming",
    createdAt,
  });
  if (!alreadyListed) playIncomingFriendRequestInAppAlert(requestId);
}
