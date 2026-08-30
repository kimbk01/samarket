import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { isAdminDeliveryAdProduct } from "@/lib/stores/advertising/admin-delivery-ad-contract";
import { loadAdminDeliveryAdCampaignDetail } from "@/lib/stores/advertising/admin-delivery-ad-loader";
import {
  adminRemoveBannerCreative,
  adminReplaceBannerCreative,
  adminUpdateBannerDestination,
  adminUpdateDeliveryAdInventory,
  adminUpdateDeliveryAdSchedule,
} from "@/lib/stores/advertising/admin-delivery-ad-writer";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { loadDeliveryAdPlacementPreviewBundle } from "@/lib/stores/advertising/load-delivery-ad-placement-preview-bundle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ campaignId: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  const { campaignId } = await ctx.params;
  const productRaw = req.nextUrl.searchParams.get("product");
  const product = isAdminDeliveryAdProduct(productRaw) ? productRaw : null;
  const detail = await loadAdminDeliveryAdCampaignDetail(sb, campaignId, product);
  if (!detail.ok) {
    const status = detail.error === "not_found" ? 404 : 500;
    return NextResponse.json({ ok: false, error: detail.error, detail: detail.detail }, { status });
  }
  let placementPreview = null;
  try {
    const storeId = String(detail.item.storeId ?? "").trim();
    if (storeId) {
      placementPreview = await loadDeliveryAdPlacementPreviewBundle(sb, { storeId });
    }
  } catch {
    placementPreview = null;
  }
  return NextResponse.json({
    ok: true,
    campaign: detail.item,
    audits: detail.audits,
    creative: detail.creative,
    placementPreview,
    pricing: { model: "NOT_CONFIGURED", billing: "NONE" },
  });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
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
  const expectedUpdatedAt = String(body.expectedUpdatedAt ?? "");
  if (!expectedUpdatedAt) {
    return NextResponse.json({ ok: false, error: "stale_updated_at" }, { status: 409 });
  }

  const op = String(body.op ?? "schedule");
  if (op === "inventory") {
    const result = await adminUpdateDeliveryAdInventory(sb, {
      adminUserId: admin.userId,
      productKind: body.productKind,
      campaignId,
      expectedUpdatedAt,
      inventoryKey: String(body.inventoryKey ?? ""),
      reason: body.reason == null ? null : String(body.reason),
    });
    if (!result.ok) {
      const status =
        result.error === "stale_updated_at"
          ? 409
          : result.error === "campaign_not_found"
            ? 404
            : 400;
      return NextResponse.json({ ok: false, error: result.error, detail: result.detail }, { status });
    }
    return NextResponse.json({ ok: true });
  }

  if (op === "replace_creative") {
    if (body.productKind !== "banner") {
      return NextResponse.json({ ok: false, error: "invalid_product" }, { status: 400 });
    }
    const result = await adminReplaceBannerCreative(sb, {
      adminUserId: admin.userId,
      campaignId,
      expectedUpdatedAt,
      assetPath: String(body.assetPath ?? ""),
      sourceWidth: Number(body.sourceWidth ?? 0),
      sourceHeight: Number(body.sourceHeight ?? 0),
      headline: body.headline == null ? null : String(body.headline),
      subcopy: body.subcopy == null ? null : String(body.subcopy),
      reason: body.reason == null ? null : String(body.reason),
    });
    if (!result.ok) {
      const status =
        result.error === "stale_updated_at"
          ? 409
          : result.error === "campaign_not_found"
            ? 404
            : 400;
      return NextResponse.json({ ok: false, error: result.error, detail: result.detail }, { status });
    }
    return NextResponse.json({ ok: true, creativeId: result.creativeId, version: result.version });
  }

  if (op === "remove_creative") {
    if (body.productKind !== "banner") {
      return NextResponse.json({ ok: false, error: "invalid_product" }, { status: 400 });
    }
    const result = await adminRemoveBannerCreative(sb, {
      adminUserId: admin.userId,
      campaignId,
      expectedUpdatedAt,
      reason: body.reason == null ? null : String(body.reason),
    });
    if (!result.ok) {
      const status =
        result.error === "stale_updated_at"
          ? 409
          : result.error === "campaign_not_found"
            ? 404
            : 400;
      return NextResponse.json({ ok: false, error: result.error, detail: result.detail }, { status });
    }
    return NextResponse.json({ ok: true, creativeId: result.creativeId, version: result.version });
  }

  if (op === "destination") {
    if (body.productKind !== "banner") {
      return NextResponse.json({ ok: false, error: "invalid_product" }, { status: 400 });
    }
    const result = await adminUpdateBannerDestination(sb, {
      adminUserId: admin.userId,
      campaignId,
      expectedUpdatedAt,
      ctaType: body.ctaType,
      ctaHref: body.ctaHref == null ? null : String(body.ctaHref),
      reason: body.reason == null ? null : String(body.reason),
    });
    if (!result.ok) {
      const status =
        result.error === "stale_updated_at"
          ? 409
          : result.error === "campaign_not_found"
            ? 404
            : 400;
      return NextResponse.json({ ok: false, error: result.error, detail: result.detail }, { status });
    }
    return NextResponse.json({ ok: true });
  }

  const result = await adminUpdateDeliveryAdSchedule(sb, {
    adminUserId: admin.userId,
    productKind: body.productKind,
    campaignId,
    expectedUpdatedAt,
    startAt: String(body.startAt ?? ""),
    endAt: String(body.endAt ?? ""),
    reason: body.reason == null ? null : String(body.reason),
  });
  if (!result.ok) {
    const status =
      result.error === "stale_updated_at"
        ? 409
        : result.error === "campaign_not_found"
          ? 404
          : 400;
    return NextResponse.json({ ok: false, error: result.error, detail: result.detail }, { status });
  }
  return NextResponse.json({ ok: true });
}
