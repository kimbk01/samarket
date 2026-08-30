import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import {
  isAdminDeliveryAdProduct,
  type AdminDeliveryAdListBucket,
  type AdminDeliveryAdProduct,
} from "@/lib/stores/advertising/admin-delivery-ad-contract";
import { loadAdminDeliveryAdCampaignList } from "@/lib/stores/advertising/admin-delivery-ad-loader";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKETS = new Set([
  "all",
  "review",
  "scheduled",
  "active",
  "held",
  "ended",
  "rejected",
]);

export async function GET(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const sp = req.nextUrl.searchParams;
  const productRaw = sp.get("product") ?? "all";
  const product: AdminDeliveryAdProduct | "all" =
    productRaw === "all"
      ? "all"
      : isAdminDeliveryAdProduct(productRaw)
        ? productRaw
        : "all";
  const bucketRaw = sp.get("bucket") ?? "all";
  const bucket = (BUCKETS.has(bucketRaw) ? bucketRaw : "all") as AdminDeliveryAdListBucket;

  const result = await loadAdminDeliveryAdCampaignList(sb, {
    product,
    bucket,
    storeId: sp.get("storeId"),
    ownerUserId: sp.get("ownerUserId"),
    inventoryKey: sp.get("inventory") ?? sp.get("inventoryKey"),
    primarySlug: sp.get("primarySlug") ?? sp.get("primary"),
    subSlug: sp.get("subSlug") ?? sp.get("sub"),
    limit: Number(sp.get("limit") || 200) || 200,
  });

  if (result.error) {
    return NextResponse.json(
      {
        ok: false,
        error: "db_error",
        detail: result.error,
        campaigns: [],
        summary: result.summary,
        policyCounts: result.policyCounts,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    campaigns: result.items,
    summary: result.summary,
    policyCounts: result.policyCounts,
    pricing: { model: "NOT_CONFIGURED", billing: "NONE" },
  });
}
