import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { internalErrorResponse } from "@/lib/security/internal-error-response";
import { loadAdminOwnerNoticeList } from "@/lib/notices/admin-owner-notices.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/stores/owner-notices — 어드민 「매장 공지」 목록 (조회 전용 · 설계 v3.2 §3-4 · Owner 2026-11-10).
 * 조회 권한 = `/admin/stores` 와 같음(활성 관리자 전원). 작성·수정은 `/api/admin/app-notices`(사장님 대상은 business 키).
 * 응답 행: 고정·제목·보는 사람·게시 상태·게시일·읽음 수/대상 수·마지막 알림 발송 결과.
 */
export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const res = await loadAdminOwnerNoticeList(sb);
  if (!res.ok) return internalErrorResponse("load_failed", "[admin/stores/owner-notices GET]", res.error, 500);
  return NextResponse.json({ ok: true as const, rows: res.rows, truncated: res.truncated });
}
