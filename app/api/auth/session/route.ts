/**
 * GET /api/auth/session — (main) 앱 셸·프록시와 동일하게 Supabase 세션만 인정.
 * Kasama/test 쿠키는 HTML 진입이 막혀 있으므로 여기서 200이면 안 됨(불일치 시 화면만 남는 현상).
 */
import { NextResponse } from "next/server";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/supabase-server-route";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createSupabaseRouteHandlerClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, authenticated: false }, { status: 401 });
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    return NextResponse.json({ ok: false, authenticated: false }, { status: 401 });
  }
  return NextResponse.json({ ok: true, authenticated: true });
}
