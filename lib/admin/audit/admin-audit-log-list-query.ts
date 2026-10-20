/**
 * 관리자 작업 기록(`/admin/audit-logs`) 목록 API 쿼리 파서 (설계 v4 F3 · §7 필터·페이지).
 * 순수 함수 — 서버 라우트(`app/api/admin/audit-logs/route.ts`)와 테스트가 공유한다.
 *
 * 두 모드:
 * - legacy(기존 호출자: 배달 주문 감사·주문 상세·감사 상세) — `limit` 만, 필터는 target_type/target_id, 행위자 전체.
 * - paged(목록 화면) — `offset` 또는 `paged=1` 이 있으면. 행위자 기본값 = 사람 작업(시스템·cron 제외),
 *   기간은 PHT 날짜 → UTC 범위(서버), exact total.
 */

import { manilaDateRangeToUtc } from "@/lib/admin/metrics/manila-period";
import {
  isAdminListUuid,
  parseAdminListPage,
  sanitizeAdminListSearch,
  type AdminListPage,
} from "@/lib/admin/pagination/parse-admin-list-page";

/** 화면 「행위자 구분」 선택값. `human` = 시스템·cron 제외(기본). */
export const AUDIT_LOG_ACTOR_FILTERS = ["human", "admin", "user", "system", "all"] as const;
export type AuditLogActorFilter = (typeof AUDIT_LOG_ACTOR_FILTERS)[number];
export const AUDIT_LOG_DEFAULT_ACTOR_FILTER: AuditLogActorFilter = "human";

/** 자동 작업(행위자 없음) actor_type — `human` 필터가 제외한다. 운영 DB 기준 audit_logs 의 대부분. */
export const AUDIT_LOG_AUTOMATED_ACTOR_TYPES = ["system", "cron"] as const;

export const AUDIT_LOG_LEGACY_DEFAULT_LIMIT = 150;
export const AUDIT_LOG_LEGACY_MAX_LIMIT = 300;

type ParamSource = { get(name: string): string | null; has(name: string): boolean };

function str(sp: ParamSource, key: string, max = 120): string {
  return String(sp.get(key) ?? "").trim().slice(0, max);
}

export type AuditLogLegacyQuery = {
  mode: "legacy";
  limit: number;
  targetType: string | null;
  targetId: string | null;
};

export type AuditLogPagedQuery = {
  mode: "paged";
  page: AdminListPage;
  actorFilter: AuditLogActorFilter;
  /** 행위자 검색 — UUID 면 actor_id 일치, 아니면 닉네임 부분 일치 */
  actor: { kind: "id"; id: string } | { kind: "nickname"; text: string } | null;
  targetType: string | null;
  targetId: string | null;
  /** action 부분 일치 (PostgREST ilike, 와일드카드 이스케이프는 호출부) */
  actionContains: string | null;
  fromIso: string | null;
  toIso: string | null;
};

export type AuditLogListQuery = AuditLogLegacyQuery | AuditLogPagedQuery;

export function parseAuditLogActorFilter(raw: string | null | undefined): AuditLogActorFilter {
  const v = String(raw ?? "").trim().toLowerCase();
  return (AUDIT_LOG_ACTOR_FILTERS as readonly string[]).includes(v)
    ? (v as AuditLogActorFilter)
    : AUDIT_LOG_DEFAULT_ACTOR_FILTER;
}

export function parseAuditLogListQuery(sp: ParamSource): AuditLogListQuery {
  const targetType = str(sp, "target_type") || null;
  const targetId = str(sp, "target_id") || null;
  const paged = sp.has("offset") || sp.get("paged") === "1";
  if (!paged) {
    const limitRaw = parseInt(sp.get("limit") ?? String(AUDIT_LOG_LEGACY_DEFAULT_LIMIT), 10);
    const limit = Number.isFinite(limitRaw)
      ? Math.min(AUDIT_LOG_LEGACY_MAX_LIMIT, Math.max(1, limitRaw))
      : AUDIT_LOG_LEGACY_DEFAULT_LIMIT;
    return { mode: "legacy", limit, targetType, targetId };
  }

  const actorRaw = sanitizeAdminListSearch(sp.get("actor"));
  const actor = !actorRaw
    ? null
    : isAdminListUuid(actorRaw)
      ? ({ kind: "id", id: actorRaw.toLowerCase() } as const)
      : ({ kind: "nickname", text: actorRaw } as const);
  const action = sanitizeAdminListSearch(sp.get("action") ?? sp.get("q"));
  const { fromIso, toIso } = manilaDateRangeToUtc(sp.get("from"), sp.get("to"));

  return {
    mode: "paged",
    page: parseAdminListPage(sp, { defaultLimit: 20, maxLimit: 100 }),
    actorFilter: parseAuditLogActorFilter(sp.get("actor_type")),
    actor,
    targetType,
    targetId,
    actionContains: action || null,
    fromIso,
    toIso,
  };
}

/** actor_type 필터 → PostgREST 조건. null = 조건 없음. */
export function auditLogActorTypeCondition(
  filter: AuditLogActorFilter
): { op: "eq"; value: string } | { op: "not_in"; values: readonly string[] } | null {
  switch (filter) {
    case "all":
      return null;
    case "human":
      return { op: "not_in", values: AUDIT_LOG_AUTOMATED_ACTOR_TYPES };
    default:
      return { op: "eq", value: filter };
  }
}
