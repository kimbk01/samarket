import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

interface Ctx {
  params: Promise<{ meetingId: string; postId: string }>;
}

/** DELETE /api/philife/meetings/[meetingId]/feed/[postId] — 피드 글 삭제 (작성자 or 모임장) */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { meetingId, postId } = await ctx.params;
  const id = meetingId?.trim();
  const pid = postId?.trim();
  if (!id || !pid) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  const { data: post } = await sb
    .from("meeting_feed_posts")
    .select("id, author_user_id, meeting_id")
    .eq("id", pid)
    .eq("meeting_id", id)
    .is("deleted_at", null)
    .maybeSingle();

  const p = post as { id?: string; author_user_id?: string; meeting_id?: string } | null;
  if (!p?.id) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const isAuthor = p.author_user_id === auth.userId;
  if (!isAuthor) {
    const { data: meetingRow } = await sb
      .from("meetings")
      .select("host_user_id, created_by")
      .eq("id", id)
      .maybeSingle();
    const m = meetingRow as { host_user_id?: string; created_by?: string } | null;
    const hostId = String(m?.host_user_id ?? m?.created_by ?? "").trim();
    if (hostId !== auth.userId) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
  }

  const { error } = await sb
    .from("meeting_feed_posts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", pid);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
