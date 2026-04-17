import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/supabase-server-route";

export const dynamic = "force-dynamic";

/** POST — 거래 presence heartbeat 시 `last_seen` 갱신(연결 유지·활동 기록) */
export async function POST() {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const sb = await createSupabaseRouteHandlerClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const now = new Date().toISOString();
  const { error } = await sb
    .from("profiles")
    .update({ trade_presence_last_seen_at: now })
    .eq("id", auth.userId);

  if (error) {
    if (error.message?.includes("column") || error.message?.includes("does not exist")) {
      return NextResponse.json({ ok: false, error: "schema_missing", detail: error.message }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
