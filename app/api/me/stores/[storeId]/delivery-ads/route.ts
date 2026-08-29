import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { getStoreIfOwner } from "@/lib/stores/owner-product-gate";
import {
  createOwnerSponsoredDraft,
  listOwnerSponsoredCampaignsForStores,
} from "@/lib/stores/advertising/owner-store-sponsored-writer";
import { DELIVERY_AD_OWNER_PRICING_PRODUCT } from "@/lib/stores/advertising/owner-store-sponsored-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function statusForError(error: string): number {
  switch (error) {
    case "forbidden":
      return 403;
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

export async function GET(_req: Request, context: { params: Promise<{ storeId: string }> }) {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const session = await validateActiveSession(userId);
  if (!session.ok) return session.response;

  const { storeId } = await context.params;
  const sid = typeof storeId === "string" ? storeId.trim() : "";
  if (!sid) return NextResponse.json({ ok: false, error: "missing_store_id" }, { status: 400 });

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const gate = await getStoreIfOwner(sb, userId, sid);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });

  const campaigns = await listOwnerSponsoredCampaignsForStores(sb, userId, [sid]);
  return NextResponse.json({
    ok: true,
    campaigns,
    meta: { pricing: DELIVERY_AD_OWNER_PRICING_PRODUCT },
  });
}

export async function POST(req: NextRequest, context: { params: Promise<{ storeId: string }> }) {
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

  // Never trust client-supplied owner/review/admin fields
  if (
    "owner_user_id" in body ||
    "ownerUserId" in body ||
    "lifecycle_status" in body ||
    "lifecycleStatus" in body ||
    "review_status" in body ||
    "reviewStatus" in body ||
    "is_active" in body
  ) {
    return NextResponse.json({ ok: false, error: "forbidden_fields" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const gate = await getStoreIfOwner(sb, userId, sid);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });

  const result = await createOwnerSponsoredDraft(sb, {
    storeId: sid,
    ownerUserId: userId,
    inventoryKeys: body.inventoryKeys,
    startAtIso: String(body.startAt ?? body.start_at ?? ""),
    endAtIso: String(body.endAt ?? body.end_at ?? ""),
    title: typeof body.title === "string" ? body.title : undefined,
    headline: typeof body.headline === "string" ? body.headline : undefined,
    clientRequestId:
      typeof body.clientRequestId === "string"
        ? body.clientRequestId
        : typeof body.client_request_id === "string"
          ? body.client_request_id
          : null,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: statusForError(result.error) });
  }
  return NextResponse.json(
    { ok: true, campaign: result.row, meta: { pricing: DELIVERY_AD_OWNER_PRICING_PRODUCT } },
    { status: 201 }
  );
}
