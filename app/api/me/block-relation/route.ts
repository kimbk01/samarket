import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET ?otherUserId=uuid
 * 양방향 차단 여부 (서비스 롤 — RLS로는 상대가 나를 차단한 행을 볼 수 없을 수 있음)
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const otherUserId = req.nextUrl.searchParams.get("otherUserId")?.trim() ?? "";
  if (!otherUserId) {
    return NextResponse.json(
      { ok: false, error: "otherUserId가 필요합니다." },
      { status: 400 }
    );
  }

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json(
      { ok: false, error: "서버 설정이 필요합니다." },
      { status: 500 }
    );
  }

  const [{ data: b1 }, { data: b2 }] = await Promise.all([
    sb
      .from("user_blocks")
      .select("id")
      .eq("user_id", auth.userId)
      .eq("blocked_user_id", otherUserId)
      .maybeSingle(),
    sb
      .from("user_blocks")
      .select("id")
      .eq("user_id", otherUserId)
      .eq("blocked_user_id", auth.userId)
      .maybeSingle(),
  ]);

  const isBlocked = Boolean(b1 || b2);
  return NextResponse.json({ ok: true, isBlocked });
}
