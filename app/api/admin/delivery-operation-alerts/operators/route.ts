import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { normalizeAdminRole } from "@/lib/auth/admin-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 배정 후보: active admin_memberships (표시용 한도).
 */
export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ error: "server_config" }, { status: 500 });
  }

  const { data: memberships, error: memErr } = await (sb as any)
    .from("admin_memberships")
    .select("user_id, role")
    .eq("status", "active")
    .in("role", ["admin", "super_admin"])
    .limit(400);

  if (memErr) {
    return NextResponse.json({ error: memErr.message ?? "query_failed" }, { status: 500 });
  }

  const memRows = Array.isArray(memberships) ? memberships : [];
  const ids = memRows.map((m: { user_id?: string }) => String(m.user_id ?? "")).filter(Boolean);
  const roleByUser = new Map(
    memRows.map((m: { user_id?: string; role?: string }) => [
      String(m.user_id ?? ""),
      normalizeAdminRole(m.role),
    ])
  );

  if (ids.length === 0) {
    return NextResponse.json({ operators: [] });
  }

  const { data, error } = await (sb as any)
    .from("profiles")
    .select("id, nickname, username")
    .in("id", ids)
    .order("nickname", { ascending: true, nullsFirst: false });

  if (error) {
    return NextResponse.json({ error: error.message ?? "query_failed" }, { status: 500 });
  }

  const operators = (Array.isArray(data) ? data : []).map(
    (row: { id?: string; nickname?: string | null; username?: string | null }) => ({
      id: String(row.id ?? ""),
      nickname: String(row.nickname ?? "").trim(),
      username: String(row.username ?? "").trim(),
      role: roleByUser.get(String(row.id ?? "")) ?? "admin",
    })
  );

  return NextResponse.json({ operators });
}
