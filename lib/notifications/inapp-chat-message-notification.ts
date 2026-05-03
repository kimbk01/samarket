/**
 * 인앱 「새 메시지 / 채팅방」 알림 행 판별 — 상단 종 인박스·미읽음 카운트에서만 제외한다.
 * 친구 요청(`notification_type=system`, `meta.kind=friend_request` 등)은 포함하지 않는다.
 */

export function isInAppChatMessageNotificationRow(r: {
  notification_type?: unknown;
  meta?: unknown;
  push_kind?: unknown;
}): boolean {
  const nt = String(r?.notification_type ?? "").trim().toLowerCase();
  if (nt === "chat") return true;

  const pk = String(r?.push_kind ?? "").trim().toLowerCase();
  if (pk === "chat") return true;

  const meta = r?.meta && typeof r.meta === "object" ? (r.meta as Record<string, unknown>) : null;
  const kind = String(meta?.kind ?? "").trim().toLowerCase();
  return kind === "community_chat" || kind === "trade_chat" || kind === "group_chat";
}
