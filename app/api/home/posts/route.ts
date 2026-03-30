import { NextRequest, NextResponse } from "next/server";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import type { PostWithMeta } from "@/lib/posts/schema";
import { normalizePostImages, normalizePostMeta, normalizePostPrice } from "@/lib/posts/post-normalize";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type HomePostSort = "latest" | "popular";
type HomePostType = "trade" | "community" | "service" | "feature" | null;

function normalizeSort(raw: string | null): HomePostSort {
  return raw === "popular" ? "popular" : "latest";
}

function normalizeType(raw: string | null): HomePostType {
  if (raw === "trade" || raw === "community" || raw === "service" || raw === "feature") {
    return raw;
  }
  return null;
}

function normalizePage(raw: string | null): number {
  const page = Number(raw);
  if (!Number.isFinite(page)) return 1;
  return Math.max(1, Math.floor(page));
}

function mapPostRow(row: Record<string, unknown>): PostWithMeta {
  const images = normalizePostImages(row.images);
  const thumbnail_url =
    typeof row.thumbnail_url === "string" && row.thumbnail_url
      ? row.thumbnail_url
      : images?.[0] ?? null;
  const author_id = (row.author_id as string) ?? (row.user_id as string);
  const category_id = (row.category_id as string) ?? (row.trade_category_id as string);
  const price = normalizePostPrice(row.price);
  const meta = normalizePostMeta(row.meta);
  const is_free_share = row.is_free_share === true || row.is_free_share === "true";

  return {
    ...row,
    author_id,
    category_id,
    images,
    thumbnail_url,
    price,
    meta: meta ?? undefined,
    is_free_share,
  } as PostWithMeta;
}

export async function GET(req: NextRequest) {
  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json(
      { posts: [], hasMore: false, favoriteMap: {} },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const { searchParams } = new URL(req.url);
  const page = normalizePage(searchParams.get("page"));
  const sort = normalizeSort(searchParams.get("sort"));
  const type = normalizeType(searchParams.get("type"));
  const from = (page - 1) * PAGE_SIZE;

  let q = sb.from("posts").select("*").neq("status", "hidden").neq("status", "sold");
  if (type) {
    q = q.eq("type", type);
  }
  if (sort === "latest") {
    q = q.order("created_at", { ascending: false });
  } else {
    q = q.order("view_count", { ascending: false }).order("created_at", { ascending: false });
  }

  const { data, error } = await q.range(from, from + PAGE_SIZE - 1);
  if (error || !Array.isArray(data)) {
    return NextResponse.json(
      { posts: [], hasMore: false, favoriteMap: {} },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const posts = (data as Record<string, unknown>[]).map(mapPostRow);
  const favoriteMap: Record<string, boolean> = {};
  const userId = await getOptionalAuthenticatedUserId();

  if (userId && posts.length > 0) {
    const postIds = posts.map((post) => post.id).filter(Boolean);
    const { data: favorites } = await sb
      .from("favorites")
      .select("post_id")
      .eq("user_id", userId)
      .in("post_id", postIds);

    for (const postId of postIds) {
      favoriteMap[postId] = false;
    }
    for (const row of favorites ?? []) {
      const postId = typeof row.post_id === "string" ? row.post_id : "";
      if (postId) favoriteMap[postId] = true;
    }
  }

  return NextResponse.json(
    {
      posts,
      hasMore: posts.length === PAGE_SIZE,
      favoriteMap,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
