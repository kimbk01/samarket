import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { publishExternalImportArticles } from "@/lib/external-import/publish/publish-selected";
import { isPhilifeNeighborhoodWriteEligibleRow } from "@/lib/neighborhood/philife-topic-slug-rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = getSupabaseServer();

  let body: { articleIds?: string[]; topicId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const articleIds = Array.isArray(body.articleIds)
    ? [...new Set(body.articleIds.map((x) => String(x).trim()).filter(Boolean))]
    : [];
  if (articleIds.length === 0) {
    return NextResponse.json({ ok: false, error: "selection_required", published: [], failed: [] }, { status: 400 });
  }

  const topicId = String(body.topicId || "").trim();
  if (!topicId) return NextResponse.json({ ok: false, error: "topic_required" }, { status: 400 });

  const { data: topic } = await sb
    .from("community_topics")
    .select("id, slug, name, is_active, is_visible, allow_meetup, is_feed_sort")
    .eq("id", topicId)
    .maybeSingle();
  if (!topic || topic.is_active === false || topic.is_visible === false) {
    return NextResponse.json({ ok: false, error: "topic_unavailable" }, { status: 400 });
  }
  if (
    !isPhilifeNeighborhoodWriteEligibleRow(
      Boolean(topic.allow_meetup),
      Boolean(topic.is_feed_sort),
      String(topic.slug || "")
    )
  ) {
    return NextResponse.json({ ok: false, error: "topic_not_write_eligible" }, { status: 400 });
  }

  // Ensure detail docs exist for selected — fail those without rather than auto-fetch all
  const result = await publishExternalImportArticles({
    sb,
    articleIds,
    topicId: topic.id,
    topicSlug: topic.slug,
  });

  return NextResponse.json({
    ok: result.failed.length === 0,
    published: result.published,
    failed: result.failed,
    count: result.published.length,
  });
}
