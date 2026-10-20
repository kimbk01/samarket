/**
 * 배달·매장 관리자 목록 API 페이지 파라미터 (R7 목록 표준).
 *
 * - `limit` 은 20/50/100 만 허용, 그 외 값(0·200·문자)은 기본값(20).
 * - `offset` 은 0 이상 정수 (`parseAdminListPage` 계약 — 상한 100,000).
 * - `parseDeliveryListPageIfRequested` — `limit`/`offset` 이 주소에 없으면 `null`.
 *   다른 호출자(대시보드·요약 카드·다른 화면)가 있는 API 는 이때 기존 응답을 그대로 돌려준다.
 * 순수 함수 — 서버·클라이언트 어디서나 import 가능.
 */

import { ADMIN_LIST_QUERY_DEFAULT_SIZE, normalizeAdminListPageSize } from "@/lib/admin/list-query/admin-list-query";
import { parseAdminListPage, type AdminListPage } from "@/lib/admin/pagination/parse-admin-list-page";

type ParamSource = { get(name: string): string | null };

function present(sp: ParamSource, key: string): boolean {
  const v = sp.get(key);
  return v != null && v.trim() !== "";
}

export function parseDeliveryListPage(sp: ParamSource): AdminListPage {
  const limit = normalizeAdminListPageSize(sp.get("limit"), ADMIN_LIST_QUERY_DEFAULT_SIZE);
  const { offset } = parseAdminListPage(sp, { defaultLimit: limit, maxLimit: 100 });
  return { limit, offset };
}

export function parseDeliveryListPageIfRequested(sp: ParamSource): AdminListPage | null {
  if (!present(sp, "limit") && !present(sp, "offset")) return null;
  return parseDeliveryListPage(sp);
}

/** PostgREST `.range(from, to)` (to 포함). */
export function deliveryListRange(page: AdminListPage): [number, number] {
  return [page.offset, page.offset + page.limit - 1];
}
