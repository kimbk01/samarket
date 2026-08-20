import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { mapPointPromotionOrderRow } from "@/lib/points/point-promotion-orders-db";
import { isPostEligibleForPromotionBoost } from "@/lib/promotion/trade-promotion-overlay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/trade-promotion-orders?status=pending_review */
export async function GET(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const status = (req.nextUrl.searchParams.get("status") || "pending_review").trim();
  let q = sb
    .from("point_promotion_orders")
    .select("*")
    .eq("domain", "trade")
    .order("created_at", { ascending: false })
    .limit(100);
  if (status) q = q.eq("order_status", status);

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const orders = (data ?? []).map((r) => {
    const mapped = mapPointPromotionOrderRow(r as Record<string, unknown>);
    return {
      ...mapped,
      reviewReason:
        (r as { review_reason?: string | null }).review_reason != null
          ? String((r as { review_reason?: string | null }).review_reason)
          : null,
    };
  });

  const postIds = [...new Set(orders.map((o) => o.targetId).filter(Boolean))];
  const listingById = new Map<
    string,
    { status: string; sellerListingState: unknown; title: string; thumbnailUrl: string | null }
  >();
  if (postIds.length > 0) {
    const { data: posts } = await sb
      .from("posts")
      .select("id, status, seller_listing_state, title, thumbnail_url")
      .in("id", postIds);
    for (const p of (posts ?? []) as Record<string, unknown>[]) {
      const id = String(p.id ?? "");
      if (!id) continue;
      listingById.set(id, {
        status: String(p.status ?? ""),
        sellerListingState: p.seller_listing_state,
        title: String(p.title ?? ""),
        thumbnailUrl: p.thumbnail_url != null ? String(p.thumbnail_url) : null,
      });
    }
  }

  const enriched = orders.map((o) => {
    const listing = listingById.get(o.targetId);
    const listingStatus = listing?.status ?? "missing";
    const listingEligible = listing
      ? isPostEligibleForPromotionBoost(listing.status, listing.sellerListingState)
      : false;
    return {
      ...o,
      targetTitle: listing?.title || o.targetTitle,
      listingStatus,
      listingEligible,
      thumbnailUrl: listing?.thumbnailUrl ?? null,
    };
  });

  return NextResponse.json({ ok: true, orders: enriched });
}
