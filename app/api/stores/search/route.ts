import { NextResponse } from "next/server";
import { searchDeliveryDomain } from "@/lib/delivery/search/search-delivery";
import { resolveStoreListDeliveryOrigin } from "@/lib/stores/store-list-delivery-origin";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: true, stores: [], menus: [], result_count: 0 });
  }
  /** S-09 — 홈 피드·업종 목록과 같은 origin 판정 (주소 출처·LGU·열람 게이트 동일) */
  const origin = await resolveStoreListDeliveryOrigin(sb, searchParams);
  const result = await searchDeliveryDomain({
    q,
    storeLimit: 10,
    menuLimit: 20,
    origin,
  });
  return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
}
