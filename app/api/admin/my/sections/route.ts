import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { listAdminMyPageSections } from "@/lib/admin/my/admin-mypage-cms-read";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** V3-11 — 관리자 마이페이지 sections 조회 (브라우저 직접 조회 대체, 읽기 전용). */
export async function GET(): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  try {
    const sections = await listAdminMyPageSections(sb);
    return NextResponse.json({ ok: true, sections });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
