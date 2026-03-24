import { NextRequest, NextResponse } from "next/server";
import { fetchStoreOrderAlertSoundUrlForStore } from "@/lib/stores/store-delivery-alert-sound";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const dynamic = "force-dynamic";

/** 매장주·브라우저 알림 재생용 — 로그인 불필요, URL만 공개. `?storeId=`이면 매장 전용 우선 */
export async function GET(req: NextRequest) {
  const storeId = req.nextUrl.searchParams.get("storeId")?.trim() ?? "";
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: true, url: null });
  }
  const url = await fetchStoreOrderAlertSoundUrlForStore(sb, storeId || null);
  return NextResponse.json({ ok: true, url: url ?? null });
}
