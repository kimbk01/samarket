import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

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
  const createdFrom = sp.get("createdFrom")?.trim() || "";
  const createdTo = sp.get("createdTo")?.trim() || "";
  const limit = Math.min(Math.max(parseInt(sp.get("limit") ?? "50", 10) || 50, 1), 100);
  const offset = Math.min(Math.max(parseInt(sp.get("offset") ?? "0", 10) || 0, 0), 10_000);

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  let postIdsForTopic: string[] | null = null;
  if (topicSlug) {
    const { data: posts, error: pErr } = await sb
      .from("community_posts")
      .select("id")
      .eq("topic_slug", topicSlug)
      .limit(500);
    if (pErr) {
      return NextResponse.json({ ok: false, error: pErr.message }, { status: 500 });
    }
    postIdsForTopic = (posts ?? []).map((p) => String((p as { id?: string }).id ?? "")).filter(Boolean);
    if (!postIdsForTopic.length) {
      return NextResponse.json({ ok: true, comments: [] });
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
  if (postIdsForTopic) q = q.in("post_id", postIdsForTopic);
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

  const comments = rows.map((r) => {
    const pid = String(r.post_id ?? "");
    const meta = postMeta[pid];
    return {
      ...r,
      post_title: meta?.title ?? "",
      topic_slug: meta?.topic_slug ?? "",
    };
  });

  return NextResponse.json({ ok: true, comments });
}
