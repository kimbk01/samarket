import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

/** PATCH — 정원·상태 (관리자) */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ meetingId: string }> }) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const { meetingId } = await ctx.params;
  const id = meetingId?.trim();
  if (!id) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  let body: { status?: string; maxMembers?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body.status && ["open", "closed", "ended", "cancelled"].includes(body.status)) {
    patch.status = body.status;
  }
  if (typeof body.maxMembers === "number" && body.maxMembers > 0 && body.maxMembers <= 500) {
    patch.max_members = Math.floor(body.maxMembers);
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: "no_updates" }, { status: 400 });
  }

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  const { error } = await sb.from("meetings").update(patch).eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
