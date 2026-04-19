import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { ADMIN_NOTIFICATION_SETTINGS_SELECT } from "@/lib/admin/admin-public-settings-select";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 로그인 사용자에게 관리자 알림음 설정 공개 (클라이언트 재생용).
 * `/api/app/messenger-call-sound-config` 와 동일하게 세션 필수 — 서비스 롤 조회 남용·스크래핑 완화.
 * 민감정보 없음 — URL·볼륨·반복·쿨다운.
 */
export async function GET() {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  try {
    const sb = getSupabaseServer();
    const { data, error } = await sb.from("admin_notification_settings").select(ADMIN_NOTIFICATION_SETTINGS_SELECT);
    if (error) {
      if (error.message?.includes("does not exist")) {
        return NextResponse.json({ ok: true, items: [], table_missing: true });
      }
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json(
      { ok: true, items: data ?? [] },
      {
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
        },
      }
    );
  } catch {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
}
