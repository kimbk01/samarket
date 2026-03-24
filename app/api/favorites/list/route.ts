/**
 * GET /api/favorites/list — 세션 사용자의 찜한 게시글 목록 (찜한 순)
 * 클라이언트 직접 Supabase 조회(RLS/세션 불일치) 대신 service role + api-session userId 사용.
 */
import { NextResponse } from "next/server";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { normalizePostImages, normalizePostPrice, normalizePostMeta } from "@/lib/posts/getPostById";

export async function GET() {
  const userId = (await getOptionalAuthenticatedUserId()) ?? "";
  if (!userId) {
    return NextResponse.json({ items: [] });
  }

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ items: [] });
  }

  const { data: favs, error: favError } = await sb
    .from("favorites")
    .select("post_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (favError || !favs?.length) {
    return NextResponse.json({ items: [] });
  }

  const postIds = favs.map((f: { post_id: string }) => f.post_id);
  const { data: posts, error: postError } = await sb
    .from("posts")
    .select("*")
    .in("id", postIds)
    .neq("status", "hidden");

  if (postError || !Array.isArray(posts)) {
    return NextResponse.json({ items: [] });
  }

  const byId = new Map(posts.map((p: Record<string, unknown>) => [p.id as string, p]));
  const items: Record<string, unknown>[] = [];

  for (const f of favs as { post_id: string; created_at: string }[]) {
    const post = byId.get(f.post_id);
    if (!post) continue;
    const images = normalizePostImages(post.images);
    const thumbnail_url =
      typeof post.thumbnail_url === "string" && post.thumbnail_url
        ? post.thumbnail_url
        : images?.[0] ?? null;
    const price = normalizePostPrice(post.price);
    const meta = normalizePostMeta(post.meta);
    const is_free_share = post.is_free_share === true || post.is_free_share === "true";
    items.push({
      ...post,
      author_id: post.author_id ?? post.user_id,
      category_id: post.category_id ?? post.trade_category_id,
      images,
      thumbnail_url,
      price,
      meta: meta ?? undefined,
      is_free_share,
      favorited_at: f.created_at,
    });
  }

  return NextResponse.json({ items });
}
