/**
 * U1 메신저 모니터링 집계 보존 — 클라이언트 배치 → DB 시간 단위 집계 행 (순수 함수, 서버·테스트 공용).
 * 설계: docs/audit/supabase-request-surge-design-supplement-2026-11-08.md §7
 *
 * 저장 키: (category, metric, outcome, platform). ID·본문·자유 라벨은 저장하지 않는다.
 */

export const MONITORING_ROLLUP_PLATFORMS = ["web", "ios", "android"] as const;
export type MonitoringRollupPlatform = (typeof MONITORING_ROLLUP_PLATFORMS)[number] | "unknown";

/** DB 함수 `cm_monitoring_rollup_add` 가 받는 최대 행 수와 같다. */
export const MONITORING_ROLLUP_MAX_ROWS = 128;

const CATEGORY_RE = /^[a-z0-9_.:-]{1,64}$/;
const METRIC_RE = /^[a-z0-9_.:-]{1,96}$/;
const COUNT_CAP = 1_000_000;

export type MonitoringRollupRow = {
  category: string;
  metric: string;
  outcome: "" | "ok" | "error";
  event_count: number;
  value_count: number;
  value_sum: number;
  value_max: number | null;
  dropped_count: number;
};

export type MonitoringRollupEventInput = {
  category?: unknown;
  metric?: unknown;
  value?: unknown;
  labels?: unknown;
};

export type MonitoringRollupDroppedInput = {
  category?: unknown;
  metric?: unknown;
  count?: unknown;
};

export function normalizeMonitoringRollupPlatform(raw: unknown): MonitoringRollupPlatform {
  return typeof raw === "string" && (MONITORING_ROLLUP_PLATFORMS as readonly string[]).includes(raw)
    ? (raw as MonitoringRollupPlatform)
    : "unknown";
}

function normalizeKeyPart(raw: unknown, re: RegExp): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  return re.test(v) ? v : null;
}

function normalizeOutcome(labels: unknown): "" | "ok" | "error" {
  if (!labels || typeof labels !== "object") return "";
  const o = (labels as Record<string, unknown>).outcome;
  return o === "ok" || o === "error" ? o : "";
}

function clampCount(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.floor(n) : 0;
  return Math.min(Math.max(v, 0), COUNT_CAP);
}

/**
 * 클라이언트 이벤트 배치 + 버린 수 → DB 집계 행.
 * 키 검증에 실패한 항목은 버린다. 행 수가 상한을 넘으면 뒤쪽 키는 버린다.
 */
export function buildMonitoringRollupRows(
  events: readonly MonitoringRollupEventInput[],
  dropped: readonly MonitoringRollupDroppedInput[] = [],
): MonitoringRollupRow[] {
  const rows = new Map<string, MonitoringRollupRow>();
  const rowFor = (category: string, metric: string, outcome: "" | "ok" | "error"): MonitoringRollupRow | null => {
    const key = `${category}\u0000${metric}\u0000${outcome}`;
    const hit = rows.get(key);
    if (hit) return hit;
    if (rows.size >= MONITORING_ROLLUP_MAX_ROWS) return null;
    const row: MonitoringRollupRow = {
      category,
      metric,
      outcome,
      event_count: 0,
      value_count: 0,
      value_sum: 0,
      value_max: null,
      dropped_count: 0,
    };
    rows.set(key, row);
    return row;
  };

  for (const e of events) {
    const category = normalizeKeyPart(e.category, CATEGORY_RE);
    const metric = normalizeKeyPart(e.metric, METRIC_RE);
    if (!category || !metric) continue;
    const row = rowFor(category, metric, normalizeOutcome(e.labels));
    if (!row) continue;
    row.event_count = Math.min(row.event_count + 1, COUNT_CAP);
    if (typeof e.value === "number" && Number.isFinite(e.value)) {
      row.value_count = Math.min(row.value_count + 1, COUNT_CAP);
      row.value_sum += e.value;
      row.value_max = row.value_max == null ? e.value : Math.max(row.value_max, e.value);
    }
  }

  for (const d of dropped) {
    const category = normalizeKeyPart(d.category, CATEGORY_RE);
    const metric = normalizeKeyPart(d.metric, METRIC_RE);
    const count = clampCount(d.count);
    if (!category || !metric || count === 0) continue;
    const row = rowFor(category, metric, "");
    if (!row) continue;
    row.dropped_count = Math.min(row.dropped_count + count, COUNT_CAP);
  }

  return [...rows.values()];
}
