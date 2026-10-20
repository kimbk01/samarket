import type { SupabaseClient } from "@supabase/supabase-js";
import { POSTS_TABLE_READ } from "@/lib/posts/posts-db-tables";
import {
  mapPostRowsToTradeList,
  POST_TRADE_LIST_SELECT,
} from "@/lib/posts/trade-posts-range-query";
import type { PostWithMeta } from "@/lib/posts/schema";
import { getFavoriteManageTabId, type FavoriteManageTabId } from "@/lib/mypage/favorite-manage-tabs";
import {
  mypageKeysetOrFilter,
  sliceMypageKeysetPage,
  type MypageListCursor,
} from "@/lib/mypage/mypage-list-cursor";

export type FavoritePostListItem = PostWithMeta & { favorited_at: string };

/**
 * 찜한 게시글 목록(찜한 순) — `GET /api/favorites/list` 와 내정보 요약(`favoritesCount`)의 단일 서버 함수.
 * 조회 실패는 `ok:false` (「찜 없음」으로 바꾸지 않는다 — D10).
 */
export async function loadFavoritePostsServer(
  sb: SupabaseClient<any>,
  userId: string
): Promise<
  | { ok: true; items: FavoritePostListItem[] }
  | { ok: false; error: "favorites_load_failed"; phase: "favorites" | "posts"; message: string }
> {
  const { data: favs, error: favError } = await sb
    .from("favorites")
    .select("post_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (favError) {
    return { ok: false, error: "favorites_load_failed", phase: "favorites", message: favError.message };
  }
  if (!favs?.length) return { ok: true, items: [] };

  const postIds = favs.map((f: { post_id: string }) => f.post_id);
  /** 숨김(hidden) 글도 포함 — 찜 행은 남아 있는데 목록만 비는 현상 방지. UI는 「품절/삭제됨」탭으로 분류 */
  const { data: posts, error: postError } = await sb
    .from(POSTS_TABLE_READ)
    .select(POST_TRADE_LIST_SELECT)
    .in("id", postIds);

  if (postError) {
    return { ok: false, error: "favorites_load_failed", phase: "posts", message: postError.message };
  }
  if (!Array.isArray(posts)) return { ok: true, items: [] };

  const mapped = mapPostRowsToTradeList(posts as unknown[]);
  const byId = new Map(mapped.map((p) => [p.id, p]));
  const items: FavoritePostListItem[] = [];
  for (const f of favs as { post_id: string; created_at: string }[]) {
    const post = byId.get(f.post_id);
    if (!post) continue;
    items.push({ ...post, favorited_at: f.created_at });
  }
  return { ok: true, items };
}

/* ------------------------------------------------------------------------------------------------
 * 페이지 모드 (최종 설계 C.0.3 A2) — `GET /api/favorites/list?limit=` 일 때만. 무인자 응답은 불변.
 * `?limit=20&cursor=<created_at|id>&chip=all|active|sold|gone&counts=1`
 * 칩 술어 = `filterFavoritesByTab` 와 같은 `getFavoriteManageTabId`. 개수는 서버 전체 기준.
 * ---------------------------------------------------------------------------------------------- */

export type FavoritePostPageItem = FavoritePostListItem & { favorite_id: string };
export type FavoriteChipCounts = Record<FavoriteManageTabId, number>;

const FAVORITES_PAGE_SCAN_BATCH = 100;

export async function loadFavoritePostsPageServer(
  sb: SupabaseClient<any>,
  userId: string,
  opts: { limit: number; cursor: MypageListCursor | null; chip: FavoriteManageTabId; withCounts: boolean }
): Promise<
  | { ok: true; items: FavoritePostPageItem[]; next_cursor: string | null; counts?: FavoriteChipCounts }
  | { ok: false; error: "favorites_load_failed"; phase: "favorites" | "posts" | "counts"; message: string }
> {
  const want = opts.limit + 1;
  const matched: FavoritePostPageItem[] = [];
  let scan: MypageListCursor | null = opts.cursor;
  for (;;) {
    let q = sb
      .from("favorites")
      .select("id, post_id, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(FAVORITES_PAGE_SCAN_BATCH);
    if (scan) q = q.or(mypageKeysetOrFilter(scan, "created_at"));
    const { data: favs, error: favError } = await q;
    if (favError) return { ok: false, error: "favorites_load_failed", phase: "favorites", message: favError.message };
    const rows = (favs ?? []) as { id: string; post_id: string; created_at: string }[];
    if (rows.length) {
      const { data: posts, error: postError } = await sb
        .from(POSTS_TABLE_READ)
        .select(POST_TRADE_LIST_SELECT)
        .in(
          "id",
          rows.map((r) => r.post_id)
        );
      if (postError) return { ok: false, error: "favorites_load_failed", phase: "posts", message: postError.message };
      const byId = new Map(mapPostRowsToTradeList((posts ?? []) as unknown[]).map((p) => [p.id, p]));
      for (const f of rows) {
        const post = byId.get(f.post_id);
        if (!post) continue; // 하드 삭제된 글 — 현행처럼 제외
        if (opts.chip !== "all" && getFavoriteManageTabId(post) !== opts.chip) continue;
        matched.push({ ...post, favorited_at: f.created_at, favorite_id: String(f.id) });
      }
    }
    if (matched.length >= want || rows.length < FAVORITES_PAGE_SCAN_BATCH) break;
    const last = rows[rows.length - 1]!;
    scan = { ts: String(last.created_at), id: String(last.id) };
  }
  const page = sliceMypageKeysetPage(
    matched,
    opts.limit,
    (x) => x.favorited_at,
    (x) => x.favorite_id
  );

  if (!opts.withCounts) return { ok: true, items: page.items, next_cursor: page.next_cursor };

  const counts = await countFavoriteChipsServer(sb, userId);
  if (!counts.ok) return { ok: false, error: "favorites_load_failed", phase: "counts", message: counts.message };
  return { ok: true, items: page.items, next_cursor: page.next_cursor, counts: counts.counts };
}

/** 칩 개수(서버 전체 기준) — 글 행이 없는 찜은 목록과 같이 제외 */
export async function countFavoriteChipsServer(
  sb: SupabaseClient<any>,
  userId: string
): Promise<{ ok: true; counts: FavoriteChipCounts } | { ok: false; message: string }> {
  const { data: favs, error } = await sb.from("favorites").select("post_id").eq("user_id", userId);
  if (error) return { ok: false, message: error.message };
  const ids = [...new Set(((favs ?? []) as { post_id: string }[]).map((f) => f.post_id))];
  const counts: FavoriteChipCounts = { all: 0, active: 0, sold: 0, gone: 0 };
  for (let i = 0; i < ids.length; i += 200) {
    const { data: posts, error: pErr } = await sb
      .from(POSTS_TABLE_READ)
      .select("id, status")
      .in("id", ids.slice(i, i + 200));
    if (pErr) return { ok: false, message: pErr.message };
    for (const p of (posts ?? []) as { status?: string | null }[]) {
      counts.all += 1;
      counts[getFavoriteManageTabId({ status: (p.status ?? "active") as FavoritePostListItem["status"] })] += 1;
    }
  }
  return { ok: true, counts };
}
