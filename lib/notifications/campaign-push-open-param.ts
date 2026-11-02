/**
 * 푸시 전용 알림 열람 기록 (docs/audit/push-only-open-tracking-design-2026-11-02.md · Owner 승인 2026-11-02).
 * 푸시 전용(push_only) 알림은 앱 안 알림 행·알림 id 가 없다 → 목적지 주소에 발송 회차 id 를 싣고,
 * 앱이 그 주소를 열면 `/api/me/notifications/campaign-push-opened` 로 본인 푸시 기록을 열람으로 바꾼 뒤 지운다.
 * Android(32~ · safeInternalRoute)·iOS·웹(resolveSafeNotificationInternalRoute) 모두 쿼리를 보존한다.
 */
export const CAMPAIGN_PUSH_OPEN_PARAM = "notif_open";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isCampaignOccurrenceId(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v.trim());
}

/** 내부 경로(`/…`)에 회차 표시를 붙인다. 해시는 뒤에 그대로 둔다. */
export function appendCampaignPushOpenParam(route: string, occurrenceId: string): string {
  if (!route.startsWith("/") || !isCampaignOccurrenceId(occurrenceId)) return route;
  const hashAt = route.indexOf("#");
  const base = hashAt >= 0 ? route.slice(0, hashAt) : route;
  const hash = hashAt >= 0 ? route.slice(hashAt) : "";
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}${CAMPAIGN_PUSH_OPEN_PARAM}=${encodeURIComponent(occurrenceId.trim())}${hash}`;
}
