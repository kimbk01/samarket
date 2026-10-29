import { NextRequest, NextResponse } from "next/server";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import { isAdminDeliveryAdProduct } from "@/lib/stores/advertising/admin-delivery-ad-contract";
import { markDeliveryAdOperationsRead } from "@/lib/stores/advertising/delivery-ad-operations-unread";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ campaignId: string }> };

/**
 * POST — mark Delivery Ads operations history as read (Admin cursor only).
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  // v4 W1 API-03 — 관리자 쓰기 = `business` 권한 키 (같은 도메인 actions·extend 와 동일).
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  const admin = { userId: gate.actor.userId };

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { campaignId } = await ctx.params;
  const cid = typeof campaignId === "string" ? campaignId.trim() : "";
  if (!cid) return NextResponse.json({ ok: false, error: "missing_ids" }, { status: 400 });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  if (!isAdminDeliveryAdProduct(body.productKind)) {
    return NextResponse.json({ ok: false, error: "invalid_product" }, { status: 400 });
  }

  const result = await markDeliveryAdOperationsRead(sb, {
    actorUserId: admin.userId,
    actorRole: "admin",
    productKind: body.productKind,
    campaignId: cid,
    lastReadMessageId: body.lastReadMessageId ?? body.last_read_message_id,
  });
  if (!result.ok) {
    const status =
      result.error === "forbidden"
        ? 403
        : result.error === "campaign_not_found" || result.error === "thread_missing"
          ? 404
          : 400;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }
  await appendAdminRouteAudit(sb, req, {
    actorId: admin.userId,
    targetType: "delivery_ad_operations_thread",
    targetId: cid,
    action: "delivery_ad_operations_thread.mark_read",
    after: {
      productKind: body.productKind,
      threadId: result.threadId,
      lastReadMessageId: result.lastReadMessageId,
    },
  });
  return NextResponse.json({
    ok: true,
    threadId: result.threadId,
    lastReadMessageId: result.lastReadMessageId,
    lastReadAt: result.lastReadAt,
  });
}
