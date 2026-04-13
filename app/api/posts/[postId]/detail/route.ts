import { POSTS_TABLE_READ } from "@/lib/posts/posts-db-tables";
import { POST_TRADE_DETAIL_SELECT } from "@/lib/posts/post-query-select";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { normalizePostImages, normalizePostMeta, normalizePostPrice } from "@/lib/posts/post-normalize";
import { resolveAuthorIdFromPostRow } from "@/lib/posts/resolve-post-author-id";
import { enrichPostsAuthorNicknamesFromProfiles } from "@/lib/posts/enrich-posts-author-nicknames";
import type { PostWithMeta } from "@/lib/posts/schema";
import { resolvePostsReadClients } from "@/lib/supabase/resolve-posts-read-clients";

export const dynamic = "force-dynamic";

function mapDetailRow(row: Record<string, unknown>): PostWithMeta {
  const images = normalizePostImages(row.images);
  const thumbnail_url =
    typeof row.thumbnail_url === "string" && row.thumbnail_url
      ? row.thumbnail_url
      : images?.[0] ?? null;
  const author_id = resolveAuthorIdFromPostRow(row) ?? "";
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

async function loadPostRow(
  sb: SupabaseClient<any>,
  table: string,
  id: string
): Promise<Record<string, unknown> | null> {
  const tiers = [POST_TRADE_DETAIL_SELECT, "*"];
  for (const sel of tiers) {
    const { data, error } = await sb.from(table).select(sel).eq("id", id).maybeSingle();
    if (!error && data && typeof data === "object") {
      return data as Record<string, unknown>;
    }
  }
  return null;
}

/**
 * GET /api/posts/[postId]/detail — 거래 글 상세(본문 포함). 브라우저 RLS와 무관하게 읽기.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  const { postId } = await params;
  const id = typeof postId === "string" ? postId.trim() : "";
  if (!id) {
    return NextResponse.json({ error: "postId 필요" }, { status: 400 });
  }

  const clients = resolvePostsReadClients(req);
  if (!clients) {
    return NextResponse.json({ error: "서버 설정이 필요합니다." }, { status: 503 });
  }

  let row =
    (await loadPostRow(clients.readSb, POSTS_TABLE_READ, id)) ??
    (clients.serviceSb && clients.serviceSb !== clients.readSb
      ? await loadPostRow(clients.serviceSb, POSTS_TABLE_READ, id)
      : null) ??
    (clients.serviceSb ? await loadPostRow(clients.serviceSb, "posts", id) : null);

  if (!row) {
    return NextResponse.json({ error: "글을 찾을 수 없습니다." }, { status: 404 });
  }

  const viewerId = await getOptionalAuthenticatedUserId();
  const sellerId = typeof row.user_id === "string" ? row.user_id : "";
  const reserved = row.reserved_buyer_id;
  const canSeeReservedBuyer =
    Boolean(viewerId) &&
    reserved != null &&
    reserved !== "" &&
    (viewerId === sellerId || viewerId === reserved);

  if (reserved != null && reserved !== "" && !canSeeReservedBuyer) {
    row = { ...row, reserved_buyer_id: null };
  }

  const post = mapDetailRow(row);
  await enrichPostsAuthorNicknamesFromProfiles(clients.readSb, [post]);

  return NextResponse.json(post, {
    headers: { "Cache-Control": "private, max-age=15, stale-while-revalidate=45", Vary: "Cookie" },
  });
}
