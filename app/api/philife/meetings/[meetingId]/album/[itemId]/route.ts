import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ meetingId: string; itemId: string }>;
}

/** DELETE /api/philife/meetings/[meetingId]/album/[itemId] — 앨범 사진 삭제 (업로더 or 모임장) */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { meetingId, itemId } = await ctx.params;
  const id = meetingId?.trim();
  const iid = itemId?.trim();
  if (!id || !iid) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  const { data: item } = await sb
    .from("meeting_album_items")
    .select("id, uploader_user_id, image_url, meeting_id")
    .eq("id", iid)
    .eq("meeting_id", id)
    .eq("is_hidden", false)
    .maybeSingle();

  const it = item as { id?: string; uploader_user_id?: string; image_url?: string } | null;
  if (!it?.id) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const isUploader = it.uploader_user_id === auth.userId;
  if (!isUploader) {
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
    .from("meeting_album_items")
    .update({ is_hidden: true })
    .eq("id", iid);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
