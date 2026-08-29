import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import {
  isAdminDeliveryAdAction,
  isAdminDeliveryAdProduct,
} from "@/lib/stores/advertising/admin-delivery-ad-contract";
import type { DeliveryAdLifecycleStatus } from "@/lib/stores/advertising/delivery-ad-lifecycle";
import {
  adminDeleteSafeDraftDeliveryAdCampaign,
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
          : result.error === "stale_lifecycle" || result.error === "stale_updated_at"
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
            : result.error === "reason_required" || result.error === "illegal_transition"
              ? 422
              : 400;
    return NextResponse.json({ ok: false, error: result.error, detail: result.detail }, { status });
  }

  return NextResponse.json({ ok: true, result });
}
