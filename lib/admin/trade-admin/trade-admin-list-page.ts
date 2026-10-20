/**
 * 거래 Admin 목록 API 페이지 파라미터 (R7 목록 표준) — `limit` 은 20/50/100 만 (그 외·없음 = 50), `offset` ≥ 0.
 * 응답은 `{ total(count: "exact"), limit, offset }` 를 같이 돌려준다.
 * 공용 `parseCommunityAdminPage`(커뮤니티 화면 보조 호출용 상한 100)는 바꾸지 않고 거래 라우트에서만 정규화한다.
 */
import { normalizeAdminListPageSize } from "@/lib/admin/list-query/admin-list-query";
import { ADMIN_LIST_MAX_OFFSET } from "@/lib/admin/pagination/parse-admin-list-page";

export const TRADE_ADMIN_LIST_DEFAULT_LIMIT = 50;

export function parseTradeAdminListPage(sp: URLSearchParams): { limit: number; offset: number } {
  const limit = normalizeAdminListPageSize(sp.get("limit"), TRADE_ADMIN_LIST_DEFAULT_LIMIT);
  const o = Math.floor(Number(sp.get("offset")));
  const offset = Number.isFinite(o) && o > 0 ? Math.min(o, ADMIN_LIST_MAX_OFFSET) : 0;
  return { limit, offset };
}
