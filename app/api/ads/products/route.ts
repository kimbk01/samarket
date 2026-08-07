import { NextRequest, NextResponse } from "next/server";
import type { AdProductsResponse } from "@/lib/ads/types";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { fetchActiveAdProductsFromDb } from "@/lib/ads/ad-products-supabase";
import { isPostAdsAdTypeOpenForNewApply } from "@/lib/ads/post-ads-authority";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/ads/products?boardKey=plife
 * 활성화된 광고 상품 목록
 * mid_insert quarantined — Admin Feed Ads owns mid-slot banners.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const boardKey = req.nextUrl.searchParams.get("boardKey");
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    const res: AdProductsResponse = { ok: true, products: [] };
    return NextResponse.json(res);
  }

  const db = await fetchActiveAdProductsFromDb(sb, boardKey);
  if (!db.ok) {
    const res: AdProductsResponse = { ok: true, products: [] };
    return NextResponse.json(res);
  }

  const products = db.products.filter((p) => isPostAdsAdTypeOpenForNewApply(p.adType));
  const res: AdProductsResponse = { ok: true, products };
  return NextResponse.json(res);
}
