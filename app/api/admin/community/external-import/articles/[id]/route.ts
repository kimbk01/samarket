import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const { id } = await ctx.params;
  const sb = getSupabaseServer();

  const { data: article } = await sb.from("external_articles").select("*").eq("id", id).maybeSingle();
  if (!article) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const { data: doc } = await sb
    .from("external_article_documents")
    .select("*")
    .eq("article_id", id)
    .maybeSingle();

  const { data: link } = await sb
    .from("external_publish_links")
    .select("*")
    .eq("article_id", id)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    article: {
      id: article.id,
      title: article.title,
      author: article.author,
      publishedAt: article.published_at,
      canonicalUrl: article.canonical_url,
      thumbnailUrl: article.thumbnail_candidate,
    },
    document: doc
      ? {
          title: doc.title,
          author: doc.author,
          publishedAt: doc.published_at,
          sourceDocument: doc.source_document,
          draftDocument: doc.draft_document,
          nodes: (doc.draft_document as { nodes?: unknown } | null)?.nodes ?? doc.nodes,
          bodyImageUrls: doc.body_image_urls,
          galleryImageUrls: doc.gallery_image_urls,
          thumbnailUrl: doc.thumbnail_url,
          mediaMeta: doc.media_meta,
        }
      : null,
    publishLink: link
      ? { status: link.status, communityPostId: link.community_post_id, topicId: link.community_topic_id }
      : null,
  });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const { id } = await ctx.params;
  const sb = getSupabaseServer();

  let body: { title?: string; nodes?: unknown[]; excludeImageUrls?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const { data: doc } = await sb
    .from("external_article_documents")
    .select("id, source_document, nodes, title")
    .eq("article_id", id)
    .maybeSingle();
  if (!doc) return NextResponse.json({ ok: false, error: "document_required" }, { status: 409 });

  const exclude = new Set((body.excludeImageUrls ?? []).map(String));
  let nodes = Array.isArray(body.nodes) ? body.nodes : doc.nodes;
  if (exclude.size && Array.isArray(nodes)) {
    nodes = nodes.filter((n) => {
      const src = (n as { src?: string })?.src;
      return !(typeof src === "string" && exclude.has(src));
    });
  }

  const draft = {
    title: body.title != null ? String(body.title).trim() : doc.title,
    nodes,
    // source_document immutable — never written here
  };

  const { error } = await sb
    .from("external_article_documents")
    .update({ draft_document: draft, updated_at: new Date().toISOString() })
    .eq("article_id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, draft });
}
