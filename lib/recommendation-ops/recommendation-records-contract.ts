/**
 * 추천 운영·분석 기록 (이슈·알림 이벤트·자동화 실행·노출) — DB 테이블 보관 계약 (R7 후속).
 *
 * 예전: admin_settings 번들(recommendation_runtime_v1 / recommendation_analytics_v1.impressions)을 브라우저 메모리 링버퍼
 *       (200/200/300/500)에 통째로 올렸다가 다시 통째로 저장 → 상한 초과 기록 소실·동시 저장 덮어쓰기.
 * 지금: 테이블 4개(마이그레이션 20270601200000_r7_recommendation_records.sql) · 건별 INSERT/UPDATE ·
 *       목록 = 서버 페이지 RPC(limit 1..100·offset·total) · 요약 = 집계 RPC.
 * 서버·클라이언트 공용 (순수 타입·파서만).
 */
import type { RecommendationSurface } from "@/lib/types/recommendation";
import type {
  AutomationActionType,
  AutomationExecutionMode,
  AutomationExecutionStatus,
} from "@/lib/types/recommendation-automation";
import type { IncidentStatus } from "@/lib/types/recommendation-monitoring";

export const RECOMMENDATION_RECORDS_RPC = {
  incidentsPage: "admin_recommendation_incidents_page",
  alertEventsPage: "admin_recommendation_alert_events_page",
  automationExecutionsPage: "admin_recommendation_automation_executions_page",
  impressionsPage: "admin_recommendation_impressions_page",
  summary: "admin_recommendation_records_summary",
} as const;

export const RECOMMENDATION_RECORDS_TABLE = {
  incidents: "recommendation_incidents",
  alertEvents: "recommendation_alert_events",
  automationExecutions: "recommendation_automation_executions",
  impressions: "recommendation_impressions",
} as const;

/** 한 페이지 최대 크기 (RPC 도 1..100 으로 고정). 전체 결과를 자르지 않는다 — total 은 항상 전체 건수. */
export const RECOMMENDATION_RECORDS_MAX_PAGE_SIZE = 100;

export const RECOMMENDATION_SURFACES: readonly RecommendationSurface[] = ["home", "search", "shop"];
export const RECOMMENDATION_INCIDENT_STATUSES: readonly IncidentStatus[] = ["open", "acknowledged", "resolved"];
export const RECOMMENDATION_AUTOMATION_ACTION_TYPES: readonly AutomationActionType[] = [
  "auto_fallback",
  "auto_kill_switch",
  "auto_rollback",
  "auto_recovery",
  "send_escalation",
];
export const RECOMMENDATION_EXECUTION_MODES: readonly AutomationExecutionMode[] = ["dry_run", "live"];
export const RECOMMENDATION_EXECUTION_STATUSES: readonly AutomationExecutionStatus[] = [
  "success",
  "skipped",
  "failed",
];

export function isRecommendationSurface(v: unknown): v is RecommendationSurface {
  return typeof v === "string" && (RECOMMENDATION_SURFACES as readonly string[]).includes(v);
}

export function isOneOf<T extends string>(list: readonly T[], v: unknown): v is T {
  return typeof v === "string" && (list as readonly string[]).includes(v);
}

export type RecommendationRecordsPage<T> = { total: number; rows: T[] };

export function parseRecommendationRecordsPage<T>(raw: unknown): RecommendationRecordsPage<T> | null {
  if (raw == null || typeof raw !== "object") return null;
  const o = raw as { total?: unknown; rows?: unknown };
  const total = Number(o.total);
  if (!Number.isFinite(total) || total < 0 || !Array.isArray(o.rows)) return null;
  return { total, rows: o.rows as T[] };
}

/* ─── 요약 ───────────────────────────────────────────────────── */

export type RecommendationImpressionSectionSummary = {
  surface: RecommendationSurface;
  sectionKey: string;
  impressionCount: number;
  clickCount: number;
  conversionCount: number;
  scoreSum: number;
  topReason: string;
};

export type RecommendationImpressionGroupSummary = {
  key: string;
  impressionCount: number;
  clickCount: number;
  conversionCount: number;
  scoreSum: number;
};

export type RecommendationRecordsSummary = {
  incidents: {
    total: number;
    open: number;
    bySurface: Record<RecommendationSurface, { criticalOpen: number; deploymentFailureUnresolved: number }>;
  };
  alertEvents: { total: number; unacknowledged: number };
  executions: {
    total: number;
    latestCreatedAt: string | null;
    /** `since` 이후(마닐라 오늘 0시부터) 실행 수 */
    since: { total: number; success: number; failed: number; skipped: number };
    byActionType: Record<AutomationActionType, number>;
  };
  impressions: { total: number; sections: RecommendationImpressionSectionSummary[] };
  /** 실험 성과 — key = `${experimentId}|${versionId}` */
  userGroups: RecommendationImpressionGroupSummary[];
};

/** 실험 성과 집계 그룹 키 */
export function recommendationExperimentGroupKey(experimentId: string, versionId: string): string {
  return `${experimentId}|${versionId}`;
}

export type RecommendationImpressionUserGroup = { key: string; surface: RecommendationSurface; userIds: string[] };

export function emptyRecommendationRecordsSummary(): RecommendationRecordsSummary {
  return {
    incidents: {
      total: 0,
      open: 0,
      bySurface: {
        home: { criticalOpen: 0, deploymentFailureUnresolved: 0 },
        search: { criticalOpen: 0, deploymentFailureUnresolved: 0 },
        shop: { criticalOpen: 0, deploymentFailureUnresolved: 0 },
      },
    },
    alertEvents: { total: 0, unacknowledged: 0 },
    executions: {
      total: 0,
      latestCreatedAt: null,
      since: { total: 0, success: 0, failed: 0, skipped: 0 },
      byActionType: {
        auto_fallback: 0,
        auto_kill_switch: 0,
        auto_rollback: 0,
        auto_recovery: 0,
        send_escalation: 0,
      },
    },
    impressions: { total: 0, sections: [] },
    userGroups: [],
  };
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function obj(v: unknown): Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** RPC jsonb → 요약. 모양이 틀리면 null (빈 값으로 덮지 않는다 — 호출자가 실패로 처리). */
export function parseRecommendationRecordsSummary(raw: unknown): RecommendationRecordsSummary | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (!o.incidents || !o.alertEvents || !o.executions || !o.impressions) return null;
  const inc = obj(o.incidents);
  const ae = obj(o.alertEvents);
  const ex = obj(o.executions);
  const im = obj(o.impressions);
  const out = emptyRecommendationRecordsSummary();
  out.incidents.total = num(inc.total);
  out.incidents.open = num(inc.open);
  const bySurface = obj(inc.bySurface);
  for (const s of RECOMMENDATION_SURFACES) {
    const row = obj(bySurface[s]);
    out.incidents.bySurface[s] = {
      criticalOpen: num(row.criticalOpen),
      deploymentFailureUnresolved: num(row.deploymentFailureUnresolved),
    };
  }
  out.alertEvents = { total: num(ae.total), unacknowledged: num(ae.unacknowledged) };
  const since = obj(ex.since);
  const byAction = obj(ex.byActionType);
  out.executions = {
    total: num(ex.total),
    latestCreatedAt: typeof ex.latestCreatedAt === "string" ? ex.latestCreatedAt : null,
    since: {
      total: num(since.total),
      success: num(since.success),
      failed: num(since.failed),
      skipped: num(since.skipped),
    },
    byActionType: Object.fromEntries(
      RECOMMENDATION_AUTOMATION_ACTION_TYPES.map((a) => [a, num(byAction[a])])
    ) as Record<AutomationActionType, number>,
  };
  out.impressions = {
    total: num(im.total),
    sections: (Array.isArray(im.sections) ? im.sections : [])
      .map(obj)
      .filter((s) => isRecommendationSurface(s.surface))
      .map((s) => ({
        surface: s.surface as RecommendationSurface,
        sectionKey: String(s.sectionKey ?? ""),
        impressionCount: num(s.impressionCount),
        clickCount: num(s.clickCount),
        conversionCount: num(s.conversionCount),
        scoreSum: num(s.scoreSum),
        topReason: typeof s.topReason === "string" && s.topReason ? s.topReason : "-",
      })),
  };
  out.userGroups = (Array.isArray(o.userGroups) ? o.userGroups : []).map(obj).map((g) => ({
    key: String(g.key ?? ""),
    impressionCount: num(g.impressionCount),
    clickCount: num(g.clickCount),
    conversionCount: num(g.conversionCount),
    scoreSum: num(g.scoreSum),
  }));
  return out;
}

/* ─── 자동화 실행 기록 입력 ─────────────────────────────────── */

export type RecommendationAutomationExecutionInput = {
  surface: RecommendationSurface;
  incidentId: string | null;
  actionType: AutomationActionType;
  executionMode: AutomationExecutionMode;
  status: AutomationExecutionStatus;
  reason: string;
  beforeState: string;
  afterState: string;
};

/** POST 본문 검증 — 잘못된 값은 null (DB CHECK 와 같은 값 집합). */
export function parseRecommendationAutomationExecutionInput(
  raw: unknown
): RecommendationAutomationExecutionInput | null {
  const o = obj(raw);
  if (!isRecommendationSurface(o.surface)) return null;
  if (!isOneOf(RECOMMENDATION_AUTOMATION_ACTION_TYPES, o.actionType)) return null;
  if (!isOneOf(RECOMMENDATION_EXECUTION_MODES, o.executionMode)) return null;
  if (!isOneOf(RECOMMENDATION_EXECUTION_STATUSES, o.status)) return null;
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
  const incidentId = typeof o.incidentId === "string" && o.incidentId.trim() ? o.incidentId.trim() : null;
  return {
    surface: o.surface,
    incidentId,
    actionType: o.actionType,
    executionMode: o.executionMode,
    status: o.status,
    reason: str(o.reason, 2000),
    beforeState: str(o.beforeState, 64),
    afterState: str(o.afterState, 64),
  };
}
