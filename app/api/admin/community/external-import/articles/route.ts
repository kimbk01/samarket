import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const boardId = String(req.nextUrl.searchParams.get("boardId") || "").trim();
  if (!boardId) return NextResponse.json({ ok: false, error: "board_required" }, { status: 400 });

  const sb = getSupabaseServer();
  const { data: articles, error } = await sb
    .from("external_articles")
    .select(
      "id, external_article_key, title, author, published_at, thumbnail_candidate, canonical_url, list_fetched_at, detail_fetched_at"
    )
    .eq("board_id", boardId)
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("list_fetched_at", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const ids = (articles ?? []).map((a) => a.id);
  const { data: links } = ids.length
    ? await sb.from("external_publish_links").select("article_id, status, community_post_id").in("article_id", ids)
    : { data: [] as Array<{ article_id: string; status: string; community_post_id: string | null }> };

  const linkBy = new Map((links ?? []).map((l) => [l.article_id, l]));

  return NextResponse.json({
    ok: true,
    articles: (articles ?? []).map((a) => {
      const link = linkBy.get(a.id);
      return {
        id: a.id,
        externalKey: a.external_article_key,
        title: a.title,
        author: a.author,
        publishedAt: a.published_at,
        thumbnailUrl: a.thumbnail_candidate,
        canonicalUrl: a.canonical_url,
        hasDetail: Boolean(a.detail_fetched_at),
        publishStatus: link?.status ?? "never_published",
        communityPostId: link?.community_post_id ?? null,
      };
    }),
  });
}
