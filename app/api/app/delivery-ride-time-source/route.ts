import { NextResponse } from "next/server";
import { loadDeliveryRideTimeSource } from "@/lib/delivery/delivery-ops-settings";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 비로그인 공개 — 오너 폼·클라이언트가 배달 ETA 소스만 조회 (비밀 없음) */
export async function GET() {
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json(
      { ok: true, source: "store" as const },
      { headers: { "Cache-Control": "public, max-age=15, s-maxage=15" } }
    );
  }
  const source = await loadDeliveryRideTimeSource(sb);
  return NextResponse.json(
    { ok: true, source },
    {
      headers: {
        /** 서버 메모리 TTL(`loadDeliveryRideTimeSource`)과 맞춰 짧게 — 전역 플래그만 노출 */
        "Cache-Control": "public, max-age=15, s-maxage=15",
      },
    }
  );
}
