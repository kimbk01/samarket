import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { getStoreIfOwner } from "@/lib/stores/owner-product-gate";
import {
  deleteOwnerSponsoredDraft,
  listOwnerCampaignAudits,
  loadOwnerSponsoredCampaign,
  updateOwnerSponsoredDraft,
} from "@/lib/stores/advertising/owner-store-sponsored-writer";
import { loadOwnerBannerCampaign } from "@/lib/stores/advertising/owner-banner-writer";
import { DELIVERY_AD_OWNER_PRICING_PRODUCT } from "@/lib/stores/advertising/owner-store-sponsored-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function statusForError(error: string): number {
  switch (error) {
    case "forbidden":
      return 403;
    case "campaign_not_found":
      return 404;
    case "delete_not_allowed":
    case "not_editable":
    case "illegal_transition":
      return 409;
    case "db_error":
      return 500;
    default:
      return 400;
  }
}

export async function GET(
  _req: Request,
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

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const gate = await getStoreIfOwner(sb, userId, sid);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });

  const loaded = await loadOwnerSponsoredCampaign(sb, cid, userId);
  if (!loaded.ok) {
    const banner = await loadOwnerBannerCampaign(sb, cid, userId);
    if (!banner.ok) {
      return NextResponse.json(
        { ok: false, error: loaded.error },
        { status: statusForError(loaded.error) }
      );
    }
    if (banner.row.storeId !== sid) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
    const history = await listOwnerCampaignAudits(sb, cid, userId);
    return NextResponse.json({
      ok: true,
      campaign: banner.row,
      history,
      meta: { pricing: DELIVERY_AD_OWNER_PRICING_PRODUCT, productKind: "banner" },
    });
  }
  if (loaded.row.storeId !== sid) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const history = await listOwnerCampaignAudits(sb, cid, userId);
  return NextResponse.json({
    ok: true,
    campaign: loaded.row,
    history,
    meta: { pricing: DELIVERY_AD_OWNER_PRICING_PRODUCT, productKind: "store_sponsored" },
  });
}

export async function PATCH(
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

  if (
    "owner_user_id" in body ||
    "lifecycle_status" in body ||
    "review_status" in body ||
    "is_active" in body
  ) {
    return NextResponse.json({ ok: false, error: "forbidden_fields" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const gate = await getStoreIfOwner(sb, userId, sid);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });

  const loaded = await loadOwnerSponsoredCampaign(sb, cid, userId);
  if (!loaded.ok) {
    return NextResponse.json({ ok: false, error: loaded.error }, { status: statusForError(loaded.error) });
  }
  if (loaded.row.storeId !== sid) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const result = await updateOwnerSponsoredDraft(sb, {
    campaignId: cid,
    ownerUserId: userId,
    inventoryKeys: body.inventoryKeys,
    startAtIso:
      typeof body.startAt === "string"
        ? body.startAt
        : typeof body.start_at === "string"
          ? body.start_at
          : undefined,
    endAtIso:
      typeof body.endAt === "string"
        ? body.endAt
        : typeof body.end_at === "string"
          ? body.end_at
          : undefined,
    title: typeof body.title === "string" ? body.title : undefined,
    headline: typeof body.headline === "string" ? body.headline : undefined,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: statusForError(result.error) });
  }
  return NextResponse.json({ ok: true, campaign: result.row });
}

export async function DELETE(
  _req: Request,
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

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const gate = await getStoreIfOwner(sb, userId, sid);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });

  const loaded = await loadOwnerSponsoredCampaign(sb, cid, userId);
  if (!loaded.ok) {
    return NextResponse.json({ ok: false, error: loaded.error }, { status: statusForError(loaded.error) });
  }
  if (loaded.row.storeId !== sid) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const result = await deleteOwnerSponsoredDraft(sb, { campaignId: cid, ownerUserId: userId });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: statusForError(result.error) });
  }
  return NextResponse.json({ ok: true });
}
