import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireSuperAdmin } from "@/lib/admin/require-admin-permission";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import { requireSupabaseEnv } from "@/lib/env/runtime";
import { ADMIN_REASON_REQUIRED_CODE, parseAdminReason } from "@/lib/admin/operator-ux/admin-reason";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 테스트 회원 정리 — role=admin 인 행만 남기고 나머지 test_users 삭제
 */
export async function POST(req: NextRequest) {
  const admin = await requireSuperAdmin();
  if (!admin.ok) return admin.response;
  /** R2 — 일괄 정리(L3) 사유 필수: 화면 확인창의 사유를 감사 `after.reason` 에 남긴다. */
  const body = (await req.json().catch(() => ({}))) as { reason?: unknown };
  const reason = parseAdminReason(body.reason);
  if (!reason) {
    return NextResponse.json({ ok: false, error: ADMIN_REASON_REQUIRED_CODE }, { status: 400 });
  }
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
    after: { kept: "role=admin", reason },
  });

  return NextResponse.json({ ok: true, message: "관리자(role=admin) 계정만 남겼습니다." });
}
