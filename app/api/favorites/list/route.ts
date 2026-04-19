import { POSTS_TABLE_READ, POSTS_TABLE_WRITE } from "@/lib/posts/posts-db-tables";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/favorites/list — 세션 사용자의 찜한 게시글 목록 (찜한 순)
 * 클라이언트 직접 Supabase 조회(RLS/세션 불일치) 대신 service role + api-session userId 사용.
 *
 * `authenticated`: 쿠키·세션으로 식별된 사용자가 있으면 true (클라 `getCurrentUser()`와 별개)
 */
import { NextResponse } from "next/server";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  mapPostRowsToTradeList,
  POST_TRADE_LIST_SELECT,
} from "@/lib/posts/trade-posts-range-query";
import type { PostWithMeta } from "@/lib/posts/schema";

export async function GET() {
  const userId = (await getOptionalAuthenticatedUserId()) ?? "";
  if (!userId) {
    return NextResponse.json({ items: [], authenticated: false });
  }

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ items: [], authenticated: false });
  }

  const { data: favs, error: favError } = await sb
    .from("favorites")
    .select("post_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (favError) {
    if (process.env.NODE_ENV === "development") {
      console.error("[favorites/list] favorites select:", favError.message);
    }
    return NextResponse.json({ items: [], authenticated: true });
  }

  if (!favs?.length) {
    return NextResponse.json({ items: [], authenticated: true });
  }

  const postIds = favs.map((f: { post_id: string }) => f.post_id);
  /** 숨김(hidden) 글도 포함 — 찜 행은 남아 있는데 목록만 비는 현상 방지. UI는 「품절/삭제됨」탭으로 분류 */
  const { data: posts, error: postError } = await sb
    .from(POSTS_TABLE_READ)
    .select(POST_TRADE_LIST_SELECT)
    .in("id", postIds);

  if (postError) {
    if (process.env.NODE_ENV === "development") {
      console.error("[favorites/list] posts select:", postError.message);
    }
    return NextResponse.json({ items: [], authenticated: true });
  }

  if (!Array.isArray(posts)) {
    return NextResponse.json({ items: [], authenticated: true });
  }

  const mapped = mapPostRowsToTradeList(posts as unknown[]);
  const byId = new Map(mapped.map((p) => [p.id, p]));
  const items: (PostWithMeta & { favorited_at: string })[] = [];

  for (const f of favs as { post_id: string; created_at: string }[]) {
    const post = byId.get(f.post_id);
    if (!post) continue;
    items.push({
      ...post,
      favorited_at: f.created_at,
    });
  }

  return NextResponse.json({ items, authenticated: true });
}
