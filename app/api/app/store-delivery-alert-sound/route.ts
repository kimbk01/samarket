import { NextResponse } from "next/server";
import { fetchStoreDeliveryAlertSoundUrl } from "@/lib/stores/store-delivery-alert-sound";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const dynamic = "force-dynamic";

/** 매장주·브라우저 알림 재생용 — 로그인 불필요. 관리자(application-settings) 전역 알림음 URL만 반환 */
export async function GET() {
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: true, url: null });
  }
  const url = await fetchStoreDeliveryAlertSoundUrl(sb);
  return NextResponse.json({ ok: true, url: url ?? null });
}
