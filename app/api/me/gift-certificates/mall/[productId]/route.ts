import { NextRequest, NextResponse } from "next/server";
import { loadGiftMallProductById } from "@/lib/gift-certificate/load-gift-mall-products";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/me/gift-certificates/mall/[productId]
 * Canonical by-id customer product — same eligibility as Mall list / purchase.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ productId: string }> }
) {
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  const { productId } = await ctx.params;
  const storeId = new URL(req.url).searchParams.get("storeId")?.trim() || undefined;
  const loaded = await loadGiftMallProductById(sb, String(productId ?? ""), { storeId });
  if (!loaded.ok) {
    if ("reason" in loaded) {
      return NextResponse.json(
        { ok: false, error: loaded.error, reason: loaded.reason },
        { status: loaded.error === "not_found" ? 404 : 409 }
      );
    }
    return NextResponse.json({ ok: false, error: loaded.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true, product: loaded.product });
}
