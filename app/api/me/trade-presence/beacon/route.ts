import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/supabase-server-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST `sendBeacon` — 탭 백그라운드 등에서 마지막 접속 시각 flush.
 * 본문 JSON 파싱 실패 시에도 best-effort 로 갱신한다.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const sb = await createSupabaseRouteHandlerClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  try {
    const _raw = await req.text();
    void _raw;
  } catch {
    /* ignore */
  }

  const now = new Date().toISOString();
  const { error } = await sb
    .from("profiles")
    .update({ trade_presence_last_seen_at: now })
    .eq("id", auth.userId);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
