/**
 * LIST-01 (2026-10-27) — 캐시·세션 복원 목록 정합.
 * 상세에서 뒤로 오면 목록 표시 세션(retained)을 네트워크 없이 복원하고, CUT H 조용한 재조회는
 * 같은 id 필드만 갱신(삭제 금지)하므로 숨김·삭제된 글이 다른 사용자 목록에 계속 남았다.
 * 여기서는 표시 중인 id 의 **현재 상태를 서버에 직접 확인**해 사라진/숨김 글만 빼고 상태 필드를 맞춘다.
 * 순서·삽입은 바꾸지 않는다(CUT H 의 「자동 재정렬·삽입 금지」 유지).
 */

export type TradeListingVisibilityRow = {
  id: string;
  status: string | null;
  seller_listing_state: string | null;
  /** 찜 수(posts.favorite_count) — 캐시 목록 「관심 N」 맞춤. 옛 응답에는 없다 */
  favorite_count?: number | null;
};

/** 목록에서 빼야 하는 상태 — 숨김. 행이 없으면(삭제) 역시 뺀다. */
const REMOVED_STATUSES = new Set(["hidden", "deleted"]);

export function reconcileTradeRowsWithVisibility<
  T extends { id: string; status?: string | null; seller_listing_state?: string | null; favorite_count?: number | null },
>(prev: readonly T[], rows: readonly TradeListingVisibilityRow[], checkedIds: readonly string[]): T[] {
  if (prev.length === 0) return prev as T[];
  const checked = new Set(checkedIds);
  const byId = new Map(rows.map((r) => [r.id, r]));
  let changed = false;
  const out: T[] = [];
  for (const row of prev) {
    if (!checked.has(row.id)) {
      out.push(row);
      continue;
    }
    const v = byId.get(row.id);
    if (!v || (v.status != null && REMOVED_STATUSES.has(v.status))) {
      changed = true;
      continue;
    }
    const nextStatus = v.status ?? row.status ?? null;
    const nextListing = v.seller_listing_state ?? row.seller_listing_state ?? null;
    const nextFav = typeof v.favorite_count === "number" ? v.favorite_count : row.favorite_count;
    if (
      nextStatus !== (row.status ?? null) ||
      nextListing !== (row.seller_listing_state ?? null) ||
      nextFav !== row.favorite_count
    ) {
      changed = true;
      out.push({ ...row, status: nextStatus, seller_listing_state: nextListing, favorite_count: nextFav } as T);
      continue;
    }
    out.push(row);
  }
  return changed ? out : (prev as T[]);
}

const MAX_IDS_PER_REQUEST = 120;

/** 표시 중인 id 의 공개 상태 조회 — 실패 시 null(기존 목록 유지) */
export async function fetchTradeListingVisibility(
  ids: readonly string[]
): Promise<{ rows: TradeListingVisibilityRow[]; checkedIds: string[]; favoritedIds: string[] | null } | null> {
  const checkedIds = [...new Set(ids.map((x) => x.trim()).filter(Boolean))].slice(0, MAX_IDS_PER_REQUEST);
  if (checkedIds.length === 0) return { rows: [], checkedIds, favoritedIds: null };
  try {
    const res = await fetch("/api/posts/listing-visibility", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      body: JSON.stringify({ ids: checkedIds }),
    });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as {
      ok?: boolean;
      rows?: TradeListingVisibilityRow[];
      favoritedIds?: string[] | null;
    } | null;
    if (!data?.ok || !Array.isArray(data.rows)) return null;
    return { rows: data.rows, checkedIds, favoritedIds: Array.isArray(data.favoritedIds) ? data.favoritedIds : null };
  } catch {
    return null;
  }
}

/** 캐시 목록 하트 맞춤 — 확인한 id 만 서버 찜 여부로 덮어쓴다(로그아웃이면 그대로) */
export function mergeFavoriteMapWithServer(
  prev: Record<string, boolean>,
  checkedIds: readonly string[],
  favoritedIds: readonly string[] | null
): Record<string, boolean> {
  if (!favoritedIds) return prev;
  const fav = new Set(favoritedIds);
  let changed = false;
  const next = { ...prev };
  for (const id of checkedIds) {
    const v = fav.has(id);
    if ((prev[id] === true) !== v) {
      next[id] = v;
      changed = true;
    }
  }
  return changed ? next : prev;
}
