import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { claimStoreCoupon } from "@/lib/stores/store-coupon-claim";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  const body = (await req.json().catch(() => null)) as { campaign_id?: string } | null;
  const campaignId = String(body?.campaign_id ?? "").trim();
  if (!campaignId) {
    return NextResponse.json({ ok: false, error: "missing_campaign_id" }, { status: 400 });
  }
  const result = await claimStoreCoupon({ sb, buyerUserId: userId, campaignId });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.httpStatus });
  }
  return NextResponse.json({ ok: true, entitlement: result.entitlement });
}
