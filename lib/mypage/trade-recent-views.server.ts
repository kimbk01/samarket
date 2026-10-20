import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { POSTS_TABLE_READ } from "@/lib/posts/posts-db-tables";
import { mapPostRowsToTradeList, POST_TRADE_LIST_SELECT } from "@/lib/posts/trade-posts-range-query";
import type { PostWithMeta } from "@/lib/posts/schema";

/** 최근 본 상품(M3 `trade_post_recent_views`) — 회원별 보관 한도 */
export const TRADE_RECENT_VIEWS_MAX = 100;
export const TRADE_RECENT_VIEWS_RETENTION_DAYS = 90;

const TABLE = "trade_post_recent_views";

export type TradeRecentViewItem = PostWithMeta & { viewed_at: string };

/**
 * 거래 상세 조회 기록(upsert) 후 회원별 100개 초과·90일 지난 행 정리 (service_role 전용).
 * 실패해도 상세 화면에는 영향 없음 — 호출부가 응답 후(after) 실행한다.
 */
export async function recordTradeRecentView(sb: SupabaseClient, userId: string, postId: string): Promise<void> {
  const uid = userId.trim();
  const pid = postId.trim();
  if (!uid || !pid) return;

  const { error } = await sb
    .from(TABLE)
    .upsert({ user_id: uid, post_id: pid, viewed_at: new Date().toISOString() }, { onConflict: "user_id,post_id" });
  if (error) return;

  const cutoff = new Date(Date.now() - TRADE_RECENT_VIEWS_RETENTION_DAYS * 86_400_000).toISOString();
  await sb.from(TABLE).delete().eq("user_id", uid).lt("viewed_at", cutoff);

  const { data: overflow } = await sb
    .from(TABLE)
    .select("post_id")
    .eq("user_id", uid)
    .order("viewed_at", { ascending: false })
    .range(TRADE_RECENT_VIEWS_MAX, TRADE_RECENT_VIEWS_MAX + 199);
  const extraIds = ((overflow ?? []) as Array<{ post_id: string }>).map((r) => r.post_id);
  if (extraIds.length) {
    await sb.from(TABLE).delete().eq("user_id", uid).in("post_id", extraIds);
  }
}

export type ListTradeRecentViewsResult = { ok: true; items: TradeRecentViewItem[] } | { ok: false };

/** 본인 최근 본 상품 — 최근 순, 삭제된 글은 제외(숨김·판매완료는 카드 상태로 표시) */
export async function listTradeRecentViews(sb: SupabaseClient, userId: string): Promise<ListTradeRecentViewsResult> {
  const { data: views, error } = await sb
    .from(TABLE)
    .select("post_id, viewed_at")
    .eq("user_id", userId)
    .order("viewed_at", { ascending: false })
    .limit(TRADE_RECENT_VIEWS_MAX);
  if (error) return { ok: false };
  const rows = (views ?? []) as Array<{ post_id: string; viewed_at: string }>;
  if (!rows.length) return { ok: true, items: [] };

  const { data: posts, error: postError } = await sb
    .from(POSTS_TABLE_READ)
    .select(POST_TRADE_LIST_SELECT)
    .in(
      "id",
      rows.map((r) => r.post_id)
    );
  if (postError) return { ok: false };

  const byId = new Map(mapPostRowsToTradeList((posts ?? []) as unknown[]).map((p) => [p.id, p]));
  const items: TradeRecentViewItem[] = [];
  for (const r of rows) {
    const post = byId.get(r.post_id);
    if (post) items.push({ ...post, viewed_at: r.viewed_at });
  }
  return { ok: true, items };
}

/** 본인 기록 삭제 — postId 없으면 전체 */
export async function deleteTradeRecentViews(
  sb: SupabaseClient,
  userId: string,
  postId?: string | null
): Promise<boolean> {
  let q = sb.from(TABLE).delete().eq("user_id", userId);
  const pid = postId?.trim();
  if (pid) q = q.eq("post_id", pid);
  const { error } = await q;
  return !error;
}
