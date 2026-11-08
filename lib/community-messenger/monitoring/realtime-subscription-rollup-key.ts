/**
 * D1 실시간 구독 실패 진단 보강 — 집계 키 세분화 (순수 함수, 클라이언트·서버 공용).
 * 설계: docs/audit/realtime-subscription-diagnostics-rollup-design-2026-11-08.md (Owner 「D1 구현 승인」 2026-11-08)
 *
 * `realtime.subscription` / `channel_subscribe` 이벤트의 DB 집계 metric 만
 * `channel_subscribe.<채널 종류>.<상태>.<단계>` 로 나눈다. 이벤트 원본·메모리 집계·SLO 는 그대로다.
 * 채널 종류는 scope 접두어 고정 표로만 정한다 — 사용자·방·글 ID 는 키에 들어가지 않는다.
 */

export const REALTIME_SUBSCRIPTION_CATEGORY = "realtime.subscription";
export const REALTIME_SUBSCRIPTION_METRIC = "channel_subscribe";

/**
 * scope 접두어 → 채널 종류. 운영 코드 scope 18종 전수(subscribeWithRetry 직접 호출 17 + 수신 전화 holder 경유 1).
 * 2026-11-08 정정: 처음 표에 `GlobalCommunityMessengerIncomingCall` 의 `community-messenger-incoming-call` 이 빠져 `other` 로 집계됨.
 */
export const REALTIME_SUBSCRIPTION_KIND_BY_SCOPE_PREFIX: readonly (readonly [string, string])[] = [
  ["community-messenger:presence-runtime", "presence"],
  ["call_v4_incoming", "call_incoming"],
  ["community-messenger-incoming-call", "call_incoming_legacy"],
  ["community-messenger-call-client:session", "call_session"],
  ["community-messenger-call-client:hangup-signal", "call_hangup"],
  ["community-messenger-group-call:session", "group_call"],
  ["community-messenger:call-logs", "call_logs"],
  ["community-messenger-home:meta", "home_meta"],
  ["community-messenger-home:rooms-in", "home_rooms"],
  ["community-messenger-room:global-bundle", "room_bundle"],
  ["community-messenger-unread-sound:", "unread_sound"],
  ["cm-room-friendship:friend-requests-global", "friend_requests"],
  ["cm-home:posts-trade-meta:", "home_trade_meta"],
  ["chat-list:posts-listing:", "chat_post_listing"],
  ["post-seller-listing:", "post_seller_listing"],
  ["trade-chat-presence:", "trade_presence"],
  ["trade-post-listing:", "trade_post_listing"],
  ["trade-listing-visibility", "trade_listing_visibility"],
];

export const REALTIME_SUBSCRIPTION_OTHER_KIND = "other";

const KINDS = new Set<string>([
  ...REALTIME_SUBSCRIPTION_KIND_BY_SCOPE_PREFIX.map(([, kind]) => kind),
  REALTIME_SUBSCRIPTION_OTHER_KIND,
]);

const STATUS_BY_RAW: Readonly<Record<string, string>> = {
  SUBSCRIBED: "subscribed",
  CHANNEL_ERROR: "channel_error",
  TIMED_OUT: "timed_out",
  CLOSED: "closed",
};
const STATUSES = new Set<string>([...Object.values(STATUS_BY_RAW), "unknown"]);
const PHASES = new Set<string>(["initial", "retry"]);

export function realtimeSubscriptionKindForScope(scope: unknown): string {
  if (typeof scope !== "string") return REALTIME_SUBSCRIPTION_OTHER_KIND;
  const s = scope.trim();
  for (const [prefix, kind] of REALTIME_SUBSCRIPTION_KIND_BY_SCOPE_PREFIX) {
    if (s.startsWith(prefix)) return kind;
  }
  return REALTIME_SUBSCRIPTION_OTHER_KIND;
}

function normalizeStatus(raw: unknown): string {
  return typeof raw === "string" && STATUS_BY_RAW[raw] ? STATUS_BY_RAW[raw] : "unknown";
}

function normalizePhase(raw: unknown): string {
  return raw === "retry" ? "retry" : "initial";
}

/**
 * 이벤트 라벨 → 세분 metric. 대상 이벤트가 아니면 원래 metric 을 그대로 돌려준다.
 * 어떤 입력에서도 예외를 던지지 않는다(통화 채널 상태 콜백 안에서도 불린다).
 */
export function realtimeSubscriptionRollupMetric(category: unknown, metric: unknown, labels: unknown): unknown {
  try {
    if (category !== REALTIME_SUBSCRIPTION_CATEGORY || metric !== REALTIME_SUBSCRIPTION_METRIC) return metric;
    const l = labels && typeof labels === "object" ? (labels as Record<string, unknown>) : {};
    const kind = realtimeSubscriptionKindForScope(l.scope);
    return `${REALTIME_SUBSCRIPTION_METRIC}.${kind}.${normalizeStatus(l.status)}.${normalizePhase(l.attemptPhase)}`;
  } catch {
    return metric;
  }
}

/** 서버 검증: 세분 metric 이 허용 표(종류·상태·단계)와 정확히 일치하는가. */
export function isAllowedRealtimeSubscriptionRollupMetric(metric: unknown): boolean {
  if (typeof metric !== "string") return false;
  const parts = metric.split(".");
  if (parts.length !== 4 || parts[0] !== REALTIME_SUBSCRIPTION_METRIC) return false;
  return KINDS.has(parts[1]) && STATUSES.has(parts[2]) && PHASES.has(parts[3]);
}
