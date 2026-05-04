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

/** `useSupabaseNotificationsRealtime` 전용 — 친구요청(meta.kind) 행만 스토어 반영 */
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
  if (!meta || meta.kind !== "friend_request") return;

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
    requesterLabel: requesterLabel || "상대",
    addresseeId: uid,
    addresseeLabel: "",
    status: "pending",
    direction: "incoming",
    createdAt,
  });
  if (!alreadyListed) playIncomingFriendRequestInAppAlert(requestId);
}
