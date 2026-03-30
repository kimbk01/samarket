import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

/** GET — 모임 관리 목록 */
export async function GET(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const status = req.nextUrl.searchParams.get("status")?.trim() || "";
  const limit = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get("limit") ?? "40", 10) || 40, 1), 100);

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  let q = sb
    .from("meetings")
    .select(
      "id, post_id, title, host_user_id, status, max_members, meeting_date, chat_room_id, join_policy, entry_policy, password_hash, created_at, is_sample_data"
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (status && ["open", "closed", "ended", "cancelled"].includes(status)) {
    q = q.eq("status", status);
  }
  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = Array.isArray(data)
    ? data.map((r) => {
        const row = { ...(r as Record<string, unknown>) };
        const ph = row.password_hash;
        const hasPassword = typeof ph === "string" && ph.length > 0;
        delete row.password_hash;
        return { ...row, has_password: hasPassword };
      })
    : [];

  return NextResponse.json({ ok: true, meetings: rows });
}
