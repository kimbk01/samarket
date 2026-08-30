import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { getStoreIfOwner } from "@/lib/stores/owner-product-gate";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { isDeliveryAdProductKind } from "@/lib/stores/advertising/delivery-ad-domain";
import {
  listDeliveryAdOperationsMessages,
  sendDeliveryAdOperationsMessage,
} from "@/lib/stores/advertising/delivery-ad-operations-messaging";
import { getDeliveryAdOperationsUnread } from "@/lib/stores/advertising/delivery-ad-operations-unread";
import { getDeliveryAdOperationsCase } from "@/lib/stores/advertising/delivery-ad-operations-case-service";
import {
  loadOwnerBannerCampaign,
} from "@/lib/stores/advertising/owner-banner-writer";
import {
  loadOwnerSponsoredCampaign,
} from "@/lib/stores/advertising/owner-store-sponsored-writer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ storeId: string; campaignId: string }> };

function statusFor(error: string): number {
  switch (error) {
    case "forbidden":
      return 403;
    case "campaign_not_found":
      return 404;
    case "invalid_body":
    case "invalid_identity":
      return 400;
    default:
      return 500;
  }
}

async function resolveProductKind(
  sb: NonNullable<ReturnType<typeof tryGetSupabaseForStores>>,
  campaignId: string,
  ownerUserId: string,
  storeId: string,
  requested: unknown
): Promise<"store_sponsored" | "banner" | null> {
  if (requested === "banner" || requested === "store_sponsored") {
    return requested;
  }
  const sponsored = await loadOwnerSponsoredCampaign(sb, campaignId, ownerUserId);
  if (sponsored.ok && sponsored.row.storeId === storeId) return "store_sponsored";
  const banner = await loadOwnerBannerCampaign(sb, campaignId, ownerUserId);
  if (banner.ok && banner.row.storeId === storeId) return "banner";
  return null;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const session = await validateActiveSession(userId);
  if (!session.ok) return session.response;

  const { storeId, campaignId } = await ctx.params;
  const sid = typeof storeId === "string" ? storeId.trim() : "";
  const cid = typeof campaignId === "string" ? campaignId.trim() : "";
  if (!sid || !cid) return NextResponse.json({ ok: false, error: "missing_ids" }, { status: 400 });

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const gate = await getStoreIfOwner(sb, userId, sid);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });

  const url = new URL(req.url);
  const productKind = await resolveProductKind(
    sb,
    cid,
    userId,
    sid,
    url.searchParams.get("productKind") ?? url.searchParams.get("product_kind")
  );
  if (!productKind) {
    return NextResponse.json({ ok: false, error: "campaign_not_found" }, { status: 404 });
  }

  const result = await listDeliveryAdOperationsMessages(sb, {
    actorUserId: userId,
    actorRole: "owner",
    productKind,
    campaignId: cid,
  });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: statusFor(result.error) }
    );
  }

  const caseRes = await getDeliveryAdOperationsCase(sb, {
    productKind,
    campaignId: cid,
  });
  const unreadRes = await getDeliveryAdOperationsUnread(sb, {
    actorUserId: userId,
    actorRole: "owner",
    productKind,
    campaignId: cid,
  });

  return NextResponse.json({
    ok: true,
    caseId: result.caseId,
    threadId: result.threadId,
    caseStatus: caseRes.ok ? caseRes.case.status : null,
    unreadCount: unreadRes.ok ? unreadRes.unreadCount : 0,
    messages: result.messages,
  });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const session = await validateActiveSession(userId);
  if (!session.ok) return session.response;

  const { storeId, campaignId } = await ctx.params;
  const sid = typeof storeId === "string" ? storeId.trim() : "";
  const cid = typeof campaignId === "string" ? campaignId.trim() : "";
  if (!sid || !cid) return NextResponse.json({ ok: false, error: "missing_ids" }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  // Reject client-supplied kind / sender / audit fabrication fields
  if (
    "kind" in body ||
    "senderRole" in body ||
    "sender_role" in body ||
    "senderUserId" in body ||
    "sourceAuditId" in body ||
    "source_audit_id" in body
  ) {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
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

  const result = await sendDeliveryAdOperationsMessage(sb, {
    actorUserId: userId,
    actorRole: "owner",
    productKind,
    campaignId: cid,
    body: body.body ?? body.text,
  });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: statusFor(result.error) }
    );
  }
  return NextResponse.json({
    ok: true,
    message: result.message,
    caseId: result.caseId,
    threadId: result.threadId,
    caseStatus: result.caseStatus,
  });
}
