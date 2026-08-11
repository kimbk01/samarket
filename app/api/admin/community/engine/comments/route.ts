import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { collectCommunityPostIdsForTopicSlug } from "@/lib/admin-community/collect-post-ids-for-topic";
import {
  formatAdminMemberLabel,
  loadAdminMemberIdentityMap,
} from "@/lib/admin-community/member-identity";
import { communityAdminStartOfTodayIso } from "@/lib/admin-community/home-summary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/community/engine/comments
 * Authority: community_comments only (not trade `comments`).
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sp = req.nextUrl.searchParams;
  const postId = sp.get("postId")?.trim() || "";
  const topicSlug = sp.get("topicSlug")?.trim().toLowerCase() || "";
  const userId = sp.get("userId")?.trim() || "";
  const status = sp.get("status")?.trim() || "";
  const period = sp.get("period")?.trim().toLowerCase() || "";
  let createdFrom = sp.get("createdFrom")?.trim() || "";
  const createdTo = sp.get("createdTo")?.trim() || "";
  if (period === "today" && !createdFrom) {
    createdFrom = communityAdminStartOfTodayIso();
  }
  const limit = Math.min(Math.max(parseInt(sp.get("limit") ?? "50", 10) || 50, 1), 100);
  const offset = Math.min(Math.max(parseInt(sp.get("offset") ?? "0", 10) || 0, 0), 10_000);

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  let postIdsForTopic: string[] | null = null;
  let topicFilterTruncated = false;
  if (topicSlug) {
    try {
      const collected = await collectCommunityPostIdsForTopicSlug(sb, topicSlug);
      postIdsForTopic = collected.ids;
      topicFilterTruncated = collected.truncated;
    } catch (e) {
      return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
    }
    if (!postIdsForTopic.length) {
      return NextResponse.json({ ok: true, comments: [], topicFilterTruncated: false });
    }
  }

  let q = sb
    .from("community_comments")
    .select(
      "id, post_id, user_id, content, status, like_count, is_hidden, is_deleted, created_at, updated_at"
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (postId) q = q.eq("post_id", postId);
  if (postIdsForTopic) {
    if (postIdsForTopic.length <= 200) {
      q = q.in("post_id", postIdsForTopic);
    } else {
      // Large topic: filter after fetch within page window is unsafe; chunk OR via multiple queries merged.
      // Prefer in() with first 200 for query, then warn truncated — but collect already paginated all ids.
      // PostgREST typically allows large in(); use chunks of 150 and take newest across chunks if needed.
      // Practical path: use .in with up to 500 ids (supabase default).
      q = q.in("post_id", postIdsForTopic.slice(0, 500));
      if (postIdsForTopic.length > 500) topicFilterTruncated = true;
    }
  }
  if (userId) q = q.eq("user_id", userId);
  if (status && ["active", "hidden", "deleted"].includes(status)) q = q.eq("status", status);
  if (createdFrom) q = q.gte("created_at", createdFrom);
  if (createdTo) q = q.lte("created_at", createdTo);

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const uniquePostIds = [...new Set(rows.map((r) => String(r.post_id ?? "")).filter(Boolean))];
  const postMeta: Record<string, { title: string; topic_slug: string }> = {};
  if (uniquePostIds.length) {
    const { data: posts } = await sb
      .from("community_posts")
      .select("id, title, topic_slug")
      .in("id", uniquePostIds);
    for (const p of posts ?? []) {
      const row = p as { id?: string; title?: string | null; topic_slug?: string | null };
      const id = String(row.id ?? "");
      if (!id) continue;
      postMeta[id] = {
        title: String(row.title ?? ""),
        topic_slug: String(row.topic_slug ?? "").trim().toLowerCase(),
      };
    }
  }

  const identityMap = await loadAdminMemberIdentityMap(
    sb,
    rows.map((r) => String(r.user_id ?? ""))
  );

  const comments = rows.map((r) => {
    const pid = String(r.post_id ?? "");
    const meta = postMeta[pid];
    const uid = String(r.user_id ?? "");
    const identity = uid ? identityMap.get(uid) : undefined;
    return {
      ...r,
      post_title: meta?.title ?? "",
      topic_slug: meta?.topic_slug ?? "",
      author_nickname: identity?.nickname ?? null,
      author_username: identity?.username ?? null,
      author_label: formatAdminMemberLabel(identity ?? null),
    };
  });

  return NextResponse.json({
    ok: true,
    comments,
    topicFilterTruncated: topicFilterTruncated || false,
  });
}
