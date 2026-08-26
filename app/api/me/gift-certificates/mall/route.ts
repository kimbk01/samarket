import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { loadGiftMallProducts } from "@/lib/gift-certificate/load-gift-mall-products";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/me/gift-certificates/mall */
export async function GET(req: NextRequest) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  const storeId = new URL(req.url).searchParams.get("storeId")?.trim() || undefined;
  const loaded = await loadGiftMallProducts(sb, { storeId });
  if (!loaded.ok) {
    return NextResponse.json({ ok: false, error: loaded.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true, products: loaded.products });
}
