import { NextRequest, NextResponse } from "next/server";
import { getAdProducts } from "@/lib/ads/mock-ad-data";
import type { AdProductsResponse } from "@/lib/ads/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/ads/products?boardKey=plife
 * 활성화된 광고 상품 목록을 반환한다.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const boardKey = req.nextUrl.searchParams.get("boardKey");
  const products = getAdProducts(boardKey);
  const res: AdProductsResponse = { ok: true, products };
  return NextResponse.json(res);
}
