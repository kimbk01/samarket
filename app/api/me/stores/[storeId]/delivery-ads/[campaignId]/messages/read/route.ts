import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { getStoreIfOwner } from "@/lib/stores/owner-product-gate";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { isDeliveryAdProductKind } from "@/lib/stores/advertising/delivery-ad-domain";
import { markDeliveryAdOperationsRead } from "@/lib/stores/advertising/delivery-ad-operations-unread";
import { loadOwnerBannerCampaign } from "@/lib/stores/advertising/owner-banner-writer";
import { loadOwnerSponsoredCampaign } from "@/lib/stores/advertising/owner-store-sponsored-writer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ storeId: string; campaignId: string }> };

async function resolveProductKind(
  sb: NonNullable<ReturnType<typeof tryGetSupabaseForStores>>,
  campaignId: string,
  ownerUserId: string,
  storeId: string,
  requested: unknown
): Promise<"store_sponsored" | "banner" | null> {
  if (requested === "banner" || requested === "store_sponsored") return requested;
  const sponsored = await loadOwnerSponsoredCampaign(sb, campaignId, ownerUserId);
  if (sponsored.ok && sponsored.row.storeId === storeId) return "store_sponsored";
  const banner = await loadOwnerBannerCampaign(sb, campaignId, ownerUserId);
  if (banner.ok && banner.row.storeId === storeId) return "banner";
  return null;
}

/**
 * POST — mark Delivery Ads operations history as read (Owner cursor only).
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const session = await validateActiveSession(userId);
  if (!session.ok) return session.response;

  const { storeId, campaignId } = await ctx.params;
  const sid = typeof storeId === "string" ? storeId.trim() : "";
  const cid = typeof campaignId === "string" ? campaignId.trim() : "";
  if (!sid || !cid) return NextResponse.json({ ok: false, error: "missing_ids" }, { status: 400 });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const gate = await getStoreIfOwner(sb, userId, sid);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });

  const productKind = await resolveProductKind(
    sb,
    cid,
    userId,
    sid,
    body.productKind ?? body.product_kind
  );
  if (!productKind || !isDeliveryAdProductKind(productKind)) {
    return NextResponse.json({ ok: false, error: "campaign_not_found" }, { status: 404 });
  }

  const result = await markDeliveryAdOperationsRead(sb, {
    actorUserId: userId,
    actorRole: "owner",
    productKind,
    campaignId: cid,
    lastReadMessageId: body.lastReadMessageId ?? body.last_read_message_id,
  });
  if (!result.ok) {
    const status =
      result.error === "forbidden"
        ? 403
        : result.error === "campaign_not_found"
          ? 404
          : result.error === "thread_missing"
            ? 404
            : 400;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }
  return NextResponse.json({
    ok: true,
    threadId: result.threadId,
    lastReadMessageId: result.lastReadMessageId,
    lastReadAt: result.lastReadAt,
  });
}
