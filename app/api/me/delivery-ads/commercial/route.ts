import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { getStoreIfOwner } from "@/lib/stores/owner-product-gate";
import {
  loadActivePartnerMembershipForStore,
  loadDeliveryAdCommercialCatalog,
  listSellablePackagesForOwnerWorkspace,
  quoteDeliveryAdApplicationCommercial,
} from "@/lib/stores/advertising/delivery-ad-commercial-catalog";
import { isDeliveryAdProductKey } from "@/lib/stores/advertising/delivery-ad-product-registry";
import {
  DELIVERY_AD_COMMERCIAL_PLACEMENT_LABELS,
  formatDeliveryAdPhpMinor,
} from "@/lib/stores/advertising/delivery-ad-commercial-labels";
import { isLaunchSellableInventoryKey } from "@/lib/stores/advertising/delivery-ad-launch-placement-product";
import { STORES_SEARCH_TOP_LAUNCH } from "@/lib/stores/advertising/delivery-ad-product-recovery-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * P0-C — Owner commercial workspace read.
 * GET ?storeId=&productKind=&inventoryKey=[&packageId=]
 * Returns only server-quoted packages (fail-closed when none sellable).
 */
export async function GET(req: NextRequest) {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const session = await validateActiveSession(userId);
  if (!session.ok) return session.response;

  const sp = req.nextUrl.searchParams;
  const storeId = String(sp.get("storeId") ?? "").trim();
  const productKindRaw = String(sp.get("productKind") ?? "").trim();
  const inventoryKey = String(sp.get("inventoryKey") ?? "").trim();
  const packageId = String(sp.get("packageId") ?? "").trim();

  if (!storeId || !isDeliveryAdProductKey(productKindRaw)) {
    return NextResponse.json({ ok: false, error: "invalid_params" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const gate = await getStoreIfOwner(sb, userId, storeId);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }

  const catalog = await loadDeliveryAdCommercialCatalog(sb);
  const product = catalog.products.find((p) => p.key === productKindRaw);
  const partner = await loadActivePartnerMembershipForStore(sb, storeId);

  const placements = catalog.placements
    .filter(
      (p) =>
        p.productKind === productKindRaw &&
        p.sellable &&
        isLaunchSellableInventoryKey(p.inventoryKey) &&
        p.inventoryKey !== STORES_SEARCH_TOP_LAUNCH.inventoryKey
    )
    .map((p) => ({
      inventoryKey: p.inventoryKey,
      sellable: p.sellable,
      labels:
        p.inventoryKey in DELIVERY_AD_COMMERCIAL_PLACEMENT_LABELS
          ? DELIVERY_AD_COMMERCIAL_PLACEMENT_LABELS[
              p.inventoryKey as keyof typeof DELIVERY_AD_COMMERCIAL_PLACEMENT_LABELS
            ]
          : null,
    }));

  if (!inventoryKey) {
    return NextResponse.json({
      ok: true,
      product: product
        ? {
            key: product.key,
            displayName: product.displayName,
            description: product.description,
            enabled: product.enabled,
            acceptingApplications: product.acceptingApplications,
          }
        : null,
      placements,
      partner: {
        active: partner.active,
        advertisingDiscountPercent: partner.advertisingDiscountPercent,
      },
      packages: [],
      quote: null,
      sellablePackageCount: 0,
      noSellablePackages: true,
      billing: { businessCash: true, chargeCollection: false },
    });
  }

  const listed = listSellablePackagesForOwnerWorkspace({
    catalog,
    productKind: productKindRaw,
    inventoryKey,
    partner,
  });

  const sellable = listed
    .filter((row) => row.quote.ok)
    .map((row) => {
      const q = row.quote;
      if (!q.ok) return null;
      return {
        packageId: row.package.id,
        code: row.package.code,
        displayName: row.package.displayName,
        durationDays: row.package.durationDays,
        currency: q.currency,
        basePriceMinor: q.basePriceMinor,
        partnerDiscountPercent: q.partnerDiscountPercent,
        finalPayableMinor: q.finalPayableMinor,
        commercialStatus: q.commercialStatus,
        basePriceDisplay: formatDeliveryAdPhpMinor(q.basePriceMinor),
        finalPayableDisplay: formatDeliveryAdPhpMinor(q.finalPayableMinor),
        partnerActive: partner.active && q.partnerDiscountPercent > 0,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p != null);

  let quote = null;
  if (packageId) {
    const q = await quoteDeliveryAdApplicationCommercial(sb, {
      productKind: productKindRaw,
      inventoryKey,
      packageId,
      storeId,
    });
    if (q.ok) {
      quote = {
        ok: true as const,
        packageId: q.packageId,
        packageCode: q.packageCode,
        packageDisplayName: q.packageDisplayName,
        durationDays: q.durationDays,
        currency: q.currency,
        basePriceMinor: q.basePriceMinor,
        partnerDiscountPercent: q.partnerDiscountPercent,
        partnerMembershipId: q.partnerMembershipId,
        finalPayableMinor: q.finalPayableMinor,
        commercialStatus: q.commercialStatus,
        basePriceDisplay: formatDeliveryAdPhpMinor(q.basePriceMinor),
        finalPayableDisplay: formatDeliveryAdPhpMinor(q.finalPayableMinor),
        partnerActive: Boolean(q.partnerMembershipId) && q.partnerDiscountPercent > 0,
      };
    } else {
      quote = { ok: false as const, error: q.error };
    }
  }

  return NextResponse.json({
    ok: true,
    product: product
      ? {
          key: product.key,
          displayName: product.displayName,
          description: product.description,
          enabled: product.enabled,
          acceptingApplications: product.acceptingApplications,
        }
      : null,
    placements,
    partner: {
      active: partner.active,
      advertisingDiscountPercent: partner.advertisingDiscountPercent,
    },
    packages: sellable,
    quote,
    sellablePackageCount: sellable.length,
    noSellablePackages: sellable.length === 0,
    billing: { businessCash: true, chargeCollection: false },
  });
}
