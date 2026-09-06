import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { getStoreIfOwner } from "@/lib/stores/owner-product-gate";
import {
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
import { debitBusinessCashForDeliveryAd } from "@/lib/stores/advertising/canonical-business-cash-writer";

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
      return 409;
    case "INSUFFICIENT_BUSINESS_CASH":
    case "INSUFFICIENT_STORE_CASH":
      return 402;
    case "capacity_full":
      return 409;
    case "db_error":
    case "commercial_snapshot_failed":
      return 500;
    default:
      return 400;
  }
}

/** Canonical Cash is secured for commercial spend. */
async function secureBusinessCashBeforeSubmit(input: {
  sb: NonNullable<ReturnType<typeof tryGetSupabaseForStores>>;
  ownerUserId: string;
  storeId: string;
  campaignId: string;
  productKind: "store_sponsored" | "banner";
  campaignSource: string | null | undefined;
}): Promise<NextResponse | null> {
  if (String(input.campaignSource ?? "OWNER_PAID").trim() === "DIBAY_FIRST_PARTY") {
    return null;
  }
  const secured = await debitBusinessCashForDeliveryAd(input.sb, {
    ownerUserId: input.ownerUserId,
    storeId: input.storeId,
    applicationId: input.campaignId,
    productKind: input.productKind,
  });
  if (!secured.ok) {
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
      { ok: false, error: secured.error, detail: secured.detail ?? null },
      { status: statusForError(secured.error) }
    );
  }
  return null;
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

  const gate = await getStoreIfOwner(sb, userId, sid);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });

  const productKind =
    body.productKind === "banner" || body.product_kind === "banner" ? "banner" : "store_sponsored";

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

    if (action === "submit" || action === "resubmit") {
      const packageId =
        (typeof body.packageId === "string" && body.packageId.trim()) ||
        decodeOwnerAdPackagePricingModel(loaded.row.pricingModel);
      const inventoryKey = loaded.row.inventoryKeys[0];
      if (!packageId || !inventoryKey) {
        return NextResponse.json({ ok: false, error: "package_required" }, { status: 400 });
      }
      const commercial = await attachOwnerPaidCommercialSnapshotOnSubmit(sb, {
        campaignId: cid,
        storeId: sid,
        productKind: "banner",
        inventoryKey,
        packageId,
        clientFinalPayableMinor,
      });
      if (!commercial.ok) {
        return NextResponse.json(
          {
            ok: false,
            error: commercial.error,
            quoteError: commercial.quoteError ?? null,
            refreshQuote: true,
          },
          { status: statusForError(commercial.error) }
        );
      }

      const cashBlock = await secureBusinessCashBeforeSubmit({
        sb,
        ownerUserId: userId,
        storeId: sid,
        campaignId: cid,
        productKind: "banner",
        campaignSource: "OWNER_PAID",
      });
      if (cashBlock) return cashBlock;
    }

    const result = await transitionOwnerBannerCampaign(sb, {
      campaignId: cid,
      ownerUserId: userId,
      action,
    });
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

  if (action === "submit" || action === "resubmit") {
    const packageId =
      (typeof body.packageId === "string" && body.packageId.trim()) ||
      decodeOwnerAdPackagePricingModel(loaded.row.pricingModel);
    const inventoryKey = loaded.row.inventoryKeys[0];
    if (!packageId || !inventoryKey) {
      return NextResponse.json({ ok: false, error: "package_required" }, { status: 400 });
    }
    const commercial = await attachOwnerPaidCommercialSnapshotOnSubmit(sb, {
      campaignId: cid,
      storeId: sid,
      productKind: "store_sponsored",
      inventoryKey,
      packageId,
      clientFinalPayableMinor,
    });
    if (!commercial.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: commercial.error,
          quoteError: commercial.quoteError ?? null,
          refreshQuote: true,
        },
        { status: statusForError(commercial.error) }
      );
    }

    const cashBlock = await secureBusinessCashBeforeSubmit({
      sb,
      ownerUserId: userId,
      storeId: sid,
      campaignId: cid,
      productKind: "store_sponsored",
      campaignSource: "OWNER_PAID",
    });
    if (cashBlock) return cashBlock;
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
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: statusForError(result.error) });
  }
  return NextResponse.json({ ok: true, campaign: result.row });
}
