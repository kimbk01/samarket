import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { GIFT_TABLES } from "@/lib/gift-certificate/gift-certificate-schema";
import {
  aggregatePromoDisplayFields,
  computeOwnerEconomicReportingSum,
  type GiftPromoParty,
} from "@/lib/gift-certificate/gift-promo-economics";
import { getCachedStoreIfOwner } from "@/lib/stores/owner-store-ownership-cache";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/me/stores/[storeId]/gift-certificates/promo — Ledger C owner promo summary */
export async function GET(
  _req: Request,
  context: { params: Promise<{ storeId: string }> }
) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { storeId } = await context.params;
  const sid = typeof storeId === "string" ? storeId.trim() : "";
  if (!sid) {
    return NextResponse.json({ ok: false, error: "missing_store_id" }, { status: 400 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  const gate = await getCachedStoreIfOwner(sb, userId, sid);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }

  const { data, error } = await sb
    .from(GIFT_TABLES.promoObligations)
    .select("id, instance_id, party, contracted_amount, recognized_amount, settled_amount, created_at")
    .eq("store_id", sid)
    .eq("party", "OWNER")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const obligations = (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id),
      instanceId: String(r.instance_id),
      party: String(r.party) as GiftPromoParty,
      contractedAmount: Math.trunc(Number(r.contracted_amount) || 0),
      recognizedAmount: Math.trunc(Number(r.recognized_amount) || 0),
      settledAmount: Math.trunc(Number(r.settled_amount) || 0),
      createdAt: String(r.created_at ?? ""),
    };
  });

  const ownerPromo = aggregatePromoDisplayFields(obligations);

  return NextResponse.json({
    ok: true,
    ownerPromo,
    obligations,
    economicReportingNote:
      "recognizedMerchantNet minus ownerPromoRecognized — reporting only, never mutates REVENUE_AVAILABLE",
  });
}

export type OwnerPromoApiPayload = {
  ok: boolean;
  ownerPromo: ReturnType<typeof aggregatePromoDisplayFields>;
  obligations: Array<{
    id: string;
    instanceId: string;
    party: GiftPromoParty;
    contractedAmount: number;
    recognizedAmount: number;
    settledAmount: number;
    createdAt: string;
  }>;
};

export { computeOwnerEconomicReportingSum };
