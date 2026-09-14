import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { applyCommunityPointReclaimOnPostAdminRemove } from "@/lib/points/community-point-bridge";
import {
  formatAdminMemberLabel,
  loadAdminMemberIdentityMap,
} from "@/lib/admin-community/member-identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/community/engine/posts/:postId
 * Operator post detail — existing community_posts authority only.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ postId: string }> }) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const { postId } = await ctx.params;
  const id = postId?.trim();
  if (!id) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  const { data, error } = await sb
    .from("community_posts")
    .select(
      "id, user_id, location_id, category, topic_id, topic_slug, title, content, status, is_reported, report_count, like_count, comment_count, view_count, created_at, updated_at, region_label, is_sample_data"
    )
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const row = data as Record<string, unknown>;
  const uid = String(row.user_id ?? "");
  const identityMap = await loadAdminMemberIdentityMap(sb, [uid]);
  const identity = uid ? identityMap.get(uid) : undefined;

  let images: Array<{ id: string; url: string; sort_order: number }> = [];
  const { data: imgs } = await sb
    .from("community_post_images")
    .select("id, image_url, sort_order")
    .eq("post_id", id)
    .order("sort_order", { ascending: true });
  if (Array.isArray(imgs)) {
    images = imgs.map((img) => {
      const i = img as { id?: string; image_url?: string; url?: string; sort_order?: number };
      return {
        id: String(i.id ?? ""),
        url: String(i.image_url ?? i.url ?? ""),
        sort_order: Number(i.sort_order ?? 0) || 0,
      };
    });
  }

  return NextResponse.json({
    ok: true,
    post: {
      ...row,
      author_nickname: identity?.nickname ?? null,
      author_username: identity?.username ?? null,
      author_label: formatAdminMemberLabel(identity ?? null),
      images,
    },
  });
}

/**
 * PATCH /api/admin/community/engine/posts/:postId
 * body: {
 *   status?: 'active'|'hidden'|'deleted',
 *   isReported?: boolean,
 *   title?: string,
 *   content?: string,
 *   topicId?: string,
 *   topicSlug?: string,
 * }
 * Content/topic edits reuse normal community_posts authority (post-publish correction).
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ postId: string }> }) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const { postId } = await ctx.params;
  const id = postId?.trim();
  if (!id) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  let body: {
    status?: string;
    isReported?: boolean;
    title?: string;
    content?: string;
    topicId?: string;
    topicSlug?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body.status === "active" || body.status === "hidden" || body.status === "deleted") {
    patch.status = body.status;
  }
  if (typeof body.isReported === "boolean") patch.is_reported = body.isReported;
  if (typeof body.title === "string") {
    const title = body.title.trim();
    if (!title) return NextResponse.json({ ok: false, error: "title_required" }, { status: 400 });
    patch.title = title;
  }
  if (typeof body.content === "string") {
    const content = body.content;
    if (!content.trim()) return NextResponse.json({ ok: false, error: "content_required" }, { status: 400 });
    patch.content = content;
  }

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  const topicId = typeof body.topicId === "string" ? body.topicId.trim() : "";
  const topicSlug = typeof body.topicSlug === "string" ? body.topicSlug.trim().toLowerCase() : "";
  if (topicId || topicSlug) {
    if (!topicId || !topicSlug) {
      return NextResponse.json({ ok: false, error: "topic_incomplete" }, { status: 400 });
    }
    const { getPhilifeNeighborhoodSectionSlugServer } = await import(
      "@/lib/community-feed/philife-neighborhood-section"
    );
    const { resolveTopicMeta } = await import("@/lib/community-feed/queries");
    const { deriveCommunityPostCategoryBucket } = await import(
      "@/lib/neighborhood/derive-community-post-category-bucket"
    );
    const sectionSlug = await getPhilifeNeighborhoodSectionSlugServer(sb);
    const meta = await resolveTopicMeta(sectionSlug, topicSlug);
    if (!meta || meta.is_feed_sort || meta.id !== topicId) {
      return NextResponse.json({ ok: false, error: "invalid_topic" }, { status: 400 });
    }
    patch.topic_id = meta.id;
    patch.topic_slug = topicSlug;
    patch.category = deriveCommunityPostCategoryBucket({
      topicOrCategoryRaw: topicSlug,
      isMeetup: Boolean(meta.allow_meetup),
    });
  }

  if (typeof patch.content === "string") {
    const { summarizeCommunityPostContent } = await import("@/lib/philife/interleaved-body-markdown");
    patch.summary = summarizeCommunityPostContent(String(patch.content));
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: "no_updates" }, { status: 400 });
  }

  const { data: before } = await sb
    .from("community_posts")
    .select("id, status, is_reported, title, content, topic_id, topic_slug, user_id")
    .eq("id", id)
    .maybeSingle();

  const { error } = await sb.from("community_posts").update(patch).eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  if (body.status === "hidden" || body.status === "deleted") {
    await applyCommunityPointReclaimOnPostAdminRemove({ postId: id });
  }

  const meta = getAuditRequestMeta(req);
  const contentEdited = typeof body.title === "string" || typeof body.content === "string" || Boolean(topicId);
  void appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: admin.userId,
    target_type: "community_post",
    target_id: id,
    action:
      typeof body.status === "string"
        ? `community_post.status_${body.status}`
        : contentEdited
          ? "community_post.content_update"
          : "community_post.update",
    before_json: before
      ? {
          status: (before as { status?: string | null }).status ?? null,
          is_reported: (before as { is_reported?: boolean | null }).is_reported ?? null,
          title: (before as { title?: string | null }).title ?? null,
          topic_slug: (before as { topic_slug?: string | null }).topic_slug ?? null,
          user_id: (before as { user_id?: string | null }).user_id ?? null,
        }
      : null,
    after_json: patch,
    ip: meta.ip,
    user_agent: meta.userAgent,
  });

  return NextResponse.json({ ok: true });
}
