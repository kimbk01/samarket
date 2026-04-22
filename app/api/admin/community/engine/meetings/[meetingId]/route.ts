import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PATCH — 모임 상태/승인/노출 (관리자) */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ meetingId: string }> }) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const { meetingId } = await ctx.params;
  const id = meetingId?.trim();
  if (!id) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  let body: {
    status?: string;
    maxMembers?: number;
    platformApprovalStatus?: string;
    postStatus?: string;
    postHidden?: boolean;
    isClosed?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body.status && ["open", "closed", "ended", "cancelled"].includes(body.status)) {
    patch.status = body.status;
  }
  if (
    body.platformApprovalStatus &&
    ["pending_approval", "approved", "rejected"].includes(body.platformApprovalStatus)
  ) {
    patch.platform_approval_status = body.platformApprovalStatus;
  }
  if (typeof body.maxMembers === "number" && body.maxMembers > 0 && body.maxMembers <= 500) {
    patch.max_members = Math.floor(body.maxMembers);
  }
  if (typeof body.isClosed === "boolean") {
    patch.is_closed = body.isClosed;
  }

  const shouldPatchPost =
    (body.postStatus && ["active", "hidden"].includes(body.postStatus)) || typeof body.postHidden === "boolean";

  if (Object.keys(patch).length === 0 && !shouldPatchPost) {
    return NextResponse.json({ ok: false, error: "no_updates" }, { status: 400 });
  }

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  if (Object.keys(patch).length > 0) {
    const { error } = await sb.from("meetings").update(patch).eq("id", id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (shouldPatchPost) {
    const { data: meeting, error: meetingError } = await sb.from("meetings").select("post_id").eq("id", id).maybeSingle();
    if (meetingError) return NextResponse.json({ ok: false, error: meetingError.message }, { status: 500 });
    const postId = String((meeting as { post_id?: string | null } | null)?.post_id ?? "").trim();
    if (!postId) return NextResponse.json({ ok: false, error: "post_not_found" }, { status: 404 });
    const postPatch: Record<string, unknown> = {};
    if (body.postStatus && ["active", "hidden"].includes(body.postStatus)) {
      postPatch.status = body.postStatus;
    }
    if (typeof body.postHidden === "boolean") {
      postPatch.is_hidden = body.postHidden;
    }
    const { error: postError } = await sb.from("community_posts").update(postPatch).eq("id", postId);
    if (postError) return NextResponse.json({ ok: false, error: postError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
