/**
 * notification_events 의 종류·매장 판정 입력 — 단일 정의 (재감사 D-1, docs/audit/notification-full-reaudit-2026-10-27.md).
 *
 * 저장 형태가 두 가지다: 신규 writer 는 `display_payload.legacyMeta.kind`, 예전 backfill 행은
 * `display_payload.kind`(최상위, 운영 888행). 숫자(A)·목록·탭·라벨·오너 판정이 서로 다른 곳에서 kind 를
 * 읽어 표면마다 결과가 갈렸다. 모든 판정은 이 함수들만 쓴다.
 */

function record(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** legacyMeta.kind → 최상위 kind. */
export function resolveNotificationEventKind(displayPayload: unknown): string {
  const payload = record(displayPayload);
  return text(record(payload?.legacyMeta)?.kind) || text(payload?.kind);
}

/** legacyMeta.store_id → 최상위 store_id / storeId. */
export function resolveNotificationEventStoreId(displayPayload: unknown): string | null {
  const payload = record(displayPayload);
  const legacyMeta = record(payload?.legacyMeta);
  return text(legacyMeta?.store_id) || text(payload?.store_id) || text(payload?.storeId) || null;
}

/**
 * 메신저(채팅) 소속 — 알림종·알림센터·앱 아이콘 A 에 넣지 않는다. 앱 밖 푸시는 유지.
 * Owner 결정 2026-10-27 (선물·친구) + 이동 경로 증거(모두 /community-messenger…, 그룹 초대 포함).
 */
export const MESSENGER_OWNED_NOTIFICATION_KINDS: ReadonlySet<string> = new Set([
  "friend_request",
  "friend_accepted",
  "friend_rejected",
  "community_group_invite",
  "gift_transfer_offered",
  "gift_transfer_accepted",
  "gift_transfer_rejected",
  "gift_transfer_cancelled",
]);

export function isMessengerOwnedNotificationKind(kind: string | null | undefined): boolean {
  return MESSENGER_OWNED_NOTIFICATION_KINDS.has(String(kind ?? "").trim());
}
