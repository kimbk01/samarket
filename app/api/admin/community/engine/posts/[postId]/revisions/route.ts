import { NextRequest, NextResponse } from "next/server";
import { requireCommunityAdmin } from "@/lib/admin/community-admin/community-admin-guards";
import {
  formatAdminMemberLabel,
  loadAdminMemberIdentityMap,
} from "@/lib/admin-community/member-identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/community/engine/posts/:postId/revisions?limit=50
 * 게시글 수정 이력 (설계 §E-3) — 각 행은 그 수정 **전** 값. 최신순.
 * → { ok, revisions: [{ id, post_id, editor_id, editor_role, editor_nickname, editor_label,
 *      title, content, content_blocks, topic_id, topic_slug, reason, created_at }] }
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ postId: string }> }) {
  const admin = await requireCommunityAdmin("content");
  if (!admin.ok) return admin.response;
  const { sb } = admin;

  const { postId } = await ctx.params;
  const id = postId?.trim();
  if (!id) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  const limitRaw = Number(req.nextUrl.searchParams.get("limit") ?? 50);
  const limit = Math.min(200, Math.max(1, Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 50));

  const { data, error } = await sb
    .from("community_post_revisions")
    .select("id, post_id, editor_id, editor_role, title, content, content_blocks, topic_id, topic_slug, reason, created_at")
    .eq("post_id", id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const identityMap = await loadAdminMemberIdentityMap(
    sb,
    rows.map((r) => String(r.editor_id ?? ""))
  );
  const revisions = rows.map((r) => {
    const editorId = r.editor_id != null ? String(r.editor_id) : null;
    const identity = editorId ? identityMap.get(editorId) : undefined;
    return {
      ...r,
      id: String(r.id ?? ""),
      editor_id: editorId,
      editor_role: String(r.editor_role ?? "system"),
      editor_nickname: identity?.nickname ?? null,
      editor_label: editorId ? formatAdminMemberLabel(identity ?? null) : null,
    };
  });

  return NextResponse.json({ ok: true, revisions });
}
