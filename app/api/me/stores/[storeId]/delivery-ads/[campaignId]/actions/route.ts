import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { getStoreIfOwner, getStoreIfOwnerForOperationalWrite } from "@/lib/stores/owner-product-gate";
import {
  assertSponsoredCampaignCategoryFeedSellable,
  loadOwnerSponsoredCampaign,
  transitionOwnerSponsoredCampaign,
} from "@/lib/stores/advertising/owner-store-sponsored-writer";
import {
  loadOwnerBannerCampaign,
  transitionOwnerBannerCampaign,
} from "@/lib/stores/advertising/owner-banner-writer";
import {
  ownerActionTargetLifecycle,
  type OwnerCampaignAction,
} from "@/lib/stores/advertising/owner-store-sponsored-contract";
import {
  attachOwnerPaidCommercialSnapshotOnSubmit,
  decodeOwnerAdPackagePricingModel,
} from "@/lib/stores/advertising/owner-delivery-ad-commercial-bind";
import type { SecureCanonicalBcFailure } from "@/lib/stores/advertising/canonical-business-cash-writer";
import { clientSafeErrorDetail } from "@/lib/security/internal-error-response";
import { blockIosAppDigitalPurchase } from "@/lib/apple-iap/ios-digital-purchase-gate.server";
import { assertHomeFeedSellableByPolicy, STORES_HOME_FEED_INVENTORY_KEY } from "@/lib/stores/advertising/delivery-ad-home-feed-sell-gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS = new Set<OwnerCampaignAction>(["submit", "resubmit", "pause", "resume", "end"]);

function statusForError(error: string): number {
  switch (error) {
    case "forbidden":
      return 403;
    case "campaign_not_found":
      return 404;
    case "illegal_transition":
    case "duplicate_submit":
    case "quote_stale":
    case "funding_required":
    case "period_ended":
      return 409;
    case "INSUFFICIENT_BUSINESS_CASH":
    case "INSUFFICIENT_STORE_CASH":
      return 402;
    case "capacity_full":
    case "home_ads_disabled":
    case "category_ads_disabled":
      return 409;
    case "capacity_check_failed":
      return 503;
    case "db_error":
    case "commercial_snapshot_failed":
      return 500;
    default:
      return 400;
  }
}

function businessCashFailureResponse(secured: SecureCanonicalBcFailure): NextResponse {
  if (secured.error === "INSUFFICIENT_BUSINESS_CASH" && secured.insufficient) {
    return NextResponse.json(
      {
        ok: false,
        error: "INSUFFICIENT_BUSINESS_CASH",
        availablePhp: secured.insufficient.availablePhp,
        requiredPhp: secured.insufficient.requiredPhp,
        shortagePhp: secured.insufficient.shortagePhp,
        availableMinor: secured.insufficient.availableMinor,
        requiredMinor: secured.insufficient.requiredMinor,
        shortageMinor: secured.insufficient.shortageMinor,
        currency: secured.insufficient.currency,
      },
      { status: 402 }
    );
  }
  return NextResponse.json(
    {
      ok: false,
      error: secured.error,
      detail:
        clientSafeErrorDetail(
          secured.error,
          secured.detail,
          statusForError(secured.error),
          "[owner delivery-ads actions]"
        ) ?? null,
    },
    { status: statusForError(secured.error) }
  );
}

/** V3-04 DEF-7: 원자 함수(차감 + 전이 한 트랜잭션) 미배포 DB — 2단계 폴백 없이 거절 (차감만 되고 제출 실패하는 상태 방지). */
function atomicSubmitMissingResponse(): NextResponse {
  return NextResponse.json({ ok: false, error: "atomic_submit_rpc_missing" }, { status: 503 });
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ storeId: string; campaignId: string }> }
) {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const session = await validateActiveSession(userId);
  if (!session.ok) return session.response;

  const { storeId, campaignId } = await context.params;
  const sid = typeof storeId === "string" ? storeId.trim() : "";
  const cid = typeof campaignId === "string" ? campaignId.trim() : "";
  if (!sid || !cid) return NextResponse.json({ ok: false, error: "missing_ids" }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const action = String(body.action ?? "").trim() as OwnerCampaignAction;
  if (!ACTIONS.has(action)) {
    return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });
  }

  const to = ownerActionTargetLifecycle(action);
  if (!to) return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const gate = await getStoreIfOwnerForOperationalWrite(sb, userId, sid);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });

  /** submit/resubmit = 비즈캐시 차감 + 전이 (V3-04 DEF-7 원자 함수). */
  const isSubmit = action === "submit" || action === "resubmit";
  if (isSubmit) {
    const iosBlocked = blockIosAppDigitalPurchase(req);
    if (iosBlocked) return iosBlocked;
  }

  const productKind =
    body.productKind === "banner" || body.product_kind === "banner" ? "banner" : "store_sponsored";

  /** R-69: 화면 견적에 보인 기간 */
  const clientDurationDays = typeof body.clientDurationDays === "number" ? body.clientDurationDays : null;
  const clientFinalPayableMinor =
    typeof body.clientFinalPayableMinor === "number"
      ? body.clientFinalPayableMinor
      : typeof body.finalPayableMinor === "number"
        ? body.finalPayableMinor
        : null;

  if (productKind === "banner") {
    const loaded = await loadOwnerBannerCampaign(sb, cid, userId);
    if (!loaded.ok) {
      return NextResponse.json(
        { ok: false, error: loaded.error },
        { status: statusForError(loaded.error) }
      );
    }
    if (loaded.row.storeId !== sid) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    if (isSubmit) {
      const packageId =
        (typeof body.packageId === "string" && body.packageId.trim()) ||
        decodeOwnerAdPackagePricingModel(loaded.row.pricingModel);
      const inventoryKey = loaded.row.inventoryKeys[0];
      if (!packageId || !inventoryKey) {
        return NextResponse.json({ ok: false, error: "package_required" }, { status: 400 });
      }
      // ADS-02 — 견적은 인벤토리 1개 기준 → 다중 인벤토리 신청은 제출 거부 (DB 제출 함수도 같은 검사).
      if (loaded.row.inventoryKeys.length !== 1) {
        return NextResponse.json({ ok: false, error: "inventory_single_required" }, { status: 400 });
      }
      const commercial = await attachOwnerPaidCommercialSnapshotOnSubmit(sb, {
        campaignId: cid,
        storeId: sid,
        productKind: "banner",
        inventoryKey,
        packageId,
        clientFinalPayableMinor,
        clientDurationDays,
      });
      if (!commercial.ok) {
        return NextResponse.json(
          {
            ok: false,
            error: commercial.error,
            quoteError: commercial.quoteError ?? null,
            /** SA-04: 진짜 요금 변경일 때만 「다시 확인」 — 판매 중지·위치 꺼짐은 그 이유 문구로 */
            refreshQuote: commercial.error === "quote_stale",
          },
          { status: statusForError(commercial.error) }
        );
      }
    }

    const result = await transitionOwnerBannerCampaign(sb, {
      campaignId: cid,
      ownerUserId: userId,
      action,
      ...(isSubmit ? { secureBusinessCash: { storeId: sid } } : {}),
    });
    // V3-04: 차감 + 전이 = 원자 함수 1번만. 함수가 없으면 2단계로 나누지 않고 거절한다.
    if (!result.ok && result.error === "atomic_submit_rpc_missing") return atomicSubmitMissingResponse();
    if (!result.ok && result.error === "business_cash_failed") {
      return businessCashFailureResponse(result.cash);
    }
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: statusForError(result.error) }
      );
    }
    return NextResponse.json({ ok: true, campaign: result.row });
  }

  const loaded = await loadOwnerSponsoredCampaign(sb, cid, userId);
  if (!loaded.ok) {
    return NextResponse.json({ ok: false, error: loaded.error }, { status: statusForError(loaded.error) });
  }
  if (loaded.row.storeId !== sid) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  if (isSubmit) {
    const packageId =
      (typeof body.packageId === "string" && body.packageId.trim()) ||
      decodeOwnerAdPackagePricingModel(loaded.row.pricingModel);
    const inventoryKey = loaded.row.inventoryKeys[0];
    if (!packageId || !inventoryKey) {
      return NextResponse.json({ ok: false, error: "package_required" }, { status: 400 });
    }
    // ADS-02 — 견적은 인벤토리 1개 기준 → 다중 인벤토리 신청은 제출 거부 (DB 제출 함수도 같은 검사).
    if (loaded.row.inventoryKeys.length !== 1) {
      return NextResponse.json({ ok: false, error: "inventory_single_required" }, { status: 400 });
    }
    /** SA-01: 배달 홈 노출 자리가 꺼져 있으면 제출(요금 기록·차감) 전에 막는다 — 돈 받고 0회 노출 방지 */
    if (inventoryKey === STORES_HOME_FEED_INVENTORY_KEY) {
      const homeGate = await assertHomeFeedSellableByPolicy(sb);
      if (!homeGate.ok) {
        return NextResponse.json({ ok: false, error: homeGate.error }, { status: statusForError(homeGate.error) });
      }
    }
    /** R-21: 업종 목록도 제출 직전에 업종 정책을 다시 본다 — 초안 뒤 어드민이 그 업종 광고를 끄면 차감 전에 막는다 */
    if (inventoryKey === "STORES_CATEGORY_FEED") {
      const categoryGate = await assertSponsoredCampaignCategoryFeedSellable(sb, { campaignId: cid, storeId: sid });
      if (!categoryGate.ok) {
        return NextResponse.json({ ok: false, error: categoryGate.error }, { status: statusForError(categoryGate.error) });
      }
    }
    const commercial = await attachOwnerPaidCommercialSnapshotOnSubmit(sb, {
      campaignId: cid,
      storeId: sid,
      productKind: "store_sponsored",
      inventoryKey,
      packageId,
      clientFinalPayableMinor,
      clientDurationDays,
    });
    if (!commercial.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: commercial.error,
          quoteError: commercial.quoteError ?? null,
          refreshQuote: commercial.error === "quote_stale",
        },
        { status: statusForError(commercial.error) }
      );
    }
  }

  const actionLabel =
    action === "submit"
      ? "submitted"
      : action === "resubmit"
        ? "resubmitted"
        : action === "pause"
          ? "paused_owner"
          : action === "resume"
            ? "resumed_owner"
            : "ended_owner";

  const result = await transitionOwnerSponsoredCampaign(sb, {
    campaignId: cid,
    ownerUserId: userId,
    to,
    actionLabel,
    ...(isSubmit ? { secureBusinessCash: { storeId: sid } } : {}),
  });
  // V3-04: 차감 + 전이 = 원자 함수 1번만. 함수가 없으면 2단계로 나누지 않고 거절한다.
  if (!result.ok && result.error === "atomic_submit_rpc_missing") return atomicSubmitMissingResponse();
  if (!result.ok && result.error === "business_cash_failed") {
    return businessCashFailureResponse(result.cash);
  }

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: statusForError(result.error) });
  }
  return NextResponse.json({ ok: true, campaign: result.row });
}
