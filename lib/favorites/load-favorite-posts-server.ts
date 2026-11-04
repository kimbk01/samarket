import type { SupabaseClient } from "@supabase/supabase-js";
import { POSTS_TABLE_READ, POSTS_TABLE_WRITE } from "@/lib/posts/posts-db-tables";
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
 * 「내 거래 찜」에서 빼는 글 — 관리자가 삭제한 글 (D-3 · 3차 실기 2-5 근본 수정 H1 2026-11-04).
 * 찜 목록 본문·하위 칩 개수·찜 화면 맨 위 개수·내정보 대시보드 개수가 모두 이 규칙 1개를 쓴다.
 * (글이 지워진 찜은 외래키 `ON DELETE CASCADE` 로 생기지 않는다)
 */
export const TRADE_FAVORITE_HIDDEN_MODERATION = "admin_deleted" as const;

/**
 * 「내 거래 찜 개수」 정의 1곳 — 찜 ⨝ 글(외래키 inner join) 에서 관리자 삭제 글을 뺀 수. 쿼리 1번.
 * 실패면 null (호출부가 「—」 등으로 처리 · 0 으로 바꾸지 않는다).
 */
export async function countVisibleTradeFavoritesServer(
  sb: SupabaseClient<any>,
  userId: string
): Promise<number | null> {
  const uid = userId.trim();
  if (!uid) return 0;
  const { count, error } = await sb
    .from("favorites")
    .select("id, posts!inner(moderation_state)", { count: "exact", head: true })
    .eq("user_id", uid)
    .neq("posts.moderation_state", TRADE_FAVORITE_HIDDEN_MODERATION);
  if (error || typeof count !== "number") return null;
  return count;
}

/**
 * D-3 (2026-11-04): 관리자가 삭제한 글은 찜 목록·개수에서 뺀다(판매자 삭제·숨김·관리자 숨김은 「볼 수 없는 글」 카드로 남김).
 * 읽기 표(`posts_masked`)에 `moderation_state` 가 없어 원본 표에서 숨김 글 id 만 확인한다. 실패하면 빼지 않는다(목록을 막지 않음).
 */
async function loadAdminDeletedPostIds(sb: SupabaseClient<any>, rows: readonly { id: string; status?: string | null }[]): Promise<Set<string>> {
  const hiddenIds = rows.filter((p) => String(p.status ?? "").toLowerCase() === "hidden").map((p) => p.id);
  if (hiddenIds.length === 0) return new Set();
  const { data, error } = await sb
    .from(POSTS_TABLE_WRITE)
    .select("id")
    .in("id", hiddenIds)
    .eq("moderation_state", TRADE_FAVORITE_HIDDEN_MODERATION);
  if (error) return new Set();
  return new Set(((data ?? []) as { id: string }[]).map((r) => String(r.id)));
}

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
  /** 숨김(hidden) 글도 포함 — 찜 행은 남아 있는데 목록만 비는 현상 방지. UI는 「볼 수 없는 글」 탭으로 분류 */
  const { data: posts, error: postError } = await sb
    .from(POSTS_TABLE_READ)
    .select(POST_TRADE_LIST_SELECT)
    .in("id", postIds);

  if (postError) {
    return { ok: false, error: "favorites_load_failed", phase: "posts", message: postError.message };
  }
  if (!Array.isArray(posts)) return { ok: true, items: [] };

  const mapped = mapPostRowsToTradeList(posts as unknown[]);
  const adminDeleted = await loadAdminDeletedPostIds(sb, mapped);
  const byId = new Map(mapped.map((p) => [p.id, p]));
  const items: FavoritePostListItem[] = [];
  for (const f of favs as { post_id: string; created_at: string }[]) {
    const post = byId.get(f.post_id);
    if (!post || adminDeleted.has(post.id)) continue;
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
      const pageMapped = mapPostRowsToTradeList((posts ?? []) as unknown[]);
      const adminDeleted = await loadAdminDeletedPostIds(sb, pageMapped);
      const byId = new Map(pageMapped.map((p) => [p.id, p]));
      for (const f of rows) {
        const post = byId.get(f.post_id);
        if (!post) continue; // 하드 삭제된 글 — 현행처럼 제외
        if (adminDeleted.has(post.id)) continue; // D-3: 관리자 삭제 글
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
    const chunk = (posts ?? []) as { id: string; status?: string | null }[];
    const adminDeleted = await loadAdminDeletedPostIds(sb, chunk);
    for (const p of chunk) {
      if (adminDeleted.has(String(p.id))) continue;
      counts.all += 1;
      counts[getFavoriteManageTabId({ status: (p.status ?? "active") as FavoritePostListItem["status"] })] += 1;
    }
  }
  return { ok: true, counts };
}
