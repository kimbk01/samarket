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
import { evaluateStoresHomeFeedSellable, STORES_HOME_FEED_INVENTORY_KEY } from "@/lib/stores/advertising/delivery-ad-home-feed-sell-gate";
import {
  isOwnerSellableDeliveryAdPlacement,
  STORES_CATEGORY_FEED_INVENTORY_KEY,
} from "@/lib/stores/advertising/delivery-ad-owner-sellable";
import {
  assertOwnerSponsoredCategoryFeedSellable,
  loadOwnerStoreBrowseSlugs,
} from "@/lib/stores/advertising/owner-store-sponsored-writer";

import {
  loadStoreSponsoredSlotsUsed,
  resolveStoreSponsoredCapacityMax,
} from "@/lib/stores/advertising/store-sponsored-capacity";
import { scheduleWindowFromPackageDurationDays } from "@/lib/stores/advertising/owner-delivery-ad-commercial-bind";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * P0-C — Owner commercial workspace read.
 * GET ?storeId=&productKind=&inventoryKey=[&packageId=]
 * Returns only server-quoted packages (fail-closed when none sellable).
 */
type OwnerGateState = "sellable" | "blocked" | "check_failed";

/**
 * R-40·R-41: 이 매장 업종 광고 판정 — 사장님이 고른 대상(대분류·소분류)이 있으면 그 대상만, 없으면 하나라도 켜져 있으면 판매.
 * 매장 업종은 한 번만 읽는다. 조회 실패는 「판매 안 함」이 아니라 `check_failed`(→ 503 「확인 못 함」).
 */
async function storeCategoryFeedGateForOwner(
  sb: NonNullable<ReturnType<typeof tryGetSupabaseForStores>>,
  storeId: string,
  target: "primary" | "secondary" | null
): Promise<OwnerGateState> {
  try {
    const slugs = await loadOwnerStoreBrowseSlugs(sb, storeId);
    const kinds = target ? [target] : (["primary", "secondary"] as const);
    for (const kind of kinds) {
      const gate = await assertOwnerSponsoredCategoryFeedSellable(sb, {
        storeId,
        browseTargetKind: kind,
        browsePrimarySlug: slugs.primarySlug,
        browseSecondarySlug: kind === "secondary" ? slugs.secondarySlug : null,
      });
      if (gate.ok) return "sellable";
      if (gate.error === "capacity_check_failed") return "check_failed";
      if (!slugs.primarySlug) return "blocked";
    }
    return "blocked";
  } catch {
    return "check_failed";
  }
}

/**
 * C-DB SA-03: 매장 홍보 「남은 자리」 — 고른 기간 상품으로 지금 신청하면 겹치는 기간의 같은 지면 점유 수.
 * 최대 수 없음(null) = 제한 없음 → null. 판정은 제출 DB 함수와 같은 점유 함수.
 */
async function storeSponsoredSlots(
  sb: NonNullable<ReturnType<typeof tryGetSupabaseForStores>>,
  input: { storeId: string; inventoryKey: string; target: "primary" | "secondary" | null; durationDays: number }
): Promise<{ remaining: number; capacity: number } | null | "check_failed"> {
  try {
    const target = input.inventoryKey === STORES_CATEGORY_FEED_INVENTORY_KEY ? (input.target ?? "primary") : null;
    const slugs = target ? await loadOwnerStoreBrowseSlugs(sb, input.storeId) : null;
    const capacity = await resolveStoreSponsoredCapacityMax(sb, {
      inventoryKey: input.inventoryKey,
      browseTargetKind: target,
      primarySlug: slugs?.primarySlug ?? null,
      secondarySlug: target === "secondary" ? (slugs?.secondarySlug ?? null) : null,
    });
    if (capacity == null) return null;
    const window = scheduleWindowFromPackageDurationDays(input.durationDays);
    if (!window.ok) return null;
    const used = await loadStoreSponsoredSlotsUsed(sb, {
      storeId: input.storeId,
      inventoryKey: input.inventoryKey,
      browseTargetKind: target,
      startAtIso: window.startAtIso,
      endAtIso: window.endAtIso,
    });
    return { remaining: Math.max(0, capacity - used), capacity };
  } catch (e) {
    console.warn("[me/delivery-ads/commercial] slots check failed", e instanceof Error ? e.message : e);
    return "check_failed";
  }
}

/** R-40: 홈 홍보 판정 — 조회 실패를 「판매 준비 중」으로 숨기지 않는다 */
async function homeFeedGateForOwner(
  sb: NonNullable<ReturnType<typeof tryGetSupabaseForStores>>
): Promise<OwnerGateState> {
  try {
    return (await evaluateStoresHomeFeedSellable(sb)) ? "sellable" : "blocked";
  } catch {
    return "check_failed";
  }
}

/**
 * D-18 (광고 감사 · 2026-11-27): 가격 목록·견적 응답은 캐시하지 않는다 — 어드민 금액 변경이 다음 열기부터 바로 보이게.
 * 모든 응답(성공·오류)에 `Cache-Control: private, no-store`.
 */
export async function GET(req: NextRequest) {
  const res = await getUncached(req);
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}

async function getUncached(req: NextRequest): Promise<NextResponse> {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const session = await validateActiveSession(userId);
  if (!session.ok) return session.response;

  const sp = req.nextUrl.searchParams;
  const storeId = String(sp.get("storeId") ?? "").trim();
  const productKindRaw = String(sp.get("productKind") ?? "").trim();
  const inventoryKey = String(sp.get("inventoryKey") ?? "").trim();
  const packageId = String(sp.get("packageId") ?? "").trim();
  const browseTargetRaw = String(sp.get("browseTargetKind") ?? "").trim();
  const browseTarget = browseTargetRaw === "primary" || browseTargetRaw === "secondary" ? browseTargetRaw : null;

  if (!storeId || !isDeliveryAdProductKey(productKindRaw)) {
    return NextResponse.json({ ok: false, error: "invalid_params" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const gate = await getStoreIfOwner(sb, userId, storeId);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }

  /** R-45: 광고 설정 조회 실패를 「판매 준비 중」(상품 0개)으로 숨기지 않는다 — 503 「확인 못 함」 */
  let catalog: Awaited<ReturnType<typeof loadDeliveryAdCommercialCatalog>>;
  try {
    catalog = await loadDeliveryAdCommercialCatalog(sb, { strict: true });
  } catch (e) {
    console.warn("[me/delivery-ads/commercial] catalog load failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "capacity_check_failed" }, { status: 503 });
  }
  const product = catalog.products.find((p) => p.key === productKindRaw);
  const partner = await loadActivePartnerMembershipForStore(sb, storeId);

  /** SA-01: 배달 홈 노출 자리가 꺼져 있으면 홈 홍보를 사장님 선택지에서 뺀다 (판매 판정 1곳) */
  /** R-23: 이 매장 업종에 업종 광고가 꺼져 있으면 업종 목록을 선택지에서 뺀다 — 제출 판정과 같은 함수 */
  const [homeGate, categoryGate]: [OwnerGateState, OwnerGateState] =
    productKindRaw === "store_sponsored"
      ? await Promise.all([homeFeedGateForOwner(sb), storeCategoryFeedGateForOwner(sb, storeId, browseTarget)])
      : ["sellable", "sellable"];
  /** R-40: 판정 조회 실패 = 503 「확인 못 함」 (상품 0개 「판매 준비 중」으로 보이지 않게) */
  if (homeGate === "check_failed" || categoryGate === "check_failed") {
    return NextResponse.json({ ok: false, error: "capacity_check_failed" }, { status: 503 });
  }
  const homeFeedSellable = homeGate === "sellable";
  const categoryFeedSellable = categoryGate === "sellable";
  const placements = catalog.placements
    /** 판정 1곳 — 광고 요금 안내와 같은 함수 */
    .filter((p) =>
      isOwnerSellableDeliveryAdPlacement(p, productKindRaw, { homeFeedSellable, categoryFeedSellable })
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

  /** SA-01: 꺼진 홈 홍보는 기간 상품도 0개 → 화면은 「판매 준비 중」 · 신청 버튼 꺼짐 */
  const homeFeedBlocked = inventoryKey === STORES_HOME_FEED_INVENTORY_KEY && !homeFeedSellable;
  /** R-33: 이 매장 업종에 업종 광고가 꺼져 있으면 업종 목록도 기간 상품 0개 (직접 호출해도 견적이 나오지 않게) */
  const categoryFeedBlocked = inventoryKey === STORES_CATEGORY_FEED_INVENTORY_KEY && !categoryFeedSellable;
  const sellable = listed
    .filter((row) => row.quote.ok && !homeFeedBlocked && !categoryFeedBlocked)
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
  if (packageId && (homeFeedBlocked || categoryFeedBlocked)) {
    quote = { ok: false as const, error: "placement_not_sellable" };
  } else if (packageId) {
    /** R-70: 견적 조회 오류 = 503 「확인 못 함」 */
    let q: Awaited<ReturnType<typeof quoteDeliveryAdApplicationCommercial>>;
    try {
      q = await quoteDeliveryAdApplicationCommercial(sb, {
        productKind: productKindRaw,
        inventoryKey,
        packageId,
        storeId,
      });
    } catch {
      return NextResponse.json({ ok: false, error: "capacity_check_failed" }, { status: 503 });
    }
    if (q.ok) {
      /** SA-03: 매장 홍보만 — 자리 확인 실패는 화면에 「확인 못 함」(제출도 같은 판정으로 막는다) */
      const slots =
        productKindRaw === "store_sponsored"
          ? await storeSponsoredSlots(sb, { storeId, inventoryKey, target: browseTarget, durationDays: q.durationDays })
          : null;
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
        slots: slots === "check_failed" ? null : slots,
        slotsCheckFailed: slots === "check_failed",
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
