import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import {
  isAdminDeliveryAdAction,
  isAdminDeliveryAdProduct,
} from "@/lib/stores/advertising/admin-delivery-ad-contract";
import type { DeliveryAdLifecycleStatus } from "@/lib/stores/advertising/delivery-ad-lifecycle";
import {
  adminDeleteSafeDraftDeliveryAdCampaign,
  adminRefundOrphanDeliveryAdFunding,
  adminTransitionDeliveryAdCampaign,
} from "@/lib/stores/advertising/admin-delivery-ad-writer";
import { DELIVERY_AD_AUDIT_LOG_TABLE } from "@/lib/stores/advertising/delivery-ad-audit";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ campaignId: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { campaignId } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (!isAdminDeliveryAdProduct(body.productKind)) {
    return NextResponse.json({ ok: false, error: "invalid_product" }, { status: 400 });
  }
  /**
   * F-09 — refund orphan SECURED funding on a DRAFT campaign (failed submit transition).
   * Route-only operator action (no UI). Business permission + reason required.
   */
  if (body.action === "refund_orphan_funding") {
    const gate = await requireAdminPermission("business");
    if (!gate.ok) return gate.response;
    const refundReason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!refundReason) {
      return NextResponse.json({ ok: false, error: "reason_required" }, { status: 400 });
    }
    const refund = await adminRefundOrphanDeliveryAdFunding(sb, {
      adminUserId: gate.actor.userId,
      productKind: body.productKind,
      campaignId,
      reason: refundReason,
    });
    if (!refund.ok) {
      const status =
        refund.error === "not_orphan" || refund.error === "not_secured"
          ? 409
          : refund.error === "reason_required" || refund.error === "invalid_product"
            ? 400
            : refund.error === "forbidden" || refund.error === "not_admin"
              ? 403
              : refund.error === "not_found"
                ? 404
                : refund.error === "rpc_missing"
                  ? 503
                  : 500;
      return NextResponse.json(
        { ok: false, error: refund.error, detail: refund.detail ?? null },
        { status }
      );
    }
    return NextResponse.json({ ok: true, result: refund });
  }

  if (!isAdminDeliveryAdAction(body.action)) {
    return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });
  }

  const expectedLifecycle = String(body.expectedLifecycle ?? "") as DeliveryAdLifecycleStatus;
  const expectedUpdatedAt = String(body.expectedUpdatedAt ?? "");
  if (!expectedLifecycle || !expectedUpdatedAt) {
    return NextResponse.json({ ok: false, error: "stale_lifecycle" }, { status: 409 });
  }

  const reason = body.reason == null ? null : String(body.reason);
  const ownerVisibleNotes =
    body.ownerVisibleNotes == null ? null : String(body.ownerVisibleNotes);

  if (body.action === "delete_safe_draft") {
    const { count } = await sb
      .from(DELIVERY_AD_AUDIT_LOG_TABLE)
      .select("id", { count: "exact", head: true })
      .eq("product_kind", body.productKind)
      .eq("campaign_id", campaignId);
    const result = await adminDeleteSafeDraftDeliveryAdCampaign(sb, {
      adminUserId: admin.userId,
      productKind: body.productKind,
      campaignId,
      expectedLifecycle,
      expectedUpdatedAt,
      history: {
        hasImpression: false,
        hasClick: false,
        hasAttribution: false,
        hasBilling: false,
        hasFinancialHistory: false,
        hasAuditHistory: (count ?? 0) > 0,
      },
    });
    if (!result.ok) {
      const status =
        result.error === "delete_not_allowed"
          ? 422
          : result.error === "delete_blocked_funding_secured" ||
              result.error === "stale_lifecycle" ||
              result.error === "stale_updated_at"
            ? 409
            : result.error === "campaign_not_found"
              ? 404
              : 400;
      return NextResponse.json({ ok: false, error: result.error, detail: result.detail }, { status });
    }
    return NextResponse.json({ ok: true, result });
  }

  const result = await adminTransitionDeliveryAdCampaign(sb, {
    adminUserId: admin.userId,
    productKind: body.productKind,
    campaignId,
    action: body.action,
    expectedLifecycle,
    expectedUpdatedAt,
    reason,
    ownerVisibleNotes,
  });

  if (!result.ok) {
    const status =
      result.error === "stale_lifecycle" || result.error === "stale_updated_at"
        ? 409
        : result.error === "forbidden"
          ? 403
          : result.error === "campaign_not_found"
            ? 404
            : result.error === "reason_required" ||
                result.error === "illegal_transition" ||
                result.error === "funding_required"
              ? 422
              : 400;
    return NextResponse.json(
      {
        ok: false,
        error: result.error,
        detail: result.detail,
        ...(result.error === "funding_required"
          ? { reasonKey: "admin_delivery_ad_funding_required" }
          : {}),
      },
      { status }
    );
  }

  return NextResponse.json({ ok: true, result });
}
