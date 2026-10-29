/**
 * 제재 기록(`/admin/reports/log`) — 목록 API 계약 (설계 v4 F3).
 * 원장 = `report_actions`(처리 이력) + `reports`(대상·사유·상태). RS-02 커서 모드는 `sanctions`(기능 제한·경고) ·
 * `user_moderation_events`(계정 정지·차단·복구)를 조회 전용으로 더한다. 브라우저 직접 조회 대신
 * `GET /api/admin/reports/sanction-ledger` (권한 키 `reports`) 가 서버에서 조회한다.
 * 순수 함수·타입만 (client-safe).
 */

import { manilaDateRangeToUtc } from "@/lib/admin/metrics/manila-period";
import {
  isAdminListUuid,
  parseAdminListPage,
  sanitizeAdminListSearch,
  type AdminListPage,
} from "@/lib/admin/pagination/parse-admin-list-page";
import { REPORT_ACTION_TYPE_KEYS } from "@/lib/admin-reports/report-admin-i18n-keys";

export interface AdminSanctionLedgerRow {
  action_id: string;
  report_id: string;
  action_type: string;
  action_note: string | null;
  admin_id: string | null;
  admin_nickname: string | null;
  action_at: string;
  target_type: string;
  target_id: string;
  /** 대상이 회원일 때 닉네임 */
  target_nickname: string | null;
  reporter_id: string;
  reason_code: string;
  reason_text: string | null;
  report_status: string;
  resolved_at: string | null;
  /**
   * RS-02 원장 (커서 모드) — report_actions(신고 처리 기록) · sanctions(거래·커뮤니티 기능 제한·경고) ·
   * user_moderation_events(계정 정지·차단·복구). 예전 offset 모드 응답에는 없다 (= report_actions).
   */
  source?: SanctionLedgerSource;
  /** 처리·원문 화면 링크 (도메인 화면) */
  source_href?: string | null;
  /** sanctions.scope (platform · trade · community) */
  scope?: string | null;
  /** sanctions 종료 시각 · 해제 시각 */
  end_at?: string | null;
  revoked_at?: string | null;
  /** user_moderation_events 상태 전이 */
  from_status?: string | null;
  to_status?: string | null;
}

export const SANCTION_LEDGER_SOURCES = ["report_actions", "sanctions", "user_moderation_events"] as const;
export type SanctionLedgerSource = (typeof SANCTION_LEDGER_SOURCES)[number];

export const SANCTION_LEDGER_SOURCE_LABEL: Record<SanctionLedgerSource, { ko: string; en: string }> = {
  report_actions: { ko: "신고 처리", en: "Report action" },
  sanctions: { ko: "기능 제한·경고", en: "Restriction / warning" },
  user_moderation_events: { ko: "계정 조치", en: "Account action" },
};

/** sanctions.scope → 그 제한을 처리하는 도메인 화면 (열람 권한 판정 · 행 링크) */
export const SANCTION_SCOPE_VIEW_HREF: Record<string, string> = {
  trade: "/admin/trade/restrictions",
  community: "/admin/community/restrictions",
  /** platform(예전 경고·채팅 금지 등) — 회원 상세 = 이 API 와 같은 `users` 키 */
  platform: "/admin/users",
};
export const SANCTION_SCOPES = ["platform", "trade", "community"] as const;

export type SanctionLedgerExclusion = {
  source: SanctionLedgerSource;
  /** sanctions 일부 scope 만 빠질 때 */
  scope?: string;
  reason: "permission" | "filter";
};

/**
 * 포함 원장 결정 (순수) — 처리 유형(`action_type`, report_actions 어휘) 조건은 다른 원장에 적용할 수 없어 제외하고 알린다.
 * sanctions 는 scope 별로 그 도메인 화면 열람 권한이 있을 때만 포함 (없는 scope 는 행·건수에서 제외 + 알림).
 */
export function resolveSanctionLedgerSources(
  q: Pick<SanctionLedgerQuery, "actionType">,
  canViewScope: (scope: (typeof SANCTION_SCOPES)[number]) => boolean
): { included: SanctionLedgerSource[]; sanctionScopes: string[]; excluded: SanctionLedgerExclusion[] } {
  const excluded: SanctionLedgerExclusion[] = [];
  if (q.actionType) {
    excluded.push({ source: "sanctions", reason: "filter" }, { source: "user_moderation_events", reason: "filter" });
    return { included: ["report_actions"], sanctionScopes: [], excluded };
  }
  const sanctionScopes: string[] = [];
  for (const scope of SANCTION_SCOPES) {
    if (canViewScope(scope)) sanctionScopes.push(scope);
    else excluded.push({ source: "sanctions", scope, reason: "permission" });
  }
  const included: SanctionLedgerSource[] = ["report_actions", "user_moderation_events"];
  if (sanctionScopes.length) included.splice(1, 0, "sanctions");
  return { included, sanctionScopes, excluded };
}

/** sanctions 행 → 제재 기록 행 */
export function mapSanctionLedgerSanctionRow(
  r: {
    id: string;
    user_id: string;
    sanction_type: string;
    restriction?: string | null;
    scope?: string | null;
    reason?: string | null;
    created_by?: string | null;
    created_at: string;
    end_at?: string | null;
    revoked_at?: string | null;
    source_report_id?: string | null;
  },
  nick: (id: string | null | undefined) => string | null
): AdminSanctionLedgerRow {
  const scope = r.scope ?? "platform";
  const base = SANCTION_SCOPE_VIEW_HREF[scope] ?? "/admin/users";
  return {
    action_id: r.id,
    report_id: r.source_report_id ?? "",
    action_type: r.restriction ? `${r.sanction_type}:${r.restriction}` : r.sanction_type,
    action_note: r.reason ?? null,
    admin_id: r.created_by ?? null,
    admin_nickname: nick(r.created_by),
    action_at: r.created_at,
    target_type: "user",
    target_id: r.user_id,
    target_nickname: nick(r.user_id),
    reporter_id: "",
    reason_code: "",
    reason_text: r.reason ?? null,
    report_status: "",
    resolved_at: null,
    source: "sanctions",
    source_href: base === "/admin/users" ? `/admin/users/${encodeURIComponent(r.user_id)}` : `${base}?tab=all&userId=${encodeURIComponent(r.user_id)}`,
    scope,
    end_at: r.end_at ?? null,
    revoked_at: r.revoked_at ?? null,
  };
}

/** user_moderation_events 행 → 제재 기록 행 */
export function mapSanctionLedgerModerationEventRow(
  r: {
    id: string;
    user_id: string;
    actor_id?: string | null;
    action: string;
    from_status?: string | null;
    to_status?: string | null;
    reason?: string | null;
    created_at: string;
  },
  nick: (id: string | null | undefined) => string | null
): AdminSanctionLedgerRow {
  return {
    action_id: r.id,
    report_id: "",
    action_type: r.action,
    action_note: r.reason ?? null,
    admin_id: r.actor_id ?? null,
    admin_nickname: nick(r.actor_id),
    action_at: r.created_at,
    target_type: "user",
    target_id: r.user_id,
    target_nickname: nick(r.user_id),
    reporter_id: "",
    reason_code: "",
    reason_text: r.reason ?? null,
    report_status: "",
    resolved_at: null,
    source: "user_moderation_events",
    source_href: `/admin/users/${encodeURIComponent(r.user_id)}`,
    from_status: r.from_status ?? null,
    to_status: r.to_status ?? null,
  };
}

/** 커서 모드 여부 — `cursor` 파라미터가 있으면(첫 쪽은 빈 값) 원장 3종 병합. */
export function parseSanctionLedgerCursor(sp: { get(name: string): string | null; has?(name: string): boolean }): {
  cursorMode: boolean;
  cursor: string;
} {
  const raw = sp.get("cursor");
  return { cursorMode: raw !== null, cursor: String(raw ?? "").trim() };
}

/** 처리 유형 필터 허용값 — 처리 유형 라벨 표의 키. */
export const SANCTION_LEDGER_ACTION_TYPES = Object.keys(REPORT_ACTION_TYPE_KEYS);

export type SanctionLedgerQuery = {
  page: AdminListPage;
  actionType: string | null;
  /** 대상 회원 검색 — UUID 면 대상 id, 아니면 닉네임 부분 일치 */
  target: { kind: "id"; id: string } | { kind: "nickname"; text: string } | null;
  fromIso: string | null;
  toIso: string | null;
};

type ParamSource = { get(name: string): string | null };

export function parseSanctionLedgerQuery(sp: ParamSource): SanctionLedgerQuery {
  const actionRaw = String(sp.get("action_type") ?? "").trim();
  const q = sanitizeAdminListSearch(sp.get("q"));
  const { fromIso, toIso } = manilaDateRangeToUtc(sp.get("from"), sp.get("to"));
  return {
    page: parseAdminListPage(sp, { defaultLimit: 20, maxLimit: 100 }),
    actionType: SANCTION_LEDGER_ACTION_TYPES.includes(actionRaw) ? actionRaw : null,
    target: !q
      ? null
      : isAdminListUuid(q)
        ? { kind: "id", id: q.toLowerCase() }
        : { kind: "nickname", text: q },
    fromIso,
    toIso,
  };
}
