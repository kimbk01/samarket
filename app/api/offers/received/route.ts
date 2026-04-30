import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { resolveServiceSupabaseForApi } from "@/lib/supabase/resolve-service-supabase-for-api";
import { listPriceOffers } from "@/lib/offers/offers.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const sb = resolveServiceSupabaseForApi();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "서버 설정이 필요합니다." }, { status: 500 });
  }
  const typedSb = sb as SupabaseClient;

  const productId = req.nextUrl.searchParams.get("productId")?.trim() ?? "";
  const result = await listPriceOffers(typedSb, {
    userId: auth.userId,
    role: "seller",
    productId,
  });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error.error, code: result.error.code },
      { status: result.error.status }
    );
  }

  return NextResponse.json({ ok: true, offers: result.value });
}
