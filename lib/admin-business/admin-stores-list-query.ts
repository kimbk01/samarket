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

/** 3-C L-1·L-2 — `stores.store_kind` (20270707130000). */
export const ADMIN_STORE_KINDS = ["real", "sample", "legacy_test"] as const;
export type AdminStoreKind = (typeof ADMIN_STORE_KINDS)[number];

export function isAdminStoreKind(v: unknown): v is AdminStoreKind {
  return typeof v === "string" && (ADMIN_STORE_KINDS as readonly string[]).includes(v);
}

export type AdminStoresExtraFilters = {
  kind: AdminStoreKind | null;
  categoryId: string | null;
  topicId: string | null;
};

/** 3-C L-2·L-3 — `kind` · `category_id`(1차) · `topic_id`(2차). 형식이 틀린 값은 무시(필터 없음). */
export function parseAdminStoresExtraFilters(sp: URLSearchParams): AdminStoresExtraFilters {
  const kindRaw = sp.get("kind")?.trim() ?? "";
  const cat = sp.get("category_id")?.trim() ?? "";
  const topic = sp.get("topic_id")?.trim() ?? "";
  return {
    kind: isAdminStoreKind(kindRaw) ? kindRaw : null,
    categoryId: UUID_RE.test(cat) ? cat : null,
    topicId: UUID_RE.test(topic) ? topic : null,
  };
}

/** PostgREST 빌더에 추가 필터 적용 (목록·건수·전체 결과 id 조회 공용). */
export function applyAdminStoresExtraFilters<Q extends { eq: (col: string, val: string) => Q }>(
  q: Q,
  f: AdminStoresExtraFilters
): Q {
  let out = q;
  if (f.kind) out = out.eq("store_kind", f.kind);
  if (f.categoryId) out = out.eq("store_category_id", f.categoryId);
  if (f.topicId) out = out.eq("store_topic_id", f.topicId);
  return out;
}

/** 「전체 결과 선택」 서버 확정 id 상한 — 일괄 처리 1회 상한과 같다. */
export const ADMIN_STORES_SELECT_ALL_MAX = 500;

export type AdminStoreMenuStats = { menu_count: number; option_count: number };

/**
 * 3-C L-7 — 페이지 행 매장의 메뉴·옵션 수 (삭제 상태 상품 제외).
 * 옵션 수 = options_json 그룹별 `options` 배열 길이 합.
 */
export function summarizeAdminStoreMenuStats(
  rows: readonly { store_id?: unknown; product_status?: unknown; options_json?: unknown }[]
): Map<string, AdminStoreMenuStats> {
  const out = new Map<string, AdminStoreMenuStats>();
  for (const r of rows) {
    const sid = typeof r.store_id === "string" ? r.store_id : "";
    if (!sid || r.product_status === "deleted") continue;
    const cur = out.get(sid) ?? { menu_count: 0, option_count: 0 };
    cur.menu_count += 1;
    if (Array.isArray(r.options_json)) {
      for (const g of r.options_json) {
        const opts = g && typeof g === "object" ? (g as { options?: unknown }).options : null;
        if (Array.isArray(opts)) cur.option_count += opts.length;
      }
    }
    out.set(sid, cur);
  }
  return out;
}

/** 3-C L-9 — 매장별 연결 광고(배너·유료) 건수와 진행 중(ENDED/ARCHIVED 아님) 건수. */
export function summarizeAdminStoreAdLinks(
  rows: readonly { store_id?: unknown; lifecycle_status?: unknown }[]
): Map<string, { linked_ad_count: number; linked_ad_live_count: number }> {
  const out = new Map<string, { linked_ad_count: number; linked_ad_live_count: number }>();
  for (const r of rows) {
    const sid = typeof r.store_id === "string" ? r.store_id : "";
    if (!sid) continue;
    const cur = out.get(sid) ?? { linked_ad_count: 0, linked_ad_live_count: 0 };
    cur.linked_ad_count += 1;
    const st = String(r.lifecycle_status ?? "");
    if (st !== "ENDED" && st !== "ARCHIVED") cur.linked_ad_live_count += 1;
    out.set(sid, cur);
  }
  return out;
}

/**
 * 5-E — 입점 심사 범위 (`scope=review`): 실매장 신청만 — 샘플(`store_kind='sample'`)은 쿼리 단계에서 제외.
 * 같은 API 를 쓰는 다른 화면(거리 정책 등)은 이 값을 보내지 않으므로 영향이 없다.
 */
export function parseAdminStoresReviewScope(sp: URLSearchParams): boolean {
  return sp.get("scope")?.trim() === "review";
}

export function applyAdminStoresReviewScope<Q extends { neq: (col: string, val: string) => Q }>(
  q: Q,
  reviewScope: boolean
): Q {
  return reviewScope ? q.neq("store_kind", "sample") : q;
}

/** 5-E — 입점 심사 표 정렬 (신청일 최신·오래된 순 · 승인 상태). */
export const ADMIN_STORES_SORTS = ["created_desc", "created_asc", "status"] as const;
export type AdminStoresSort = (typeof ADMIN_STORES_SORTS)[number];

export function parseAdminStoresSort(sp: URLSearchParams): AdminStoresSort {
  const v = sp.get("sort")?.trim() ?? "";
  return (ADMIN_STORES_SORTS as readonly string[]).includes(v) ? (v as AdminStoresSort) : "created_desc";
}

/** 정렬 → PostgREST order 목록 (앞이 우선). */
export function adminStoresSortOrder(sort: AdminStoresSort): { column: string; ascending: boolean }[] {
  if (sort === "created_asc") return [{ column: "created_at", ascending: true }];
  if (sort === "status") {
    return [
      { column: "approval_status", ascending: true },
      { column: "created_at", ascending: false },
    ];
  }
  return [{ column: "created_at", ascending: false }];
}

/** 5-E — 「처리자/처리일」 = 입점 심사 결정 감사 기록(`audit_logs`, target_type=store) 중 최신 1건. */
export const ADMIN_STORE_REVIEW_DECISION_AUDIT_ACTIONS = [
  "store.start_review",
  "store.mark_under_review",
  "store.approve_store",
  "store.reject_store",
  "store.request_revision",
  "store.reopen_application",
] as const;

export type AdminStoreReviewDecision = { actorId: string | null; action: string; at: string };

export function pickLatestStoreReviewDecisions(
  rows: readonly { target_id?: unknown; actor_id?: unknown; action?: unknown; created_at?: unknown }[]
): Map<string, AdminStoreReviewDecision> {
  const out = new Map<string, AdminStoreReviewDecision>();
  const allowed = new Set<string>(ADMIN_STORE_REVIEW_DECISION_AUDIT_ACTIONS);
  for (const r of rows) {
    const sid = typeof r.target_id === "string" ? r.target_id : "";
    const action = typeof r.action === "string" ? r.action : "";
    const at = typeof r.created_at === "string" ? r.created_at : "";
    if (!sid || !at || !allowed.has(action)) continue;
    const cur = out.get(sid);
    if (cur && Date.parse(cur.at) >= Date.parse(at)) continue;
    out.set(sid, { actorId: typeof r.actor_id === "string" ? r.actor_id : null, action, at });
  }
  return out;
}
