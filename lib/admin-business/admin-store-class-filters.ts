/**
 * 관리자 매장 목록 — 유형(store_kind) · 업종(store_category_id) · 노출(is_visible) 필터 (2026-10-28 §F G-01).
 * 유형과 노출은 서로 다른 축이다. 서버 페이지(SQL)·전체 목록(메모리) 경로가 같은 해석을 쓴다.
 */
export type AdminStoreClassFilters = {
  kind: "real" | "sample" | "legacy_test" | null;
  categoryId: string | null;
  visibility: "visible" | "hidden" | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseAdminStoreClassFilters(sp: URLSearchParams): AdminStoreClassFilters {
  const kindRaw = sp.get("kind")?.trim() ?? "";
  const cat = sp.get("category")?.trim() ?? "";
  const vis = sp.get("visibility")?.trim() ?? "";
  return {
    kind: kindRaw === "real" || kindRaw === "sample" || kindRaw === "legacy_test" ? kindRaw : null,
    categoryId: UUID_RE.test(cat) ? cat : null,
    visibility: vis === "visible" || vis === "hidden" ? vis : null,
  };
}

type EqChain<Q> = { eq: (col: string, v: unknown) => Q };

export function applyAdminStoreClassFiltersToQuery<Q extends EqChain<Q>>(q: Q, f: AdminStoreClassFilters): Q {
  let out = q;
  if (f.kind) out = out.eq("store_kind", f.kind);
  if (f.categoryId) out = out.eq("store_category_id", f.categoryId);
  if (f.visibility) out = out.eq("is_visible", f.visibility === "visible");
  return out;
}

export function matchesAdminStoreClassFilters(
  row: { store_kind?: unknown; store_category_id?: unknown; is_visible?: unknown },
  f: AdminStoreClassFilters
): boolean {
  if (f.kind && String(row.store_kind ?? "real") !== f.kind) return false;
  if (f.categoryId && String(row.store_category_id ?? "") !== f.categoryId) return false;
  if (f.visibility && (row.is_visible === true) !== (f.visibility === "visible")) return false;
  return true;
}
