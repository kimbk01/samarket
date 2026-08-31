import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  adminCreateDeliveryAdFirstPartyBanner,
  adminCreateDeliveryAdFirstPartyStoreSponsored,
} from "@/lib/stores/advertising/delivery-ad-admin-first-party-writer";
import {
  R4_ADMIN_FIRST_PARTY_BANNER_CREATE_ENABLED,
  R4_STORE_PROMOTION_FIRST_PARTY,
} from "@/lib/stores/advertising/delivery-ad-admin-r3-presentation";
import { isDeliveryAdCtaTarget } from "@/lib/stores/advertising/delivery-ad-creative";
import { DELIVERY_AD_ADMIN_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * R4 — Admin DIBAY first-party Banner create.
 * Store Promotion first-party returns NOT_IMPLEMENTED_MODEL_BLOCKED.
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  if (!R4_ADMIN_FIRST_PARTY_BANNER_CREATE_ENABLED) {
    return NextResponse.json({ ok: false, error: "first_party_disabled" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const product = String(body.product ?? body.productKind ?? "banner").trim();
  if (product === "store_sponsored") {
    const blocked = adminCreateDeliveryAdFirstPartyStoreSponsored();
    return NextResponse.json(
      {
        ok: false,
        error: blocked.error,
        status: blocked.status,
        detail: R4_STORE_PROMOTION_FIRST_PARTY.reason,
      },
      { status: 400 }
    );
  }
  if (product !== "banner") {
    return NextResponse.json({ ok: false, error: "invalid_product" }, { status: 400 });
  }

  const ctaTypeRaw = body.ctaType;
  const ctaType =
    typeof ctaTypeRaw === "string" && isDeliveryAdCtaTarget(ctaTypeRaw) ? ctaTypeRaw : null;

  const result = await adminCreateDeliveryAdFirstPartyBanner(sb, {
    actorUserId: admin.userId,
    inventoryKey: String(body.inventoryKey ?? ""),
    startAt: String(body.startAt ?? ""),
    endAt: String(body.endAt ?? ""),
    assetPath: String(body.assetPath ?? body.imageUrl ?? ""),
    sourceWidth: Number(body.sourceWidth ?? 0),
    sourceHeight: Number(body.sourceHeight ?? 0),
    headline: body.headline == null ? null : String(body.headline),
    subcopy: body.subcopy == null ? null : String(body.subcopy),
    destinationStoreId:
      body.destinationStoreId == null ? null : String(body.destinationStoreId),
    destinationStoreSlug:
      body.destinationStoreSlug == null ? null : String(body.destinationStoreSlug),
    ctaType,
    ctaHref: body.ctaHref == null ? null : String(body.ctaHref),
    title: body.title == null ? null : String(body.title),
    reason: body.reason == null ? undefined : String(body.reason),
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, detail: result.detail },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    campaignId: result.campaignId,
    creativeId: result.creativeId,
    campaignSource: result.campaignSource,
    lifecycleStatus: result.lifecycleStatus,
    detailHref: DELIVERY_AD_ADMIN_ROUTES.detail(result.campaignId),
  });
}
