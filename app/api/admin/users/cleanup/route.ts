import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireSuperAdmin } from "@/lib/admin/require-admin-permission";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import { requireSupabaseEnv } from "@/lib/env/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 테스트 회원 정리 — role=admin 인 행만 남기고 나머지 test_users 삭제
 */
export async function POST(req: NextRequest) {
  const admin = await requireSuperAdmin();
  if (!admin.ok) return admin.response;
  const supabaseEnv = requireSupabaseEnv({ requireServiceKey: true });
  if (!supabaseEnv.ok) {
    return NextResponse.json({ ok: false, error: supabaseEnv.error }, { status: 500 });
  }

  const supabase = createClient(supabaseEnv.url, supabaseEnv.serviceKey, {
    auth: { persistSession: false },
  });

  const { error } = await (supabase as import("@supabase/supabase-js").SupabaseClient<any>)
    .from("test_users")
    .delete()
    .neq("role", "admin");

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  await appendAdminRouteAudit(supabase, req, {
    actorId: admin.actor.userId,
    targetType: "test_users",
    targetId: "bulk",
    action: "test_users.cleanup",
    after: { kept: "role=admin" },
  });

  return NextResponse.json({ ok: true, message: "관리자(role=admin) 계정만 남겼습니다." });
}
