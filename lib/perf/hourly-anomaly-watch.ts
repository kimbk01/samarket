/**
 * D4 매시 이상 감시 — 판정(순수 함수).
 * 설계: docs/audit/supabase-request-surge-2026-11-18/structural-analysis-and-design-2026-11-26.md §5 D4 (Owner 「순서 승인」 2026-11-26)
 *
 * 왜: 하루 1번·요청당 비용만 보는 예산 감시는 「요청 수만 늘어나는 반복」(11-26 iPhone 실시간 재가입 → 방 HTTP 따라잡기)을
 * 잡지 못했고 감지까지 15~40시간 걸렸다. 여기서는 직전 1시간을 본다.
 *
 * 기준값 근거(운영 11-19~11-26 실측, 같은 설계서 부록):
 * - 실시간 재시도: 평상시 플랫폼별 시간당 재시도 최대 128(11-23 07 iOS), 대부분 30~110.
 *   폭주 = 11-23 06 iOS 594 · 11-26 09~12 iOS 521~706 (가입 성공 0~61).
 * - 한 방 몰림: 11-26 방 1개 메시지 GET 30분 112~173(시간당 약 230~330). 다른 날 하루 1위 방은 하루 225~396.
 */

/** 직전 1시간 한 플랫폼 재시도 이 수 이상이면 경보 */
export const RT_RETRY_STORM_MIN_PER_HOUR = 200;
/** 그리고 재시도 ÷ 가입 성공 이 배수 이상 (성공 0 이면 성공 1 로 본다) */
export const RT_RETRY_STORM_MIN_RATIO = 3;
/** 직전 1시간 한 자원(방 경로) 요청 이 수 이상이면 경보 — 30초에 1번꼴이 1시간 계속 */
export const HOT_RESOURCE_MIN_PER_HOUR = 120;

/**
 * 한 자원 몰림 감시 대상 라우트. 통화 세션 조회(`calls/sessions/[sessionId]`)는 통화 중 폴링이 Owner 결정(R3·E7)으로
 * 유지되는 정상 동작이라 넣지 않는다(통화 규정 — 바꾸려면 통화 분석서 먼저).
 */
export const HOT_RESOURCE_ROUTES = [
  "/api/community-messenger/rooms/[roomId]/messages",
  "/api/community-messenger/rooms/[roomId]/bootstrap",
  "/api/community-messenger/rooms/[roomId]",
] as const;

export type RealtimeSubscriptionRow = { platform: string; metric: string; event_count: number };

export type RealtimeRetryStorm = {
  kind: "realtime_retry_storm";
  platform: string;
  retries: number;
  subscribed: number;
};

export type HotResource = { kind: "hot_resource"; path: string; requests: number };

export type HourlyAnomaly = RealtimeRetryStorm | HotResource;

/** `realtime.subscription` 행(metric = `channel_subscribe.<scope>.<status>.<phase>`) → 플랫폼별 재시도·성공 */
export function evaluateRealtimeRetryStorms(rows: RealtimeSubscriptionRow[]): RealtimeRetryStorm[] {
  const by = new Map<string, { retries: number; subscribed: number }>();
  for (const r of rows) {
    const platform = (r.platform || "unknown").trim() || "unknown";
    const n = Math.max(0, Number(r.event_count) || 0);
    const cur = by.get(platform) ?? { retries: 0, subscribed: 0 };
    if (r.metric.endsWith(".retry")) cur.retries += n;
    else if (r.metric.includes(".subscribed.")) cur.subscribed += n;
    by.set(platform, cur);
  }
  const out: RealtimeRetryStorm[] = [];
  for (const [platform, v] of by) {
    if (v.retries < RT_RETRY_STORM_MIN_PER_HOUR) continue;
    if (v.retries < RT_RETRY_STORM_MIN_RATIO * Math.max(1, v.subscribed)) continue;
    out.push({ kind: "realtime_retry_storm", platform, retries: v.retries, subscribed: v.subscribed });
  }
  return out.sort((a, b) => b.retries - a.retries);
}

/** 경로별 요청 수 → 상한 넘은 자원(방 id 가 들어간 실제 경로) */
export function evaluateHotResources(rows: Array<{ path: string; requests: number }>): HotResource[] {
  return rows
    .filter((r) => r.path && Number.isFinite(r.requests) && r.requests >= HOT_RESOURCE_MIN_PER_HOUR)
    .map((r) => ({ kind: "hot_resource" as const, path: r.path, requests: r.requests }))
    .sort((a, b) => b.requests - a.requests);
}

export function summarizeAnomaly(a: HourlyAnomaly): string {
  if (a.kind === "realtime_retry_storm") return `rt_retry ${a.platform} ${a.retries}/ok ${a.subscribed}`;
  return `hot ${a.path} ${a.requests}/h`;
}

/** 같은 이상은 PHT 날짜·대상별 하루 1번만 알린다(폭주가 몇 시간 이어져도 알림 1건) */
export function anomalyDedupeKey(a: HourlyAnomaly, nowMs: number): string {
  const day = new Date(nowMs + 8 * 60 * 60_000).toISOString().slice(0, 10);
  return a.kind === "realtime_retry_storm"
    ? `hourly_anomaly:rt_retry:${a.platform}:${day}`
    : `hourly_anomaly:hot:${a.path}:${day}`;
}

/** 직전 완결 1시간(UTC 시 경계) */
export function previousHourWindow(nowMs: number): { start: number; end: number } {
  const HOUR = 60 * 60_000;
  const end = Math.floor(nowMs / HOUR) * HOUR;
  return { start: end - HOUR, end };
}
