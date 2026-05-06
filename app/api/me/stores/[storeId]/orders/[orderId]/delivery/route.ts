import { NextRequest, NextResponse } from "next/server";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { getStoreIfOwner } from "@/lib/stores/owner-product-gate";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { ownerPatchStoreOrderDelivery } from "@/lib/stores/store-order-delivery-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PatchBody = {
  set_delivery_status?: string | null;
};

export async function PATCH(req: NextRequest, context: { params: Promise<{ storeId: string; orderId: string }> }) {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { storeId, orderId } = await context.params;
  const sid = typeof storeId === "string" ? storeId.trim() : "";
  const oid = typeof orderId === "string" ? orderId.trim() : "";
  if (!sid || !oid) return NextResponse.json({ ok: false, error: "missing_ids" }, { status: 400 });

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const gate = await getStoreIfOwner(sb, userId, sid);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });

  const rm = getAuditRequestMeta(req);
  const result = await ownerPatchStoreOrderDelivery(sb, {
    orderId: oid,
    storeId: sid,
    ownerUserId: userId,
    ip: rm.ip,
    user_agent: rm.userAgent,
    setStatus: body.set_delivery_status ?? null,
  });

  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.httpStatus });

  return NextResponse.json({ ok: true, delivery: result.row, previous_status: result.previous_status });
}

