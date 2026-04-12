/**
 * 커뮤니티 메신저 성능·품질 모니터링 — 구조화 이벤트 스키마
 *
 * - `category` + `metric` 으로 집계 키를 만든다.
 * - `labels` 에는 roomId 전체 대신 `roomIdSuffix`(마지막 8자) 등 비식별 위주.
 */

export type MessengerMonitoringSource = "client" | "server";

export type MessengerMonitoringCategory =
  | "chat.room_load"
  | "chat.message_latency"
  | "call.connection"
  | "call.network"
  | "call.reconnect"
  | "api.community_messenger"
  | "db.community_messenger";

export type MessengerMonitoringEvent = {
  ts: number;
  category: MessengerMonitoringCategory;
  /** 세부 지표 키 (예: bootstrap_get, message_post) */
  metric: string;
  source: MessengerMonitoringSource;
  /** ms 또는 퍼센트 등 단일 숫자 값 */
  value?: number;
  unit?: "ms" | "percent" | "ratio" | "count";
  labels?: Record<string, string>;
  /** 클라이언트가 올린 원시 이벤트 구분용 */
  kind?: string;
};

export type MessengerMonitoringAlert = {
  ts: number;
  category: MessengerMonitoringCategory;
  metric: string;
  message: string;
  threshold: number;
  observed: number;
  labels?: Record<string, string>;
};

export type MessengerMonitoringSummary = {
  generatedAt: string;
  windowEvents: number;
  /** 카테고리별 평균·최근값 (서버가 수집한 샘플) */
  aggregates: Record<
    string,
    {
      count: number;
      sum: number;
      avg: number;
      last: number;
      lastAt: number;
    }
  >;
  /** API 라벨별 */
  apiByRoute: Record<string, { count: number; avgMs: number; lastMs: number }>;
  recentAlerts: MessengerMonitoringAlert[];
  /** 클라이언트에서 최근 전송된 이벤트 요약 (동일 집계 키) */
  clientAggregates: Record<string, { count: number; avg: number; last: number }>;
};
