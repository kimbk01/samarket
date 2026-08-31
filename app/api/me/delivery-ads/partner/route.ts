import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { getStoreIfOwner } from "@/lib/stores/owner-product-gate";
import { formatDeliveryAdPhpMinor } from "@/lib/stores/advertising/delivery-ad-commercial-labels";
import { DELIVERY_AD_PARTNER_PAYMENT } from "@/lib/stores/advertising/delivery-ad-commercial-contract";
import {
  loadDeliveryAdPartnerConfig,
  loadLatestPartnerMembershipForStore,
  loadOpenPartnerMembershipForStore,
  ownerApplyPartnerMembership,
  ownerRequestPartnerMembershipCancel,
  partnerMembershipAdminFilterLabel,
} from "@/lib/stores/advertising/delivery-ad-partner-membership-writer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * R4 — Owner Partner membership status.
 * GET ?storeId=
 */
export async function GET(req: NextRequest) {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const session = await validateActiveSession(userId);
  if (!session.ok) return session.response;

  const storeId = String(req.nextUrl.searchParams.get("storeId") ?? "").trim();
  if (!storeId) {
    return NextResponse.json({ ok: false, error: "invalid_params" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const gate = await getStoreIfOwner(sb, userId, storeId);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }

  const [config, open, latest] = await Promise.all([
    loadDeliveryAdPartnerConfig(sb),
    loadOpenPartnerMembershipForStore(sb, storeId),
    loadLatestPartnerMembershipForStore(sb, storeId),
  ]);

  const membership = open ?? latest;
  const lang = "ko" as const;

  return NextResponse.json({
    ok: true,
    payment: DELIVERY_AD_PARTNER_PAYMENT,
    config: config
      ? {
          enabled: config.enabled,
          acceptingNewMembers: config.acceptingNewMembers,
          monthlyFeeMinor: config.monthlyFeeMinor,
          monthlyFeeLabel:
            config.monthlyFeeMinor == null
              ? null
              : formatDeliveryAdPhpMinor(config.monthlyFeeMinor),
          advertisingDiscountPercent: config.advertisingDiscountPercent,
          currency: config.currency,
          version: config.version,
        }
      : null,
    membership: membership
      ? {
          id: membership.id,
          status: membership.status,
          statusLabel: partnerMembershipAdminFilterLabel(membership.status, lang),
          periodStart: membership.periodStart,
          periodEnd: membership.periodEnd,
          feeSnapshotMinor: membership.feeSnapshotMinor,
          feeSnapshotLabel:
            membership.feeSnapshotMinor == null
              ? null
              : formatDeliveryAdPhpMinor(membership.feeSnapshotMinor),
          advertisingDiscountPercentSnapshot:
            membership.advertisingDiscountPercentSnapshot,
          cancelRequestedAt: membership.cancelRequestedAt,
        }
      : null,
    canApply:
      Boolean(config?.enabled) &&
      Boolean(config?.acceptingNewMembers) &&
      config?.monthlyFeeMinor != null &&
      !open,
    canRequestCancel: membership?.status === "ACTIVE",
  });
}

/**
 * POST — apply | cancel_request
 * Body: { op, storeId, membershipId? }
 */
export async function POST(req: NextRequest) {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const session = await validateActiveSession(userId);
  if (!session.ok) return session.response;

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  let body: { op?: string; storeId?: string; membershipId?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const storeId = String(body.storeId ?? "").trim();
  const op = String(body.op ?? "").trim();
  if (!storeId || !op) {
    return NextResponse.json({ ok: false, error: "invalid_params" }, { status: 400 });
  }

  const gate = await getStoreIfOwner(sb, userId, storeId);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }

  if (op === "apply") {
    const result = await ownerApplyPartnerMembership(sb, {
      storeId,
      actorUserId: userId,
    });
    if (!result.ok) {
      if (result.error === "INSUFFICIENT_BUSINESS_CASH") {
        return NextResponse.json(
          {
            ok: false,
            error: result.error,
            insufficient: result.insufficient ?? null,
          },
          { status: 402 }
        );
      }
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      membership: result.membership,
      payment: result.payment,
      amountMinor: result.amountMinor,
    });
  }

  if (op === "cancel_request") {
    const membershipId = String(body.membershipId ?? "").trim();
    if (!membershipId) {
      return NextResponse.json({ ok: false, error: "missing_membership_id" }, { status: 400 });
    }
    const result = await ownerRequestPartnerMembershipCancel(sb, {
      storeId,
      membershipId,
      actorUserId: userId,
    });
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, membership: result.membership });
  }

  return NextResponse.json({ ok: false, error: "unknown_op" }, { status: 400 });
}
