import { NextRequest, NextResponse } from "next/server";
import type { AdProductsResponse } from "@/lib/ads/types";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { fetchActiveAdProductsFromDb } from "@/lib/ads/ad-products-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/ads/products?boardKey=plife
 * 활성화된 광고 상품 목록
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

  const res: AdProductsResponse = { ok: true, products: db.products };
  return NextResponse.json(res);
}
