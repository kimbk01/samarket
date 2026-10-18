/**
 * POST /api/me/stores/[storeId]/orders/[orderId]/decide — 매장이 고객 요청(취소·환불)을 승인/반려.
 * Body: { action, reason?, expected_status }  (reason required for rejects)
 * Contract: lib/stores/owner-store-order-decision-contract.ts
 */
import { NextRequest, NextResponse } from "next/server";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { invalidateOwnerHubBadgeCache } from "@/lib/chats/owner-hub-badge-cache";
import { invalidateOwnerDeliverySurfacesAfterMutation } from "@/lib/delivery/owner/invalidate-owner-delivery-surfaces-after-mutation";
import { getStoreIfOwner } from "@/lib/stores/owner-product-gate";
import { isOwnerStoreOrderDecisionAction } from "@/lib/stores/owner-store-order-decision-contract";
import { runOwnerStoreOrderDecision } from "@/lib/stores/owner-store-order-decision";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { action?: unknown; reason?: unknown; expected_status?: unknown };

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ storeId: string; orderId: string }> }
) {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { storeId, orderId } = await context.params;
  const sid = typeof storeId === "string" ? storeId.trim() : "";
  const oid = typeof orderId === "string" ? orderId.trim() : "";
  if (!sid || !oid) return NextResponse.json({ ok: false, error: "missing_ids" }, { status: 400 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (!isOwnerStoreOrderDecisionAction(body.action)) {
    return NextResponse.json({ ok: false, error: "unsupported_action" }, { status: 400 });
  }
  const expected = typeof body.expected_status === "string" ? body.expected_status.trim() : "";
  if (!expected) return NextResponse.json({ ok: false, error: "expected_status_required" }, { status: 400 });

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const gate = await getStoreIfOwner(sb, userId, sid);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });

  const rm = getAuditRequestMeta(req);
  const r = await runOwnerStoreOrderDecision(sb, {
    storeId: sid,
    orderId: oid,
    ownerUserId: userId,
    action: body.action,
    reason: body.reason,
    expectedStatus: expected,
    ip: rm.ip,
    userAgent: rm.userAgent,
  });
  if (!r.ok) {
    return NextResponse.json(
      { ok: false, error: r.error, ...(r.currentStatus ? { current_status: r.currentStatus } : {}) },
      { status: r.httpStatus }
    );
  }

  invalidateOwnerHubBadgeCache(userId);
  invalidateOwnerDeliverySurfacesAfterMutation(sid, userId, {
    route: "POST /api/me/stores/[storeId]/orders/[orderId]/decide",
    orderId: oid,
    reason: `owner_decision_${body.action}`,
    afterMutationSuccess: true,
  });
  return NextResponse.json({ ok: true, from_status: r.fromStatus, order_status: r.toStatus });
}
