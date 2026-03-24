import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";

/**
 * 테스트 회원 정리 — role=admin 인 행만 남기고 나머지 test_users 삭제
 */
export async function POST(_req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ ok: false, error: "Supabase 설정 없음" }, { status: 500 });
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { error } = await (supabase as import("@supabase/supabase-js").SupabaseClient<any>)
    .from("test_users")
    .delete()
    .neq("role", "admin");

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: "관리자(role=admin) 계정만 남겼습니다." });
}
