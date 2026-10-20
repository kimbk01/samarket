/**
 * 제재 기록(`/admin/reports/log`) — 목록 API 계약 (설계 v4 F3).
 * 원장 = `report_actions`(처리 이력) + `reports`(대상·사유·상태). 브라우저 직접 조회 대신
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
