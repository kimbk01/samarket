/**
 * GET /api/admin/stores — 서버 페이지네이션 + 전체 건수 (DEF-15).
 * 순수 함수만 (서버·테스트 공용). 300건 상한 후 메모리 집계를 대체한다.
 */

export const ADMIN_STORES_DEFAULT_PAGE_SIZE = 30;
export const ADMIN_STORES_MAX_PAGE_SIZE = 100;

/** 상태 탭 집계 대상 (all·actionable 은 파생). */
export const ADMIN_STORES_COUNT_STATUSES = [
  "pending",
  "under_review",
  "revision_requested",
  "approved",
  "rejected",
  "suspended",
] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AdminStoresPaging = { page: number; pageSize: number; from: number; to: number };

/** `page` 가 없으면 null (기존 호출부 — 거리 정책·쿠폰 화면 — 호환). */
export function parseAdminStoresPaging(sp: URLSearchParams): AdminStoresPaging | null {
  const rawPage = sp.get("page");
  if (rawPage == null || rawPage.trim() === "") return null;
  const pageNum = Math.floor(Number(rawPage));
  const page = Number.isFinite(pageNum) && pageNum >= 1 ? pageNum : 1;
  const sizeNum = Math.floor(Number(sp.get("page_size") ?? sp.get("pageSize")));
  const pageSize =
    Number.isFinite(sizeNum) && sizeNum >= 1
      ? Math.min(sizeNum, ADMIN_STORES_MAX_PAGE_SIZE)
      : ADMIN_STORES_DEFAULT_PAGE_SIZE;
  const from = (page - 1) * pageSize;
  return { page, pageSize, from, to: from + pageSize - 1 };
}

/** PostgREST `or=(…)` 구문을 깨는 문자 제거 + 길이 제한. */
export function sanitizeAdminStoresSearchTerm(raw: string | null | undefined): string {
  return String(raw ?? "")
    .replace(/^@+/, "")
    .replace(/[,()*%\\"'`:]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

/**
 * 검색어 → PostgREST or 필터 문자열. 빈 검색어면 null.
 * 사장님 닉네임·핸들 검색은 호출부가 profiles 에서 찾은 owner id 로 전달한다.
 */
export function buildAdminStoresSearchOrFilter(
  q: string,
  ownerIds: readonly string[],
  opts: { includeRequestNote: boolean }
): string | null {
  const term = sanitizeAdminStoresSearchTerm(q);
  if (!term) return null;
  const like = `%${term}%`;
  const parts = [
    `store_name.ilike.${like}`,
    `slug.ilike.${like}`,
    `phone.ilike.${like}`,
    `kakao_id.ilike.${like}`,
  ];
  if (opts.includeRequestNote) parts.push(`application_request_note.ilike.${like}`);
  if (UUID_RE.test(term)) {
    parts.push(`id.eq.${term}`, `owner_user_id.eq.${term}`, `store_category_id.eq.${term}`, `store_topic_id.eq.${term}`);
  }
  const owners = ownerIds.filter((id) => UUID_RE.test(id)).slice(0, 200);
  if (owners.length > 0) parts.push(`owner_user_id.in.(${owners.join(",")})`);
  return parts.join(",");
}

export function buildAdminStoresStatusCounts(
  byStatus: Partial<Record<(typeof ADMIN_STORES_COUNT_STATUSES)[number], number>>,
  total: number
): Record<string, number> {
  const counts: Record<string, number> = { all: Math.max(0, total) };
  for (const s of ADMIN_STORES_COUNT_STATUSES) counts[s] = Math.max(0, Number(byStatus[s]) || 0);
  counts.actionable = (counts.pending ?? 0) + (counts.under_review ?? 0);
  return counts;
}
