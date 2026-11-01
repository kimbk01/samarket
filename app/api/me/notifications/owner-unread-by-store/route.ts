import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { loadOwnerUnreadByStore } from "@/lib/notifications/owner-unread-by-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — 내 매장마다 안 읽은 오너 알림 수 (사장님 매장 종 「다른 매장 안 읽음」 · 재감사 2026-11-02 S3). */
export async function GET() {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  let sb;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  try {
    const stores = await loadOwnerUnreadByStore(sb, userId);
    return NextResponse.json({ ok: true, stores });
  } catch (err) {
    console.error("[me/notifications/owner-unread-by-store]", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
  }
}
