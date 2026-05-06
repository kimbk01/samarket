import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { isPrivilegedAdminRole, normalizeAdminRole } from "@/lib/auth/admin-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 배정 후보: profiles.role 이 관리자 권한인 계정 (표시용 한도).
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

  const { data, error } = await (sb as any)
    .from("profiles")
    .select("id, nickname, username, role")
    .order("nickname", { ascending: true, nullsFirst: false })
    .limit(400);

  if (error) {
    return NextResponse.json({ error: error.message ?? "query_failed" }, { status: 500 });
  }

  const operators = (Array.isArray(data) ? data : []).filter((row: { role?: string | null }) =>
    isPrivilegedAdminRole(row.role)
  );

  return NextResponse.json({
    operators: operators.map((row: { id?: string; nickname?: string | null; username?: string | null; role?: string | null }) => ({
      id: String(row.id ?? ""),
      nickname: String(row.nickname ?? "").trim(),
      username: String(row.username ?? "").trim(),
      role: normalizeAdminRole(row.role),
    })),
  });
}
