import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { loadMeStoresListForUser } from "@/lib/me/load-me-stores-for-user";
import { listOwnerSponsoredCampaignsForStores } from "@/lib/stores/advertising/owner-store-sponsored-writer";
import { listOwnerBannerCampaignsForStores } from "@/lib/stores/advertising/owner-banner-writer";
import {
  DELIVERY_AD_OWNER_PRICING_PRODUCT,
  lifecycleToOwnerSummaryBucket,
  isStoreEligibleForOwnerAdApplication,
} from "@/lib/stores/advertising/owner-store-sponsored-contract";
import { listOwnerDeliveryAdOperationsUnreadByCampaignIds } from "@/lib/stores/advertising/delivery-ad-operations-unread";
import { loadOwnerBusinessCashBalance } from "@/lib/stores/advertising/delivery-ad-business-cash-writer";
import { DELIVERY_AD_BUSINESS_CASH_PLATFORM } from "@/lib/stores/advertising/delivery-ad-business-cash-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Hub list across owned stores — never returns other owners' campaigns. */
export async function GET() {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const session = await validateActiveSession(userId);
  if (!session.ok) return session.response;

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const storesResult = await loadMeStoresListForUser(sb, userId);
  if (!storesResult.ok) {
    return NextResponse.json({ ok: false, error: storesResult.error }, { status: 500 });
  }

  const eligibleStores = storesResult.stores.filter((s) =>
    isStoreEligibleForOwnerAdApplication({
      approvalStatus: String(s.approval_status ?? ""),
      isVisible: s.is_visible === true,
    })
  );

  const storeIds = storesResult.stores.map((s) => s.id);
  const [sponsored, banners] = await Promise.all([
    listOwnerSponsoredCampaignsForStores(sb, userId, storeIds),
    listOwnerBannerCampaignsForStores(sb, userId, storeIds),
  ]);
  const campaigns = [
    ...sponsored.map((c) => ({ ...c, productKind: "store_sponsored" as const })),
    ...banners.map((c) => ({ ...c, productKind: "banner" as const })),
  ].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));

  const unreadByCampaignId = await listOwnerDeliveryAdOperationsUnreadByCampaignIds(sb, {
    ownerUserId: userId,
    campaigns: campaigns.map((c) => ({
      campaignId: c.id,
      productKind: c.productKind,
    })),
  });
  const businessCash = await loadOwnerBusinessCashBalance(sb, userId, "PHP");

  const summary = {
    under_review: 0,
    scheduled: 0,
    active: 0,
    paused: 0,
    ended: 0,
    draft: 0,
  };
  for (const c of campaigns) {
    if (c.lifecycleStatus === "DRAFT") {
      summary.draft += 1;
      continue;
    }
    const bucket = lifecycleToOwnerSummaryBucket(c.lifecycleStatus);
    if (bucket) summary[bucket] += 1;
  }

  return NextResponse.json({
    ok: true,
    campaigns,
    stores: storesResult.stores.map((s) => {
      const cat = (s as { store_categories?: { name?: string } | { name?: string }[] | null })
        .store_categories;
      const categoryLabel = Array.isArray(cat)
        ? cat[0]?.name ?? null
        : cat?.name ?? null;
      return {
        id: s.id,
        storeName: s.store_name,
        profileImageUrl: s.profile_image_url ?? null,
        approvalStatus: s.approval_status,
        isVisible: s.is_visible === true,
        eligible: isStoreEligibleForOwnerAdApplication({
          approvalStatus: String(s.approval_status ?? ""),
          isVisible: s.is_visible === true,
        }),
        categoryLabel,
      };
    }),
    eligibleStoreCount: eligibleStores.length,
    summary,
    unreadByCampaignId,
    businessCash: {
      balanceMinor: businessCash?.balanceMinor ?? 0,
      currency: businessCash?.currency ?? "PHP",
      externalTopUp: DELIVERY_AD_BUSINESS_CASH_PLATFORM.externalTopUp,
    },
    meta: { pricing: DELIVERY_AD_OWNER_PRICING_PRODUCT },
  });
}
