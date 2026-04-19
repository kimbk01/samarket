import { NextResponse } from "next/server";
import { getOrderMatchAlertSoundUrl } from "@/lib/stores/order-match-alert-sound";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 주문 채팅 일치 확인 등 알림음 — 로그인 불필요 */
export async function GET() {
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: true, url: null });
  }
  const url = await getOrderMatchAlertSoundUrl(sb);
  return NextResponse.json({ ok: true, url: url ?? null });
}
