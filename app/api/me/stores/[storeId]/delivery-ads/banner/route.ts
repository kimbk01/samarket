import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { getStoreIfOwner } from "@/lib/stores/owner-product-gate";
import { upsertOwnerBannerDraft } from "@/lib/stores/advertising/owner-banner-writer";
import { OWNER_BANNER_PRICING } from "@/lib/stores/advertising/owner-banner-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function statusForError(error: string): number {
  switch (error) {
    case "forbidden":
    case "store_not_eligible":
      return 403;
    case "campaign_not_found":
      return 404;
    case "duplicate_submit":
      return 409;
    case "db_error":
    case "inventory_lookup_failed":
      return 500;
    default:
      return 400;
  }
}

/** POST — create/update Owner Banner draft (atomic RPC). */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ storeId: string }> }
) {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const session = await validateActiveSession(userId);
  if (!session.ok) return session.response;

  const { storeId } = await context.params;
  const sid = typeof storeId === "string" ? storeId.trim() : "";
  if (!sid) return NextResponse.json({ ok: false, error: "missing_store_id" }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (
    "owner_user_id" in body ||
    "ownerUserId" in body ||
    "lifecycle_status" in body ||
    "lifecycleStatus" in body ||
    "review_status" in body ||
    "is_active" in body ||
    "cta_href" in body ||
    "ctaHref" in body
  ) {
    return NextResponse.json({ ok: false, error: "forbidden_fields" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const gate = await getStoreIfOwner(sb, userId, sid);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });

  const adminProducesCreative = body.adminProducesCreative === true || body.admin_produces_creative === true;
  const packageId =
    typeof body.packageId === "string"
      ? body.packageId
      : typeof body.package_id === "string"
        ? body.package_id
        : null;

  const result = await upsertOwnerBannerDraft(sb, {
    storeId: sid,
    ownerUserId: userId,
    campaignId: typeof body.campaignId === "string" ? body.campaignId : null,
    inventoryKey: body.inventoryKey ?? body.inventory_key,
    assetPath: adminProducesCreative
      ? ""
      : String(body.assetPath ?? body.asset_path ?? ""),
    sourceWidth: adminProducesCreative
      ? 390
      : Number(body.sourceWidth ?? body.source_width),
    sourceHeight: adminProducesCreative
      ? 160
      : Number(body.sourceHeight ?? body.source_height),
    headline: typeof body.headline === "string" ? body.headline : null,
    subcopy: typeof body.subcopy === "string" ? body.subcopy : null,
    requestMemo:
      typeof body.requestMemo === "string"
        ? body.requestMemo
        : typeof body.request_memo === "string"
          ? body.request_memo
          : null,
    ctaType: body.ctaType ?? body.cta_type,
    ctaTargetId: sid,
    startAtIso: String(body.startAt ?? body.start_at ?? ""),
    endAtIso: String(body.endAt ?? body.end_at ?? ""),
    adminProducesCreative,
    packageId,
    clientRequestId:
      typeof body.clientRequestId === "string"
        ? body.clientRequestId
        : typeof body.client_request_id === "string"
          ? body.client_request_id
          : null,
    supersedeCreativeId:
      typeof body.supersedeCreativeId === "string"
        ? body.supersedeCreativeId
        : typeof body.supersede_creative_id === "string"
          ? body.supersede_creative_id
          : null,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: statusForError(result.error) }
    );
  }

  return NextResponse.json({
    ok: true,
    campaign: result.row,
    meta: {
      pricing: OWNER_BANNER_PRICING,
      commercial: { chargeCollection: false, businessCash: false },
      adminProducesCreative: true,
    },
  });
}
