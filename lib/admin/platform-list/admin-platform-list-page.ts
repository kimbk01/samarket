/**
 * 플랫폼·홍보 관리자 목록 API 페이지 파라미터 (R7 목록 표준).
 *
 * - `limit` 이 주소에 있을 때만 서버 페이지 모드 — 20/50/100 만 허용, 그 외 값은 기본 20.
 * - `offset` 은 0 이상 정수 (`parseAdminListPage` 계약 — 상한 100,000).
 * - `limit` 이 없으면 `null` → 호출 API 는 기존 응답(다른 화면·대시보드 호출자 호환)을 그대로 돌려준다.
 * 순수 함수 — 서버·클라이언트 어디서나 import 가능.
 */

import { normalizeAdminListPageSize } from "@/lib/admin/list-query/admin-list-query";
import { parseAdminListPage, type AdminListPage } from "@/lib/admin/pagination/parse-admin-list-page";

type ParamSource = { get(name: string): string | null };

export function parsePlatformAdminListPage(sp: ParamSource): AdminListPage | null {
  const rawLimit = sp.get("limit");
  if (rawLimit == null || rawLimit.trim() === "") return null;
  const limit = normalizeAdminListPageSize(rawLimit);
  const { offset } = parseAdminListPage(sp, { defaultLimit: limit, maxLimit: 100 });
  return { limit, offset };
}

/** PostgREST `.range(from, to)` (to 포함). */
export function platformAdminListRange(page: AdminListPage): [number, number] {
  return [page.offset, page.offset + page.limit - 1];
}
